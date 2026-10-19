package handler

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"go-backend/internal/http/response"
)

// Return routes: each node traces the route to every reference point and the
// backbone networks on it name the line (CN2 GIA, 163, 9929, CMI ...).
const (
	routeRefreshInterval = 24 * time.Hour
	// Failed traces (old agent, no raw socket) are retried sooner.
	routeRetryInterval  = 6 * time.Hour
	routeCommandTimeout = 20 * time.Second
	routeParallel       = 4
)

// Backbone prefixes seen on return routes into China.
var routeBackbones = []struct {
	prefix string
	net    string
}{
	{"59.43.", "CN2"},
	{"202.97.", "163"},
	{"219.158.", "4837"},
	{"218.105.", "9929"},
	{"210.51.", "9929"},
	{"223.118.", "CMI"},
	{"223.119.", "CMI"},
	{"223.120.", "CMI"},
	{"223.121.", "CMI"},
}

// routeHopNet names the backbone an address belongs to, or "".
func routeHopNet(ip string) string {
	for _, b := range routeBackbones {
		if strings.HasPrefix(ip, b.prefix) {
			return b.net
		}
	}
	return ""
}

// China Mobile's international networks share address space, so CMI hops
// are told apart by origin AS: AS58807 is CMIN2, AS58453 CMI. Team Cymru's
// DNS service answers "58807 | 223.x.x.0/24 | HK | apnic | ..." for
// d.c.b.a.origin.asn.cymru.com.
var (
	hopASNMu    sync.Mutex
	hopASNCache = make(map[string]string)
)

// hopASNLookup returns the TXT records for an origin AS query; tests
// replace it.
var hopASNLookup = func(name string) ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return net.DefaultResolver.LookupTXT(ctx, name)
}

func hopOriginASN(ip string) string {
	hopASNMu.Lock()
	asn, ok := hopASNCache[ip]
	hopASNMu.Unlock()
	if ok {
		return asn
	}
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return ""
	}
	txt, err := hopASNLookup(parts[3] + "." + parts[2] + "." + parts[1] + "." + parts[0] + ".origin.asn.cymru.com")
	if err != nil {
		return "" // not cached, so a later trace asks again
	}
	if len(txt) > 0 {
		// A prefix announced by several ASes lists them space-separated.
		if f := strings.Fields(strings.SplitN(txt[0], "|", 2)[0]); len(f) > 0 {
			asn = f[0]
		}
	}
	hopASNMu.Lock()
	hopASNCache[ip] = asn
	hopASNMu.Unlock()
	return asn
}

// refineHopNet splits CMI hops into CMI and CMIN2 by origin AS; others
// keep their prefix match.
func refineHopNet(ip, prefixNet string) string {
	if prefixNet != "CMI" {
		return prefixNet
	}
	if hopOriginASN(ip) == "58807" {
		return "CMIN2"
	}
	return "CMI"
}

// classifyRoute names a return route from the backbones its hops cross.
func classifyRoute(hops []routeHop) string {
	seen := make(map[string]bool)
	for _, h := range hops {
		if h.Net != "" {
			seen[h.Net] = true
		}
	}
	switch {
	case seen["CN2"] && !seen["163"]:
		return "电信 CN2 GIA"
	case seen["CN2"]:
		return "电信 CN2 GT"
	case seen["163"]:
		return "电信 163"
	case seen["9929"]:
		return "联通 9929"
	case seen["4837"]:
		return "联通 4837"
	case seen["CMIN2"]:
		return "移动 CMIN2"
	case seen["CMI"]:
		return "移动 CMI"
	}
	return "未识别"
}

type routeHop struct {
	TTL   int     `json:"ttl"`
	IP    string  `json:"ip,omitempty"`
	RttMs float64 `json:"rttMs,omitempty"`
	Net   string  `json:"net,omitempty"`
}

type routePoint struct {
	Name    string     `json:"name"`
	Route   string     `json:"route,omitempty"`
	Reached bool       `json:"reached"`
	Hops    []routeHop `json:"hops,omitempty"`
	Error   string     `json:"error,omitempty"`
	// host is the address traced, so an edited point is traced again.
	host string
}

type nodeRoute struct {
	CheckedAt int64        `json:"checkedAt"`
	Points    []routePoint `json:"points"`
	failed    bool
}

type nodeRouteStore struct {
	mu      sync.RWMutex
	results map[int64]nodeRoute
}

func newNodeRouteStore() *nodeRouteStore {
	return &nodeRouteStore{results: make(map[int64]nodeRoute)}
}

func (s *nodeRouteStore) get(nodeID int64) (nodeRoute, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.results[nodeID]
	return r, ok
}

func (s *nodeRouteStore) set(nodeID int64, r nodeRoute) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.results[nodeID] = r
}

// nodeTraceroute runs one Traceroute from a node; tests replace it.
var nodeTraceroute = func(h *Handler, nodeID int64, host string) (map[string]interface{}, error) {
	res, err := h.sendNodeCommandWithTimeout(nodeID, "Traceroute", map[string]interface{}{
		"host": host,
	}, routeCommandTimeout, false, false)
	if err != nil {
		return nil, err
	}
	return res.Data, nil
}

