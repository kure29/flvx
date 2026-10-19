package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/store/model"
)

// latencyTargetsConfigKey holds the reference points nodes measure their
// latency to, as a JSON array of latencyTarget. Empty means none.
const latencyTargetsConfigKey = "latency_targets"

const (
	maxLatencyTargets       = 10
	maxPinnedLatencyTargets = 3
	maxLatencyTargetName    = 20
	latencyPingCount        = 4
	latencyPingTimeoutMS    = 2000
	latencyParallel         = 16
)

// latencyTarget is one reference point, e.g. a province's carrier CDN node.
// Pinned points are the ones cards show first.
type latencyTarget struct {
	Name    string `json:"name"`
	Host    string `json:"host"`
	Port    int    `json:"port"`
	Enabled bool   `json:"enabled"`
	Pinned  bool   `json:"pinned,omitempty"`
}

// latencyPoint is a node's latency to one reference point.
type latencyPoint struct {
	Name      string  `json:"name"`
	Pinned    bool    `json:"pinned,omitempty"`
	OK        bool    `json:"ok"`
	LatencyMs int64   `json:"latencyMs,omitempty"`
	LossPct   float64 `json:"lossPct,omitempty"`
	Error     string  `json:"error,omitempty"`
}

// parseLatencyTargets validates and normalizes the configured reference
// points; an empty value is no points.
func parseLatencyTargets(raw string) ([]latencyTarget, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var targets []latencyTarget
	if err := json.Unmarshal([]byte(raw), &targets); err != nil {
		return nil, errors.New("测试点格式无效")
	}
	if len(targets) > maxLatencyTargets {
		return nil, fmt.Errorf("测试点最多 %d 个", maxLatencyTargets)
	}
	names := make(map[string]bool, len(targets))
	pinned := 0
	for i := range targets {
		t := &targets[i]
		t.Name = strings.TrimSpace(t.Name)
		if t.Name == "" || len([]rune(t.Name)) > maxLatencyTargetName {
			return nil, fmt.Errorf("测试点名称不能为空且不超过 %d 字", maxLatencyTargetName)
		}
		if names[t.Name] {
			return nil, fmt.Errorf("测试点名称重复：%s", t.Name)
		}
		names[t.Name] = true
		target, _, err := normalizeTunnelProbeTarget(t.Host, t.Port)
		if err != nil || strings.TrimSpace(t.Host) == "" {
			return nil, fmt.Errorf("测试点 %s：地址无效", t.Name)
		}
		t.Host, t.Port = target.Host, target.Port
		if t.Pinned {
			pinned++
		}
	}
	if pinned > maxPinnedLatencyTargets {
		return nil, fmt.Errorf("卡片最多固定显示 %d 个测试点", maxPinnedLatencyTargets)
	}
	return targets, nil
}

