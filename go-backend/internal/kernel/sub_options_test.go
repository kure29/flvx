package kernel

import (
	"encoding/json"
	"strings"
	"testing"
)

func namedEndpoints(names ...string) []Endpoint {
	out := make([]Endpoint, len(names))
	for i, n := range names {
		out[i] = Endpoint{Name: n, Host: "203.0.113.1", Port: 8388 + i, Inbound: Inbound{
			ID: int64(i + 1), Protocol: ProtocolShadowsocks,
			Settings: Settings{Method: "aes-256-gcm", Password: "pw"},
		}}
	}
	return out
}

func endpointNames(eps []Endpoint) []string {
	out := make([]string, len(eps))
	for i, e := range eps {
		out[i] = e.Name
	}
	return out
}

func TestApplySubOptionsRenameAndSort(t *testing.T) {
	eps := namedEndpoints("花云|香港🇭🇰|1.0x|10", "花云|香港🇭🇰|1.0x|2", "花云|日本🇯🇵|0.2x|01")
	got := endpointNames(ApplySubOptions(eps, SubOptions{
		Rename: "花云| => \n/\\|[0-9.]+x/ => \n# comment\n| => -",
		Prefix: "[我] ",
		Sort:   "name",
	}))
	want := []string{"[我] 日本🇯🇵-01", "[我] 香港🇭🇰-2", "[我] 香港🇭🇰-10"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("got %v want %v", got, want)
	}

	// A rule that empties a name keeps the original.
	if got := endpointNames(ApplySubOptions(namedEndpoints("abc"), SubOptions{Rename: "abc =>"})); got[0] != "abc" {
		t.Fatalf("empty name: %v", got)
	}
	if _, err := ParseRenameRules("ok => x\n/[/ => y"); err == nil || !strings.Contains(err.Error(), "第 2 行") {
		t.Fatalf("bad regex must name its line: %v", err)
	}
}

// The subscription editor writes every rename rule as "/regex/ => repl",
// escaping plain-text rules saved before. Those must rename exactly like the
// plain-text form did, and $1 must expand to the group.
func TestRenameRulesAsEditorWritesThem(t *testing.T) {
	names := []string{"花云|香港🇭🇰|1.0x|10", "花云|日本🇯🇵|0.2x|01"}
	legacy := endpointNames(ApplySubOptions(namedEndpoints(names...), SubOptions{
		Rename: "花云| =>\n/\\|[0-9.]+x/ =>\n| => -",
	}))
	editor := endpointNames(ApplySubOptions(namedEndpoints(names...), SubOptions{
		Rename: "/花云\\|/ => \n/\\|[0-9.]+x/ => \n/\\|/ => -",
	}))
	if strings.Join(editor, ",") != strings.Join(legacy, ",") {
		t.Fatalf("editor rules %v, legacy rules %v", editor, legacy)
	}

	got := endpointNames(ApplySubOptions(namedEndpoints("HK-01"), SubOptions{
		Rename: "/^([A-Z]+)-(\\d+)$/ => $2 $1",
	}))
	if got[0] != "01 HK" {
		t.Fatalf("group reference: %v", got)
	}
}

