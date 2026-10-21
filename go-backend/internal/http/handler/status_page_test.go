package handler

import (
	"context"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

// Behind a local proxy the counted address is the one the proxy saw, not
// one the client wrote into X-Forwarded-For.
func TestStatusClientIP(t *testing.T) {
	for _, c := range []struct {
		remote, xff, real, want string
	}{
		{"198.51.100.7:4000", "1.2.3.4", "", "198.51.100.7"},
		{"127.0.0.1:4000", "1.2.3.4, 198.51.100.7", "198.51.100.7", "198.51.100.7"},
		{"172.17.0.1:4000", "6.6.6.6, 198.51.100.7, 10.0.0.2", "", "198.51.100.7"},
		{"127.0.0.1:4000", "", "", "127.0.0.1"},
	} {
		r := httptest.NewRequest("GET", "/api/v1/open_api/status/x", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if c.real != "" {
			r.Header.Set("X-Real-IP", c.real)
		}
		if got := statusClientIP(r); got != c.want {
			t.Fatalf("%+v: got %s", c, got)
		}
	}
}

func TestStatusViewLatencyHistory(t *testing.T) {
	h, r, _ := setupNotifyHandler(t)
	if err := r.UpsertConfig(latencyTargetsConfigKey, `[{"name":"电信","host":"ct.example.com","port":80,"enabled":true}]`, time.Now().UnixMilli()); err != nil {
		t.Fatal(err)
	}
	node := mustCreateLatencyNode(t, r, "香港", 1, 0)
	mustCreateLatencyNode(t, r, "日本", 1, 0)
	if err := r.SetNodeStatusPublic(node, true); err != nil {
		t.Fatal(err)
	}
	rounds := []map[string]interface{}{
		{"success": true, "averageTime": 30.0, "packetLoss": 0.0},
		{"success": false, "error": "timeout"},
		{"success": true, "averageTime": 45.0, "packetLoss": 25.0},
	}
	i := 0
	stubLatencyPing(t, func(int64, string) (map[string]interface{}, error) { return rounds[i], nil })
	for i = range rounds {
		if _, err := h.probeNodeLatency(context.Background(), nil); err != nil {
			t.Fatal(err)
		}
	}

	view, err := h.buildStatusView(true, 0, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Nodes) != 1 || len(view.Nodes[0].Latency) != 1 {
		t.Fatalf("view = %+v", view)
	}
	want := [][2]float64{{30, 0}, {0, 100}, {45, 25}}
	if got := view.Nodes[0].Latency[0].Hist; !reflect.DeepEqual(got, want) {
		t.Fatalf("hist = %v, want %v", got, want)
	}
}
