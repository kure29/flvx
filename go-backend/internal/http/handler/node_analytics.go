package handler

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/store/model"
)

// Summaries use original measurements, never the downsampled chart values.
type nodeQualityStats struct {
	AvgMs       *float64 `json:"avgMs"`
	JitterMs    *float64 `json:"jitterMs"`
	LossPct     *float64 `json:"lossPct"`
	SuccessPct  *float64 `json:"successPct"`
	P50Ms       *float64 `json:"p50Ms"`
	P95Ms       *float64 `json:"p95Ms"`
	P99Ms       *float64 `json:"p99Ms"`
	SampleCount int      `json:"sampleCount"`
}

type nodeQualityTarget struct {
	trendPoint
	Summary nodeQualityStats `json:"summary"`
}

type nodeQualityEvent struct {
	Kind    string   `json:"kind"`
	Name    string   `json:"name"`
	T       int64    `json:"t"`
	Ms      *float64 `json:"ms"`
	LossPct float64  `json:"lossPct"`
}

type nodeQualityData struct {
	Since           int64               `json:"since"`
	Until           int64               `json:"until"`
	IntervalMs      int64               `json:"intervalMs"`
	ProbeIntervalMs int64               `json:"probeIntervalMs"`
	Points          []nodeQualityTarget `json:"points"`
	Summary         nodeQualityStats    `json:"summary"`
	Events          []nodeQualityEvent  `json:"events"`
}

func qualityNumber(v float64) *float64 { v = round1(v); return &v }

// Older history was collected every three minutes; retain its adjacent pairs.
const nodeQualityJitterMaxGap = 6 * time.Minute

func summarizeNodeQuality(samples []model.NodeLatencySample) nodeQualityStats {
	stats := nodeQualityStats{SampleCount: len(samples)}
	if len(samples) == 0 {
		return stats
	}
	var latencies []float64
	var sum, loss, jitter float64
	pairs := 0
	previous := map[string]model.NodeLatencySample{}
	for _, s := range samples {
		loss += s.LossPct
		if s.OK != 1 {
			delete(previous, s.Point)
			continue
		}
		latencies = append(latencies, float64(s.LatencyMs))
		sum += float64(s.LatencyMs)
		if prev, ok := previous[s.Point]; ok && s.CreatedTime > prev.CreatedTime &&
			s.CreatedTime-prev.CreatedTime <= nodeQualityJitterMaxGap.Milliseconds() {
			jitter += math.Abs(float64(s.LatencyMs - prev.LatencyMs))
			pairs++
		}
		previous[s.Point] = s
	}
	stats.LossPct = qualityNumber(loss / float64(len(samples)))
	stats.SuccessPct = qualityNumber(100 - loss/float64(len(samples)))
	if len(latencies) > 0 {
		stats.AvgMs = qualityNumber(sum / float64(len(latencies)))
		sort.Float64s(latencies)
		percentile := func(p float64) *float64 {
			return qualityNumber(latencies[int(math.Ceil(p*float64(len(latencies))))-1])
		}
		stats.P50Ms, stats.P95Ms, stats.P99Ms = percentile(.5), percentile(.95), percentile(.99)
	}
	if pairs > 0 {
		stats.JitterMs = qualityNumber(jitter / float64(pairs))
	}
	return stats
}

func buildNodeQuality(samples []model.NodeLatencySample, since, until, interval int64, selected []string) nodeQualityData {
	if interval == 0 {
		interval = max((until-since)/maxTrendPoints, nodeLatencyProbeInterval.Milliseconds())
	}
	data := nodeQualityData{Since: since, Until: until, IntervalMs: interval,
		ProbeIntervalMs: nodeLatencyProbeInterval.Milliseconds(), Points: []nodeQualityTarget{}, Events: []nodeQualityEvent{}}
	byName := map[string][]model.NodeLatencySample{}
	wanted := map[string]bool{}
	for _, name := range selected {
		wanted[name] = true
	}
	var valid, chosen []model.NodeLatencySample
	for _, s := range samples {
		if s.CreatedTime < since || s.CreatedTime > until {
			continue
		}
		valid = append(valid, s)
		byName[s.Point] = append(byName[s.Point], s)
		if len(wanted) == 0 || wanted[s.Point] {
			chosen = append(chosen, s)
		}
	}
	for _, point := range buildTrendBuckets(valid, interval) {
		data.Points = append(data.Points, nodeQualityTarget{point, summarizeNodeQuality(byName[point.Name])})
	}
	data.Summary = summarizeNodeQuality(chosen)
	var slowest, lossiest *model.NodeLatencySample
	for i := range chosen {
		s := &chosen[i]
		if s.OK == 1 && (slowest == nil || s.LatencyMs > slowest.LatencyMs) {
			slowest = s
		}
		if s.LossPct > 0 && (lossiest == nil || s.LossPct > lossiest.LossPct) {
			lossiest = s
		}
	}
	for i, s := range []*model.NodeLatencySample{slowest, lossiest} {
		if s == nil {
			continue
		}
		event := nodeQualityEvent{Kind: []string{"latency", "loss"}[i], Name: s.Point, T: s.CreatedTime, LossPct: s.LossPct}
		if s.OK == 1 {
			event.Ms = qualityNumber(float64(s.LatencyMs))
		}
		data.Events = append(data.Events, event)
	}
	return data
}

