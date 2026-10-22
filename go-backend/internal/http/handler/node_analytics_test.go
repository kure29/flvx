package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go-backend/internal/auth"
	"go-backend/internal/http/middleware"
	"go-backend/internal/store/model"
)

func TestNodeQualityUsesRawSamplesAndDoesNotBridgeFailures(t *testing.T) {
	minute := time.Minute.Milliseconds()
	samples := []model.NodeLatencySample{
		{Point: "A", CreatedTime: minute, OK: 1, LatencyMs: 100},
		{Point: "B", CreatedTime: minute, OK: 1, LatencyMs: 900},
		{Point: "A", CreatedTime: 4 * minute, OK: 1, LatencyMs: 300, LossPct: 25},
		{Point: "A", CreatedTime: 7 * minute, LossPct: 100},
		{Point: "A", CreatedTime: 10 * minute, OK: 1, LatencyMs: 500},
		{Point: "A", CreatedTime: 30 * minute, OK: 1, LatencyMs: 600},
		{Point: "A", CreatedTime: 100 * minute, OK: 1, LatencyMs: 9999}, // outside window
	}
	got := buildNodeQuality(samples, 0, 60*minute, 60*minute, nil)
	stats := got.Summary
	if stats.SampleCount != 6 || *stats.AvgMs != 480 || *stats.JitterMs != 200 || *stats.LossPct != 20.8 || *stats.SuccessPct != 79.2 {
		t.Fatalf("summary = %+v", stats)
	}
	if *stats.P50Ms != 500 || *stats.P95Ms != 900 || *stats.P99Ms != 900 {
		t.Fatalf("percentiles must use raw samples: %+v", stats)
	}
	if len(got.Points) != 2 || len(got.Points[0].Samples) != 1 || got.Points[0].Summary.SampleCount != 5 {
		t.Fatalf("chart aggregation = %+v", got.Points)
	}
	if len(got.Events) != 2 || got.Events[0].Name != "B" || *got.Events[0].Ms != 900 || got.Events[1].T != 7*minute {
		t.Fatalf("events = %+v", got.Events)
	}
	selected := buildNodeQuality(samples, 0, 60*minute, minute, []string{"A"})
	if len(selected.Points) != 2 || selected.Summary.SampleCount != 5 || *selected.Summary.AvgMs != 375 || *selected.Summary.P50Ms != 300 {
		t.Fatalf("target selection must retain target list and filter summary: %+v", selected)
	}
}

func TestNodeQualityEmptyAndFailedSamplesAreNotZeroLatency(t *testing.T) {
	for _, rows := range [][]model.NodeLatencySample{nil, {{Point: "A", CreatedTime: 1, LossPct: 100}}} {
		got := buildNodeQuality(rows, 0, 100, 1, nil)
		if got.Summary.AvgMs != nil || got.Summary.P50Ms != nil || got.Summary.JitterMs != nil {
			t.Fatalf("unknown latency must be null: %+v", got.Summary)
		}
		if len(rows) > 0 && (*got.Summary.SuccessPct != 0 || len(got.Events) != 1 || got.Events[0].Ms != nil) {
			t.Fatalf("failed sample = %+v", got)
		}
	}
}

func TestNodeQualityMinuteSamplingAndChartGrain(t *testing.T) {
	minute := time.Minute.Milliseconds()
	samples := []model.NodeLatencySample{
		{Point: "A", CreatedTime: minute / 2, OK: 1, LatencyMs: 100},
		{Point: "A", CreatedTime: minute + minute/2, OK: 1, LatencyMs: 200},
		{Point: "A", CreatedTime: 2*minute + minute/2, OK: 1, LatencyMs: 300},
	}
	for _, interval := range []int64{0, minute, 5 * minute} {
		got := buildNodeQuality(samples, 0, time.Hour.Milliseconds(), interval, nil)
		want := interval
		if want == 0 {
			want = minute
		}
		if got.ProbeIntervalMs != minute || got.IntervalMs != want || got.Summary.SampleCount != 3 {
			t.Fatalf("sampling and aggregation must be independent: %+v", got)
		}
		count := 3
		if interval == 5*minute {
			count = 1
		}
		if len(got.Points) != 1 || len(got.Points[0].Samples) != count || *got.Summary.AvgMs != 200 {
			t.Fatalf("chart grain must preserve raw statistics: %+v", got)
		}
	}
}