func TestRegionOf(t *testing.T) {
	cases := map[string]string{
		"花云|香港🇭🇰|1.0x|01":     "🇭🇰 香港",
		"🇯🇵 Tokyo 01":         "🇯🇵 日本",
		"US-LosAngeles":       "🇺🇸 美国",
		"SG 2":                "🇸🇬 新加坡",
		"Taiwan HiNet":        "🇹🇼 台湾",
		"Plus 1":              "",
		"Russia Moscow":       "🇷🇺 俄罗斯",
		"Business usage line": "",
	}
	for name, want := range cases {
		if got := RegionOf(name); got != want {
			t.Errorf("RegionOf(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestSubscriptionRegionGroups(t *testing.T) {
	eps := namedEndpoints("香港 01", "香港 02", "日本 01", "其他")
	opts := SubOptions{RegionGroups: true}

	clash, _, err := Subscription(FormatClash, eps, opts)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(clash, "name: \"🇭🇰 香港\"") || !strings.Contains(clash, "name: \"🇯🇵 日本\"") ||
		strings.Contains(clash, "name: \"🇺🇸 美国\"") {
		t.Fatalf("clash region groups:\n%s", clash)
	}

	sb, _, err := Subscription(FormatSingbox, eps, opts)
	if err != nil {
		t.Fatal(err)
	}
	var cfg struct {
		Outbounds []map[string]interface{} `json:"outbounds"`
	}
	if err := json.Unmarshal([]byte(sb), &cfg); err != nil {
		t.Fatal(err)
	}
	var hk map[string]interface{}
	for _, o := range cfg.Outbounds {
		if o["tag"] == "🇭🇰 香港" {
			hk = o
		}
		if o["tag"] == "节点选择" && o["outbounds"].([]interface{})[1] != "🇭🇰 香港" {
			t.Fatalf("selector must list region groups first: %v", o)
		}
	}
	if hk == nil || len(hk["outbounds"].([]interface{})) != 2 {
		t.Fatalf("sing-box hk group: %v", hk)
	}

	surge, _, _ := Subscription(FormatSurge, eps, opts)
	if !strings.Contains(surge, "🇭🇰 香港 = url-test, 香港 01, 香港 02") {
		t.Fatalf("surge region groups:\n%s", surge)
	}

	// A node already named like a group gets suffixed instead of clashing.
	clash, _, _ = Subscription(FormatClash, namedEndpoints("🇭🇰 香港"), opts)
	if !strings.Contains(clash, "🇭🇰 香港 #2") {
		t.Fatalf("name clash with a group:\n%s", clash)
	}
}

func TestSubPipelineFilterFlagDedupe(t *testing.T) {
	eps := namedEndpoints("香港 01", "日本 01", "美国 01", "Plain")
	eps[1].Direct = true
	eps[2].Proxy = Proxy{"type": "trojan", "name": "美国 01"}
	// Same address as 香港 01: a duplicate.
	dup := eps[0]
	dup.Name = "香港 01 备用"
	eps = append(eps, dup)

	names := func(opts SubOptions) string { return strings.Join(endpointNames(ApplySubOptions(eps, opts)), ",") }

	if got := names(SubOptions{Lines: "direct"}); got != "日本 01" {
		t.Fatalf("direct only: %s", got)
	}
	if got := names(SubOptions{Regions: []string{"🇭🇰 香港", RegionOther}}); got != "香港 01,Plain,香港 01 备用" {
		t.Fatalf("region filter: %s", got)
	}
	if got := names(SubOptions{Protocols: []string{ProtocolTrojan}}); got != "美国 01" {
		t.Fatalf("protocol filter uses the imported proxy type: %s", got)
	}
	if got := names(SubOptions{Include: "香港|plain", Exclude: "/备用$/"}); got != "香港 01,Plain" {
		t.Fatalf("include/exclude: %s", got)
	}
	if got := names(SubOptions{Dedupe: true}); got != "香港 01,日本 01,美国 01,Plain" {
		t.Fatalf("dedupe: %s", got)
	}
	if got := names(SubOptions{AddFlag: true, Prefix: "[x] ", Regions: []string{"🇯🇵 日本"}}); got != "[x] 🇯🇵 日本 01" {
		t.Fatalf("flag then prefix: %s", got)
	}
	if got := names(SubOptions{AddFlag: true, Include: "Plain"}); got != "Plain" {
		t.Fatalf("no region, no flag: %s", got)
	}
	// A name that already has a flag keeps it single.
	if got := endpointNames(ApplySubOptions(namedEndpoints("🇭🇰 香港"), SubOptions{AddFlag: true})); got[0] != "🇭🇰 香港" {
		t.Fatalf("existing flag: %v", got)
	}
	if err := (SubOptions{Include: "/[/"}).Validate(); err == nil {
		t.Fatal("bad include regex must be rejected")
	}
}
