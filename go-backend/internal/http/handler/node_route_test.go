package handler

import (
	"context"
	"errors"
	"testing"
	"time"
)

func hopsOf(ips ...string) []routeHop {
	hops := make([]routeHop, len(ips))
	for i, ip := range ips {
		hops[i] = routeHop{TTL: i + 1, IP: ip, Net: routeHopNet(ip)}
	}
	return hops
}

func TestClassifyRoute(t *testing.T) {
	for want, ips := range map[string][]string{
		"电信 CN2 GIA": {"10.0.0.1", "59.43.180.1", "59.43.246.5", "121.14.50.1"},
		"电信 CN2 GT":  {"202.97.12.1", "59.43.130.1", "113.96.1.1"},
		"电信 163":     {"10.0.0.1", "", "202.97.94.1", "202.97.33.2"},
		"联通 9929":    {"218.105.2.1", "210.51.3.4"},
		"联通 4837":    {"219.158.10.1", "219.158.3.6"},
		"移动 CMI":     {"223.120.2.1", "221.183.55.1"},
		"未识别":        {"10.0.0.1", "", ""},
	} {
		if got := classifyRoute(hopsOf(ips...)); got != want {
			t.Errorf("%v: got %q, want %q", ips, got, want)
		}
	}
}

func TestTraceNodeRoutes(t *testing.T) {
	h, r := setupLatencyHandler(t, `[
		{"name":"电信","host":"ct.example.com","port":80,"enabled":true},
		{"name":"联通","host":"cu.example.com","port":80,"enabled":true}]`)
	node := mustCreateLatencyNode(t, r, "online", 1, 0)
	mustCreateLatencyNode(t, r, "offline", 0, 0)

	old := nodeTraceroute
	t.Cleanup(func() { nodeTraceroute = old })
	calls := 0
	nodeTraceroute = func(_ *Handler, _ int64, host string) (map[string]interface{}, error) {
		calls++
		if host == "cu.example.com" {
			return nil, errors.New("未知命令类型: Traceroute")
		}
		return map[string]interface{}{
			"reached": true,
			"hops": []interface{}{
				map[string]interface{}{"ttl": 1.0, "ip": "10.0.0.1", "rttMs": 0.4},
				map[string]interface{}{"ttl": 2.0},
				map[string]interface{}{"ttl": 3.0, "ip": "59.43.180.1", "rttMs": 150.2},
			},
		}, nil
	}

	results, err := h.traceNodeRoutes(context.Background(), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || len(results) != 1 {
		t.Fatalf("calls=%d results=%v", calls, results)
	}
	got := results[node]
	if got.Points[0].Route != "电信 CN2 GIA" || len(got.Points[0].Hops) != 3 || got.Points[0].Hops[2].Net != "CN2" {
		t.Fatalf("telecom point = %+v", got.Points[0])
	}
	if got.Points[1].Error == "" || got.Points[1].Route != "" {
		t.Fatalf("old agent point = %+v", got.Points[1])
	}

	// Fresh traces are not repeated; force traces again.
	if _, err := h.traceNodeRoutes(context.Background(), nil, false); err != nil || calls != 2 {
		t.Fatalf("fresh trace repeated: calls=%d err=%v", calls, err)
	}
	if _, err := h.traceNodeRoutes(context.Background(), []int64{node}, true); err != nil || calls != 4 {
		t.Fatalf("forced trace: calls=%d err=%v", calls, err)
	}

	// The latency points carry the route name.
	p := h.withRoutes(node, latencyProbe([]latencyPoint{{Name: "电信", OK: true, LatencyMs: 150}}, 1))
	if p.Points[0].Route != "电信 CN2 GIA" {
		t.Fatalf("withRoutes = %+v", p.Points)
	}
}

func TestRouteFresh(t *testing.T) {
	targets := []latencyTarget{{Name: "电信", Host: "a.example.com"}}
	now := time.Now()
	r := nodeRoute{CheckedAt: now.Add(-time.Hour).UnixMilli(), Points: []routePoint{{Name: "电信", host: "a.example.com"}}, agent: "3.3.16"}
	if !routeFresh(r, targets, "3.3.16", now) {
		t.Fatal("an hour-old trace is fresh")
	}
	if routeFresh(r, []latencyTarget{{Name: "电信", Host: "b.example.com"}}, "3.3.16", now) {
		t.Fatal("an edited point must be traced again")
	}
	// An upgraded agent is traced again, even a failure from minutes ago.
	failed := r
	failed.failed = true
	if routeFresh(failed, targets, "3.3.17", now) {
		t.Fatal("a trace by an older agent must not count as fresh")
	}
	r.failed = true
	r.CheckedAt = now.Add(-7 * time.Hour).UnixMilli()
	if routeFresh(r, targets, "3.3.16", now) {
		t.Fatal("a failed trace is retried after six hours")
	}
}

func TestRefineHopNetSplitsCMIN2(t *testing.T) {
	old := hopASNLookup
	t.Cleanup(func() { hopASNLookup = old })
	var asked []string
	hopASNLookup = func(name string) ([]string, error) {
		asked = append(asked, name)
		switch name {
		case "9.22.120.223.origin.asn.cymru.com":
			return []string{"58807 | 223.120.22.0/24 | HK | apnic | 2012-08-21"}, nil
		case "5.6.120.223.origin.asn.cymru.com":
			return []string{"58453 9808 | 223.120.6.0/24 | HK | apnic | 2012-08-21"}, nil
		case "7.7.119.223.origin.asn.cymru.com":
			return nil, errors.New("timeout")
		}
		return nil, nil
	}

	if got := refineHopNet("223.120.22.9", "CMI"); got != "CMIN2" {
		t.Fatalf("AS58807 hop = %q", got)
	}
	if got := refineHopNet("223.120.6.5", "CMI"); got != "CMI" {
		t.Fatalf("AS58453 hop = %q", got)
	}
	if got := refineHopNet("223.119.7.7", "CMI"); got != "CMI" {
		t.Fatalf("failed lookup must stay CMI, got %q", got)
	}
	if got := refineHopNet("59.43.1.1", "CN2"); got != "CN2" || len(asked) != 3 {
		t.Fatalf("non-CMI hops are not looked up: %q, asked %v", got, asked)
	}
	// Answers are cached; failures are asked again.
	refineHopNet("223.120.22.9", "CMI")
	refineHopNet("223.119.7.7", "CMI")
	if len(asked) != 4 {
		t.Fatalf("asked %v", asked)
	}
	if got := classifyRoute([]routeHop{{IP: "223.120.22.9", Net: "CMIN2"}, {IP: "223.120.6.5", Net: "CMI"}}); got != "移动 CMIN2" {
		t.Fatalf("route with a CMIN2 hop = %q", got)
	}
}

func TestTraceNodeRoutesAgainAfterAgentUpgrade(t *testing.T) {
	h, r := setupLatencyHandler(t, `[{"name":"电信","host":"ct.example.com","port":80,"enabled":true}]`)
	node := mustCreateLatencyNode(t, r, "online", 1, 0)
	if err := r.UpdateNodeOnline(node, 1, "3.3.15", 0, 0, 0); err != nil {
		t.Fatal(err)
	}
	old := nodeTraceroute
	t.Cleanup(func() { nodeTraceroute = old })
	upgraded := false
	nodeTraceroute = func(*Handler, int64, string) (map[string]interface{}, error) {
		if !upgraded {
			return nil, errors.New("未知命令类型: Traceroute")
		}
		return map[string]interface{}{"reached": true, "hops": []interface{}{
			map[string]interface{}{"ttl": 1.0, "ip": "202.97.1.1"},
		}}, nil
	}

	got, _ := h.traceNodeRoutes(context.Background(), nil, false)
	if got[node].Points[0].Error == "" {
		t.Fatalf("old agent = %+v", got[node].Points[0])
	}
	// Same agent: the failure is not retried yet.
	if got, _ := h.traceNodeRoutes(context.Background(), nil, false); len(got) != 0 {
		t.Fatalf("retried too soon: %v", got)
	}
	// The node upgrades its agent; the next round traces it again.
	upgraded = true
	if err := r.UpdateNodeOnline(node, 1, "3.3.17", 0, 0, 0); err != nil {
		t.Fatal(err)
	}
	got, _ = h.traceNodeRoutes(context.Background(), nil, false)
	if p := got[node].Points; len(p) != 1 || p[0].Error != "" || p[0].Route != "电信 163" {
		t.Fatalf("after upgrade = %+v", got[node])
	}
}