func TestNodeTrafficLocalPeriodsMissingAndIdle(t *testing.T) {
	zone := time.FixedZone("CST", 8*3600)
	now := time.Date(2026, 11, 1, 0, 15, 0, 0, zone)
	previous := now.Add(-time.Hour).Truncate(time.Hour).UnixMilli()
	current := now.Truncate(time.Hour).UnixMilli()
	rows := []model.NodeTraffic{{Hour: previous, InBytes: 300, OutBytes: 500}, {Hour: current, InBytes: 0, OutBytes: 0}}
	hours := buildNodeTraffic(rows, now, "hour", 480)
	if len(hours.Buckets) != 24 || hours.Buckets[0].InBytes != nil || !hours.Buckets[0].Partial {
		t.Fatalf("missing hours = %+v", hours)
	}
	idle := hours.Buckets[23]
	if idle.InBytes == nil || *idle.InBytes != 0 || idle.Partial || !idle.Current || idle.T != current {
		t.Fatalf("observed idle hour = %+v", idle)
	}
	days := buildNodeTraffic(rows, now, "day", 480)
	if len(days.Buckets) != 31 || days.Buckets[29].T != time.Date(2026, 10, 31, 0, 0, 0, 0, zone).UnixMilli() || *days.Buckets[29].InBytes != 300 || !days.Buckets[29].Partial || !days.Buckets[30].Current {
		t.Fatalf("local days = %+v", days)
	}
	months := buildNodeTraffic(rows, now, "month", 480)
	if len(months.Buckets) != 12 || *months.Buckets[10].OutBytes != 500 || *months.Buckets[11].OutBytes != 0 || months.Buckets[11].T != current {
		t.Fatalf("local months = %+v", months)
	}
	leap := time.Date(2024, 3, 1, 0, 1, 0, 0, zone)
	if trafficWindow(leap, "day").Day() != 31 || trafficWindow(leap, "day").Month() != time.January {
		t.Fatalf("day window must handle leap February: %s", trafficWindow(leap, "day"))
	}
}

