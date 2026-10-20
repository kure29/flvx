package kernel

import (
	"strings"
	"testing"
)

func singboxSnellInbounds(t *testing.T) []Inbound {
	t.Helper()
	ins := []Inbound{
		{ID: 1, Protocol: ProtocolSnell, Port: 6160, Settings: Settings{Password: "psk-aaaaaaaa", SnellVersion: 4}},
		{ID: 2, Protocol: ProtocolSnell, Port: 6161, Settings: Settings{Password: "psk-bbbbbbbbbbbb", SnellVersion: 6}},
		{ID: 3, Protocol: ProtocolSnell, Port: 6162, Settings: Settings{Password: "psk-cccccccc"},
			Security: Security{Type: SecurityShadowTLS, SNI: "www.microsoft.com", ShadowTLSPassword: "stls-pass-1"}},
	}
	for i := range ins {
		if err := Normalize(TypeSingbox, &ins[i]); err != nil {
			t.Fatalf("normalize %d: %v", ins[i].ID, err)
		}
	}
	return ins
}

func TestRenderSingboxSnell(t *testing.T) {
	ins := singboxSnellInbounds(t)
	out, err := Render(TypeSingbox, ins)
	if err != nil {
		t.Fatal(err)
	}
	assertGolden(t, "singbox-snell.golden.json", out.Files[0].Content)

	if ins[2].Settings.SnellVersion != DefaultSnellVersion || ins[2].Settings.BackendPort != 0 {
		t.Fatalf("sing-box snell behind shadowtls needs no backend port: %+v", ins[2].Settings)
	}
	if ins[0].Network() != "tcp" || ins[1].Network() != "tcp" || ins[2].Network() != "tcp" {
		t.Fatal("v4, v6 and shadowtls-fronted snell are tcp only")
	}
	list := renderJSONString(t, out.Files[0].Content)["inbounds"].([]interface{})
	if len(list) != 4 {
		t.Fatalf("shadowtls must add a loopback snell backend: %v", list)
	}
	v4, v6 := list[0].(map[string]interface{}), list[1].(map[string]interface{})
	if v4["type"] != "snell" || v4["version"] != 5.0 || v6["version"] != 6.0 {
		t.Fatalf("v4 clients use the v5 server, v6 its own: %v %v", v4, v6)
	}
	front, backend := list[2].(map[string]interface{}), list[3].(map[string]interface{})
	if front["type"] != "shadowtls" || front["detour"] != "in-3-snell" || backend["tag"] != "in-3-snell" ||
		backend["type"] != "snell" || backend["listen"] != "127.0.0.1" {
		t.Fatalf("shadowtls front: %v -> %v", front, backend)
	}
}

func TestSingboxSnellRules(t *testing.T) {
	bad := []struct {
		kernel string
		in     Inbound
	}{
		{TypeSingbox, Inbound{Protocol: ProtocolSnell, Port: 1, Settings: Settings{SnellVersion: 7}}},
		{TypeSingbox, Inbound{Protocol: ProtocolSnell, Port: 1, Settings: Settings{SnellVersion: 6, Password: "short-psk"}}},
		{TypeSnell, Inbound{Protocol: ProtocolSnell, Port: 1, Settings: Settings{SnellVersion: 6, Password: "long-enough-psk"}}},
	}
	for i, tc := range bad {
		in := tc.in
		if err := Normalize(tc.kernel, &in); err == nil {
			t.Fatalf("case %d must be rejected: %+v", i, in)
		}
	}
	v6 := Inbound{Protocol: ProtocolSnell, Port: 1, Settings: Settings{SnellVersion: 6}}
	if err := Normalize(TypeSingbox, &v6); err != nil || len(v6.Settings.Password) < snellV6MinPSK {
		t.Fatalf("generated v6 psk: %q %v", v6.Settings.Password, err)
	}
}

func TestSingboxSnellChainCoversBackend(t *testing.T) {
	in := singboxSnellInbounds(t)[2]
	in.Via = &Endpoint{}
	cfg := renderJSON(t, TypeSingbox, []Inbound{in})
	rule := cfg["route"].(map[string]interface{})["rules"].([]interface{})[0].(map[string]interface{})
	tags := rule["inbound"].([]interface{})
	if rule["action"] != "reject" || len(tags) != 2 || tags[1] != "in-3-snell" {
		t.Fatalf("the ShadowTLS front and its Snell backend route together: %v", rule)
	}
}

func TestSurgeSnellV6(t *testing.T) {
	in := singboxSnellInbounds(t)[1]
	line, ok := SurgeLine(Endpoint{Name: "v6", Host: "1.2.3.4", Port: in.Port, Inbound: in})
	if !ok || !strings.Contains(line, "snell, 1.2.3.4, 6161, psk=psk-bbbbbbbbbbbb, version=6") {
		t.Fatalf("surge line: %q", line)
	}
}