func (h *Handler) handleNodeQuality(w http.ResponseWriter, r *http.Request, nodeIDStr string) {
	id, err := strconv.ParseInt(nodeIDStr, 10, 64)
	hours, parseErr := strconv.Atoi(r.URL.Query().Get("hours"))
	if err != nil || id <= 0 || parseErr != nil || hours < 1 || hours > 30*24 {
		response.WriteJSON(w, response.ErrDefault("无效的节点或时间范围"))
		return
	}
	grain := r.URL.Query().Get("interval")
	interval := int64(0)
	switch grain {
	case "", "0":
	case "1", "5":
		n, _ := strconv.ParseInt(grain, 10, 64)
		interval = n * time.Minute.Milliseconds()
	default:
		response.WriteJSON(w, response.ErrDefault("无效的数据粒度"))
		return
	}
	until := time.Now().UnixMilli()
	since := until - int64(hours)*time.Hour.Milliseconds()
	samples, err := h.nodeLatencySamplesForCurrentTargets(id, since)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(buildNodeQuality(samples, since, until, interval, r.URL.Query()["target"])))
}

type nodeTrafficBucket struct {
	T        int64  `json:"t"`
	End      int64  `json:"end"`
	InBytes  *int64 `json:"inBytes"`
	OutBytes *int64 `json:"outBytes"`
	Hours    int    `json:"hours"`
	Partial  bool   `json:"partial"`
	Current  bool   `json:"current"`
}

type nodeTrafficData struct {
	Since    int64               `json:"since"`
	Until    int64               `json:"until"`
	Grain    string              `json:"grain"`
	TZOffset int                 `json:"tzOffset"`
	Buckets  []nodeTrafficBucket `json:"buckets"`
}

func trafficPeriod(t time.Time, grain string) time.Time {
	switch grain {
	case "month":
		return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
	case "day":
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
	default:
		return t.Truncate(time.Hour)
	}
}

func nextTrafficPeriod(t time.Time, grain string) time.Time {
	switch grain {
	case "month":
		return t.AddDate(0, 1, 0)
	case "day":
		return t.AddDate(0, 0, 1)
	default:
		return t.Add(time.Hour)
	}
}

func trafficWindow(now time.Time, grain string) time.Time {
	start := trafficPeriod(now, grain)
	switch grain {
	case "month":
		return start.AddDate(0, -11, 0)
	case "day":
		return start.AddDate(0, 0, -30)
	default:
		return start.Add(-23 * time.Hour)
	}
}

func buildNodeTraffic(rows []model.NodeTraffic, now time.Time, grain string, offset int) nodeTrafficData {
	start := trafficWindow(now, grain)
	data := nodeTrafficData{Since: start.UnixMilli(), Until: now.UnixMilli(), Grain: grain, TZOffset: offset, Buckets: []nodeTrafficBucket{}}
	byPeriod := map[int64][]model.NodeTraffic{}
	for _, row := range rows {
		if row.Hour > now.UnixMilli() {
			continue
		}
		key := trafficPeriod(time.UnixMilli(row.Hour).In(now.Location()), grain).UnixMilli()
		byPeriod[key] = append(byPeriod[key], row)
	}
	for t := start; !t.After(now); t = nextTrafficPeriod(t, grain) {
		end := nextTrafficPeriod(t, grain)
		bucket := nodeTrafficBucket{T: t.UnixMilli(), End: end.UnixMilli(), Current: end.After(now)}
		observed := byPeriod[bucket.T]
		bucket.Hours = len(observed)
		if len(observed) > 0 {
			var in, out int64
			for _, row := range observed {
				in += row.InBytes
				out += row.OutBytes
			}
			bucket.InBytes, bucket.OutBytes = &in, &out
		}
		// The current hour is still accumulating. Missing recorded hours leave a partial sum.
		expected := int(end.Sub(t) / time.Hour)
		if bucket.Current {
			expected = int(now.Sub(t)/time.Hour) + 1
		}
		bucket.Partial = len(observed) < expected
		data.Buckets = append(data.Buckets, bucket)
	}
	return data
}

func (h *Handler) handleNodeTraffic(w http.ResponseWriter, r *http.Request, nodeIDStr string) {
	id, err := strconv.ParseInt(nodeIDStr, 10, 64)
	grain := r.URL.Query().Get("grain")
	offset, offsetErr := strconv.Atoi(r.URL.Query().Get("tzOffset"))
	if err != nil || id <= 0 || offsetErr != nil || offset < -14*60 || offset > 14*60 ||
		(grain != "hour" && grain != "day" && grain != "month") {
		response.WriteJSON(w, response.ErrDefault("无效的节点、统计周期或时区"))
		return
	}
	now := time.Now().In(time.FixedZone("statistics", offset*60))
	start := trafficWindow(now, grain)
	rows, err := h.repo.ListNodeTraffic(id, start.Truncate(time.Hour).UnixMilli(), now.UnixMilli()+1)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(buildNodeTraffic(rows, now, grain, offset)))
}