func TestNodeAnalyticsRoutesPermissionsAndIsolation(t *testing.T) {
	h, repo := setupLatencyHandler(t, `[{"name":"A","host":"a.example.com","port":80,"enabled":true}]`)
	mustCreateLatencyNode(t, repo, "one", 1, 0)
	now := time.Now()
	hour := now.Truncate(time.Hour).UnixMilli()
	if err := repo.AddNodeTraffic([]model.NodeTraffic{{NodeID: 1, Hour: hour, InBytes: 40}, {NodeID: 2, Hour: hour, InBytes: 9000}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.InsertNodeLatencySamples([]model.NodeLatencySample{{NodeID: 1, CreatedTime: now.UnixMilli(), Point: "A", OK: 1, LatencyMs: 25}, {NodeID: 2, CreatedTime: now.UnixMilli(), Point: "B", OK: 1, LatencyMs: 999}}); err != nil {
		t.Fatal(err)
	}
	request := func(path string, role int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/monitor/nodes/"+path, nil)
		if role >= 0 {
			req = req.WithContext(context.WithValue(req.Context(), middleware.ClaimsContextKey, auth.Claims{Sub: "1", RoleID: role}))
		}
		w := httptest.NewRecorder()
		h.monitorNodeMetricsHandler(w, req)
		return w
	}
	for _, suffix := range []string{"1/quality?hours=24", "1/traffic?grain=hour&tzOffset=480"} {
		for _, role := range []int{-1, 1} {
			var denied struct {
				Code int `json:"code"`
			}
			w := request(suffix, role)
			if err := json.Unmarshal(w.Body.Bytes(), &denied); err != nil || denied.Code != map[int]int{-1: 401, 1: 403}[role] {
				t.Fatalf("access role=%d: %s", role, w.Body.String())
			}
		}
	}
	var traffic struct {
		Code int             `json:"code"`
		Data nodeTrafficData `json:"data"`
	}
	w := request("1/traffic?grain=hour&tzOffset=480", 0)
	if err := json.Unmarshal(w.Body.Bytes(), &traffic); err != nil || traffic.Code != 0 || *traffic.Data.Buckets[23].InBytes != 40 {
		t.Fatalf("traffic must isolate node: %s", w.Body.String())
	}
	var quality struct {
		Code int             `json:"code"`
		Data nodeQualityData `json:"data"`
	}
	w = request("1/quality?hours=24&interval=5", 0)
	if err := json.Unmarshal(w.Body.Bytes(), &quality); err != nil || quality.Code != 0 || len(quality.Data.Points) != 1 || *quality.Data.Summary.AvgMs != 25 || quality.Data.IntervalMs != 300000 || quality.Data.ProbeIntervalMs != 60000 {
		t.Fatalf("quality must isolate node: %s", w.Body.String())
	}
	for _, path := range []string{"0/quality?hours=24", "1/quality?hours=721", "1/quality?hours=24&interval=2", "1/traffic?grain=year&tzOffset=0", "1/traffic?grain=hour&tzOffset=841"} {
		var result struct {
			Code int `json:"code"`
		}
		w = request(path, 0)
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.Code == 0 {
			t.Fatalf("invalid request accepted: %s: %s", path, w.Body.String())
		}
	}
}

func TestNodeQualityAndHistoryRespectCurrentNodeTargets(t *testing.T) {
	h, repo := setupLatencyHandler(t, testLatencyPool)
	id := mustCreateLatencyNode(t, repo, "selected targets", 1, 0)
	now := time.Now().UnixMilli()
	samples := []model.NodeLatencySample{
		{NodeID: id, CreatedTime: now, Point: "电信", OK: 1, LatencyMs: 20},
		{NodeID: id, CreatedTime: now, Point: "联通", OK: 1, LatencyMs: 40},
		{NodeID: id, CreatedTime: now, Point: "移动", OK: 1, LatencyMs: 60},
		{NodeID: id, CreatedTime: now, Point: "旧目标", OK: 1, LatencyMs: 9999, LossPct: 100},
	}
	if err := repo.InsertNodeLatencySamples(samples); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, choice string
		want         []string
		average      float64
		max          float64
	}{
		{"defaults", "", []string{"电信", "联通"}, 30, 40},
		{"own selection including non-default target", `{"points":["移动"],"pinned":[]}`, []string{"移动"}, 60, 60},
		{"explicitly none", `{"points":[],"pinned":[]}`, nil, 0, 0},
		{"all choices removed uses defaults", `{"points":["旧目标"]}`, []string{"电信", "联通"}, 30, 40},
		{"removed target alongside valid choice", `{"points":["旧目标","移动"]}`, []string{"移动"}, 60, 60},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := repo.SetNodesLatencyTargets([]int64{id}, tc.choice); err != nil {
				t.Fatal(err)
			}
			for _, hours := range []string{"1", "24", "720"} {
				w := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet, "/?hours="+hours+"&interval=5", nil)
				h.handleNodeQuality(w, req, itoa(id))
				var got struct {
					Code int             `json:"code"`
					Data nodeQualityData `json:"data"`
				}
				if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got.Code != 0 {
					t.Fatalf("quality: %s", w.Body.String())
				}
				if len(got.Data.Points) != len(tc.want) || got.Data.Summary.SampleCount != len(tc.want) {
					t.Fatalf("quality includes unselected history: %s", w.Body.String())
				}
				for _, point := range got.Data.Points {
					if !containsString(tc.want, point.Name) {
						t.Fatalf("unselected target %q", point.Name)
					}
				}
				if len(tc.want) > 0 {
					if *got.Data.Summary.AvgMs != tc.average || *got.Data.Summary.P95Ms != tc.max || *got.Data.Summary.LossPct != 0 || len(got.Data.Events) != 1 || *got.Data.Events[0].Ms != tc.max {
						t.Fatalf("unselected history affected statistics/events: %s", w.Body.String())
					}
				} else if got.Data.Summary.AvgMs != nil || len(got.Data.Events) != 0 {
					t.Fatalf("disabled monitoring must show no records: %s", w.Body.String())
				}
			}
			w := httptest.NewRecorder()
			h.nodeLatencyHistory(w, httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"id":`+itoa(id)+`,"hours":24}`)))
			var history struct {
				Code int `json:"code"`
				Data struct {
					Points []trendPoint `json:"points"`
				} `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &history); err != nil || history.Code != 0 || len(history.Data.Points) != len(tc.want) {
				t.Fatalf("legacy history: %s", w.Body.String())
			}
			for _, point := range history.Data.Points {
				if !containsString(tc.want, point.Name) {
					t.Fatalf("legacy history includes unselected target: %q", point.Name)
				}
			}
		})
	}
	// A chart's target query can narrow the node selection, never re-enable it.
	if err := repo.SetNodesLatencyTargets([]int64{id}, `{"points":["移动"]}`); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/?hours=24&target=电信&target=旧目标", nil)
	h.handleNodeQuality(w, req, itoa(id))
	var selected struct {
		Data nodeQualityData `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &selected); err != nil || selected.Data.Summary.SampleCount != 0 || len(selected.Data.Events) != 0 || len(selected.Data.Points) != 1 || selected.Data.Points[0].Name != "移动" {
		t.Fatalf("query must not include unselected targets: %s", w.Body.String())
	}
	stored, err := repo.ListNodeLatencySamples(id, now-1)
	if err != nil || len(stored) != len(samples) {
		t.Fatalf("filtering must preserve stored history: %v, %v", stored, err)
	}
}