func normalizeLatencyTargetsConfig(raw string) (string, error) {
	targets, err := parseLatencyTargets(raw)
	if err != nil {
		return "", err
	}
	if len(targets) == 0 {
		return "", nil
	}
	b, err := json.Marshal(targets)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (h *Handler) latencyTargets() []latencyTarget {
	raw, err := h.repo.GetViteConfigValue(latencyTargetsConfigKey)
	if err != nil {
		return nil
	}
	targets, err := parseLatencyTargets(raw)
	if err != nil {
		return nil
	}
	enabled := targets[:0]
	for _, t := range targets {
		if t.Enabled {
			enabled = append(enabled, t)
		}
	}
	return enabled
}

// nodeLatencyStore keeps each node's last measurement.
type nodeLatencyStore struct {
	mu      sync.RWMutex
	results map[int64]reachProbe
}

func newNodeLatencyStore() *nodeLatencyStore {
	return &nodeLatencyStore{results: make(map[int64]reachProbe)}
}

func (s *nodeLatencyStore) get(nodeID int64) (reachProbe, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.results[nodeID]
	return p, ok
}

// replace stores fresh results; a full round also drops nodes it skipped
// (offline, remote, or no reference points configured).
func (s *nodeLatencyStore) replace(results map[int64]reachProbe, all bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if all {
		s.results = make(map[int64]reachProbe, len(results))
	}
	for id, p := range results {
		s.results[id] = p
	}
}

// nodeLatencyPing runs one TcpPing from a node; tests replace it.
var nodeLatencyPing = func(h *Handler, nodeID int64, host string, port int) (map[string]interface{}, error) {
	return h.tcpPingViaNode(nodeID, host, port, diagnosisExecOptions{
		commandTimeout: time.Duration(latencyPingCount*(latencyPingTimeoutMS+200))*time.Millisecond + 5*time.Second,
		pingTimeoutMS:  latencyPingTimeoutMS,
		pingCount:      latencyPingCount,
	})
}

func latencyPointFrom(t latencyTarget, data map[string]interface{}, err error) latencyPoint {
	p := latencyPoint{Name: t.Name, Pinned: t.Pinned}
	if err != nil {
		p.Error = "节点无响应"
		return p
	}
	if !asBool(data["success"], false) {
		msg := asString(data["errorMessage"])
		switch {
		case strings.Contains(msg, "DNS"):
			p.Error = "域名解析失败"
		default:
			p.Error = "超时"
		}
		return p
	}
	p.OK = true
	p.LatencyMs = int64(asFloat(data["averageTime"], 0) + 0.5)
	if p.LatencyMs < 1 {
		p.LatencyMs = 1
	}
	p.LossPct = float64(int(asFloat(data["packetLoss"], 0) + 0.5))
	return p
}

// probeNodeLatency measures the given local nodes' latency (all online ones
// when ids is empty) to every enabled reference point and records it.
func (h *Handler) probeNodeLatency(ctx context.Context, ids []int64) (map[int64]reachProbe, error) {
	nodes, err := h.repo.ListMonitorNodes()
	if err != nil {
		return nil, err
	}
	targets := h.latencyTargets()
	want := make(map[int64]bool, len(ids))
	for _, id := range ids {
		want[id] = true
	}
	var live []model.Node
	for _, n := range nodes {
		if (len(ids) == 0 || want[n.ID]) && n.Status == 1 {
			live = append(live, n)
		}
	}

	results := make(map[int64]reachProbe, len(live))
	if len(targets) > 0 {
		points := make(map[int64][]latencyPoint, len(live))
		for _, n := range live {
			points[n.ID] = make([]latencyPoint, len(targets))
		}
		var wg sync.WaitGroup
		sem := make(chan struct{}, latencyParallel)
		for _, n := range live {
			for i, t := range targets {
				if ctx.Err() != nil {
					break
				}
				wg.Add(1)
				sem <- struct{}{}
				go func(nodeID int64, i int, t latencyTarget) {
					defer wg.Done()
					defer func() { <-sem }()
					data, err := nodeLatencyPing(h, nodeID, t.Host, t.Port)
					// Each goroutine writes its own slot.
					points[nodeID][i] = latencyPointFrom(t, data, err)
				}(n.ID, i, t)
			}
		}
		wg.Wait()
		now := time.Now().UnixMilli()
		for _, n := range live {
			results[n.ID] = latencyProbe(points[n.ID], now)
		}
	}
	h.nodeLatency.replace(results, len(ids) == 0)
	return results, nil
}

// latencyProbe summarizes a node's points: OK when any point answered,
// with the worst answering point's latency.
func latencyProbe(points []latencyPoint, checkedAt int64) reachProbe {
	p := reachProbe{CheckedAt: checkedAt, Points: points}
	for _, pt := range points {
		if pt.OK {
			p.OK = true
			if pt.LatencyMs > p.LatencyMs {
				p.LatencyMs = pt.LatencyMs
			}
		}
	}
	if !p.OK {
		p.Error = "测试点都连不上"
	}
	return p
}

// inboundProbeView is what the inbound list shows: a built inbound takes
// its node's latency to the reference points, unless the panel found its
// port down; others keep the panel's reachability check.
func (h *Handler) inboundProbeView(row *model.NodeInbound) *reachProbe {
	reach, hasReach := h.reachProbes.get(row.ID)
	if !isExternalInbound(row) {
		if node, ok := h.nodeLatency.get(row.NodeID); ok && len(node.Points) > 0 {
			if hasReach && !reach.Skipped && !reach.OK {
				return &reach
			}
			view := node
			view.OK, view.Error = true, ""
			return &view
		}
	}
	if !hasReach {
		return nil
	}
	return &reach
}

// onLatencyConfigChanged re-measures every node when the reference points
// change, so cards do not keep showing removed points until the next round.
func (h *Handler) onLatencyConfigChanged(key string) {
	if strings.TrimSpace(key) != latencyTargetsConfigKey {
		return
	}
	h.jobsMu.Lock()
	ctx := h.jobsCtx
	h.jobsMu.Unlock()
	if ctx == nil {
		return
	}
	go func() {
		if _, err := h.probeNodeLatency(ctx, nil); err != nil && ctx.Err() == nil {
			log.Printf("node latency probe failed: %v", err)
		}
	}()
}

// nodeLatencyProbe measures the given nodes now (all of them when empty).
func (h *Handler) nodeLatencyProbe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	if len(h.latencyTargets()) == 0 {
		response.WriteJSON(w, response.ErrDefault("还没有设置延迟测试点，请到网站配置添加"))
		return
	}
	results, err := h.probeNodeLatency(r.Context(), req.IDs)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	out := make(map[string]reachProbe, len(results))
	for id, p := range results {
		out[strconv.FormatInt(id, 10)] = p
	}
	response.WriteJSON(w, response.OK(out))
}