func routePointFrom(t latencyTarget, data map[string]interface{}, err error) routePoint {
	p := routePoint{Name: t.Name, host: t.Host}
	if err != nil {
		msg := err.Error()
		switch {
		case strings.Contains(msg, "未知命令"):
			p.Error = "节点 agent 版本过旧，升级后可检测回程"
		case strings.Contains(msg, "NET_RAW"):
			p.Error = "节点没有 root / NET_RAW 权限"
		case strings.Contains(msg, "DNS"):
			p.Error = "域名解析失败"
		default:
			p.Error = "检测失败"
		}
		return p
	}
	p.Reached = asBool(data["reached"], false)
	rawHops, _ := data["hops"].([]interface{})
	for _, raw := range rawHops {
		m, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		ip := asString(m["ip"])
		if ip != "" && net.ParseIP(ip) == nil {
			ip = ""
		}
		p.Hops = append(p.Hops, routeHop{
			TTL:   int(asInt64(m["ttl"], 0)),
			IP:    ip,
			RttMs: asFloat(m["rttMs"], 0),
			Net:   refineHopNet(ip, routeHopNet(ip)),
		})
	}
	p.Route = classifyRoute(p.Hops)
	return p
}

// traceNodeRoutes traces the given local online nodes (all when ids is
// empty) to every enabled reference point. With force false it skips nodes
// whose last trace is fresh and covers the current points.
func (h *Handler) traceNodeRoutes(ctx context.Context, ids []int64, force bool) (map[int64]nodeRoute, error) {
	nodes, err := h.repo.ListMonitorNodes()
	if err != nil {
		return nil, err
	}
	pool := h.latencyPool()
	if len(pool) == 0 {
		return map[int64]nodeRoute{}, nil
	}
	want := make(map[int64]bool, len(ids))
	for _, id := range ids {
		want[id] = true
	}
	now := time.Now()
	todo := make(map[int64][]latencyTarget)
	for _, n := range nodes {
		if n.Status != 1 || (len(ids) > 0 && !want[n.ID]) {
			continue
		}
		targets := targetsForNode(pool, n.LatencyTargets)
		if len(targets) == 0 {
			continue
		}
		if !force {
			if r, ok := h.nodeRoutes.get(n.ID); ok && routeFresh(r, targets, now) {
				continue
			}
		}
		todo[n.ID] = targets
	}

	results := make(map[int64]nodeRoute, len(todo))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, routeParallel)
	for id, targets := range todo {
		if ctx.Err() != nil {
			break
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(nodeID int64, targets []latencyTarget) {
			defer wg.Done()
			defer func() { <-sem }()
			r := nodeRoute{Points: make([]routePoint, len(targets))}
			// One trace at a time per node keeps the agent's raw socket quiet.
			for i, t := range targets {
				data, err := nodeTraceroute(h, nodeID, t.Host)
				r.Points[i] = routePointFrom(t, data, err)
				if r.Points[i].Error != "" {
					r.failed = true
				}
			}
			r.CheckedAt = time.Now().UnixMilli()
			h.nodeRoutes.set(nodeID, r)
			mu.Lock()
			results[nodeID] = r
			mu.Unlock()
		}(id, targets)
	}
	wg.Wait()
	return results, nil
}

// routeFresh reports whether a stored trace is recent and was made to the
// points the node measures now.
func routeFresh(r nodeRoute, targets []latencyTarget, now time.Time) bool {
	if len(r.Points) != len(targets) {
		return false
	}
	for i, t := range targets {
		if r.Points[i].Name != t.Name || r.Points[i].host != t.Host {
			return false
		}
	}
	every := routeRefreshInterval
	if r.failed {
		every = routeRetryInterval
	}
	return now.Sub(time.UnixMilli(r.CheckedAt)) < every
}

// withRoutes adds each point's return route name to a latency result.
func (h *Handler) withRoutes(nodeID int64, p reachProbe) reachProbe {
	r, ok := h.nodeRoutes.get(nodeID)
	if !ok || len(p.Points) == 0 {
		return p
	}
	routes := make(map[string]string, len(r.Points))
	for _, rp := range r.Points {
		routes[rp.Name] = rp.Route
	}
	points := make([]latencyPoint, len(p.Points))
	for i, pt := range p.Points {
		pt.Route = routes[pt.Name]
		points[i] = pt
	}
	p.Points = points
	return p
}

// nodeRouteGet returns a node's last traces with every hop.
func (h *Handler) nodeRouteGet(w http.ResponseWriter, r *http.Request) {
	h.nodeRouteRespond(w, r, false)
}

// nodeRouteProbe traces a node's return routes now.
func (h *Handler) nodeRouteProbe(w http.ResponseWriter, r *http.Request) {
	h.nodeRouteRespond(w, r, true)
}

func (h *Handler) nodeRouteRespond(w http.ResponseWriter, r *http.Request, probe bool) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		ID int64 `json:"id"`
	}
	if err := decodeJSON(r.Body, &req); err != nil || req.ID <= 0 {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	if probe {
		if len(h.latencyPool()) == 0 {
			response.WriteJSON(w, response.ErrDefault("还没有设置延迟测试点，请到网站配置添加"))
			return
		}
		if _, err := h.traceNodeRoutes(r.Context(), []int64{req.ID}, true); err != nil {
			response.WriteJSON(w, response.Err(-2, err.Error()))
			return
		}
	}
	route, ok := h.nodeRoutes.get(req.ID)
	if !ok {
		response.WriteJSON(w, response.OK(nil))
		return
	}
	response.WriteJSON(w, response.OK(route))
}
