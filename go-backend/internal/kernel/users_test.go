package kernel

import (
	"encoding/base64"
	"net/url"
	"strings"
	"testing"
)

func TestRenderUsers(t *testing.T) {
	users := []User{{ID: 7, UUID: "11111111-1111-4111-8111-111111111111", Password: "userpw"}}
	vless := Inbound{ID: 1, Protocol: ProtocolVLESS, Port: 443,
		Settings: Settings{UUID: "00000000-0000-4000-8000-000000000000", Flow: "xtls-rprx-vision"},
		Security: Security{Type: SecurityReality, SNI: "www.example.com", RealityDest: "www.example.com:443",
			RealityPrivateKey: "k", RealityShortIDs: []string{"ab"}},
		Users: users}
	ss := Inbound{ID: 2, Protocol: ProtocolShadowsocks, Port: 8388,
		Settings: Settings{Method: "2022-blake3-aes-128-gcm", Password: "c2VydmVyLWtleS0xNmJ5dA=="}, Users: users}

	r, err := Render(TypeXray, []Inbound{vless, ss})
	if err != nil {
		t.Fatal(err)
	}
	cfg := r.Files[0].Content
	if !strings.Contains(cfg, `"00000000-0000-4000-8000-000000000000"`) || !strings.Contains(cfg, `"u7@flvx"`) ||
		strings.Count(cfg, `"flow": "xtls-rprx-vision"`) != 2 {
		t.Fatalf("xray must keep the owner and add the user with the same flow:\n%s", cfg)
	}
	if strings.Contains(cfg, "userpw") {
		t.Fatalf("shadowsocks stays single-user:\n%s", cfg)
	}

	hy2 := Inbound{ID: 3, Protocol: ProtocolHysteria2, Port: 443, Settings: Settings{Password: "owner"},
		Security: Security{Type: SecurityTLS, SNI: "a.example.com", CertPEM: "c", KeyPEM: "k"}, Users: users}
	naive := Inbound{ID: 4, Protocol: ProtocolNaive, Port: 444, Settings: Settings{Username: "me", Password: "owner"},
		Security: Security{Type: SecurityTLS, SNI: "a.example.com", CertPEM: "c", KeyPEM: "k"}, Users: users}
	r, err = Render(TypeSingbox, []Inbound{hy2, naive})
	if err != nil {
		t.Fatal(err)
	}
	cfg = r.Files[0].Content
	if !strings.Contains(cfg, `"name": "u7"`) || !strings.Contains(cfg, `"username": "u7"`) ||
		strings.Count(cfg, `"password": "owner"`) != 2 || strings.Count(cfg, `"password": "userpw"`) != 2 {
		t.Fatalf("sing-box users:\n%s", cfg)
	}

	// Removing the user changes the config, so the panel re-applies it.
	hy2.Users = nil
	r2, _ := Render(TypeSingbox, []Inbound{hy2, naive})
	if r2.Hash == r.Hash {
		t.Fatal("hash must change with the user list")
	}
}

func TestForUser(t *testing.T) {
	u := User{ID: 3, UUID: "u-uuid", Password: "u-pw"}
	in := Inbound{Protocol: ProtocolTUIC, Settings: Settings{UUID: "o-uuid", Password: "o-pw"}, Users: []User{u}}
	got := in.ForUser(u)
	if got.Settings.UUID != "u-uuid" || got.Settings.Password != "u-pw" || got.Users != nil {
		t.Fatalf("tuic for user: %+v", got)
	}
	snell := Inbound{Protocol: ProtocolSnell, Settings: Settings{Password: "psk"}}
	if snell.ForUser(u).Settings.Password != "psk" || snell.SupportsUsers() {
		t.Fatal("snell keeps the shared psk")
	}
	if (Inbound{Protocol: ProtocolNaive}).ForUser(u).Settings.Username != "u3" {
		t.Fatal("naive username")
	}
}

func TestRenderUserMarks(t *testing.T) {
	users := []User{{ID: 7, UUID: "11111111-1111-4111-8111-111111111111", Password: "userpw"}}
	vless := Inbound{ID: 1, Protocol: ProtocolVLESS, Port: 443,
		Settings: Settings{UUID: "00000000-0000-4000-8000-000000000000"}, Users: users}

	r, err := Render(TypeXray, []Inbound{vless})
	if err != nil {
		t.Fatal(err)
	}
	cfg := r.Files[0].Content
	if len(r.UserMarks) != 1 || r.UserMarks[0] != 7 || !strings.Contains(cfg, `"mark": 1180041223`) ||
		!strings.Contains(cfg, `"u7@flvx"`) || !strings.Contains(cfg, `"outboundTag": "flvx-u7"`) {
		t.Fatalf("xray must route the user through its marked outbound (%v):\n%s", r.UserMarks, cfg)
	}

	r, err = Render(TypeSingbox, []Inbound{vless})
	if err != nil {
		t.Fatal(err)
	}
	cfg = r.Files[0].Content
	if len(r.UserMarks) != 1 || !strings.Contains(cfg, `"routing_mark": 1180041223`) ||
		!strings.Contains(cfg, `"outbound": "flvx-u7"`) || !strings.Contains(cfg, `"final": "direct"`) {
		t.Fatalf("sing-box must route the user through its marked outbound:\n%s", cfg)
	}

	vless.Users = nil
	if r, _ := Render(TypeXray, []Inbound{vless}); len(r.UserMarks) != 0 || strings.Contains(r.Files[0].Content, "routing") {
		t.Fatal("no users, nothing to mark")
	}
	if UserMark(70000) != 0 || UserFromMark(UserMark(12)) != 12 || UserFromMark(0x12345678) != 0 {
		t.Fatal("mark round trip")
	}
}

func TestShadowsocksMultiUser(t *testing.T) {
	const server = "c2VydmVyLWtleS0xNmJ5dA==" // 16 bytes
	const owner = "b3duZXJvd25lcm93bmVyMQ=="  // 16 bytes
	u := User{ID: 7, Password: "userpw"}
	userKey := ssUserKey(u, "2022-blake3-aes-128-gcm")
	ss := Inbound{ID: 2, Protocol: ProtocolShadowsocks, Port: 8388,
		Settings: Settings{Method: "2022-blake3-aes-128-gcm", Password: server, MultiUser: true, UserKey: owner},
		Users:    []User{u}}
	if !ss.SupportsUsers() || (Inbound{Protocol: ProtocolShadowsocks, Settings: Settings{Method: "2022-blake3-aes-128-gcm"}}).SupportsUsers() {
		t.Fatal("shadowsocks carries users only in multi-user mode")
	}
	if len(userKey) != 24 || ssUserKey(User{ID: 8, Password: "other"}, ss.Settings.Method) == userKey {
		t.Fatalf("user keys must be 16-byte base64 and differ per user: %q", userKey)
	}

	r, err := Render(TypeXray, []Inbound{ss})
	if err != nil {
		t.Fatal(err)
	}
	cfg := r.Files[0].Content
	if !strings.Contains(cfg, `"password": "`+server+`"`) || !strings.Contains(cfg, `"password": "`+owner+`"`) ||
		!strings.Contains(cfg, `"password": "`+userKey+`"`) || !strings.Contains(cfg, `"u7@flvx"`) ||
		!strings.Contains(cfg, `"outboundTag": "flvx-u7"`) || len(r.UserMarks) != 1 {
		t.Fatalf("xray multi-user shadowsocks:\n%s", cfg)
	}

	r, err = Render(TypeSingbox, []Inbound{ss})
	if err != nil {
		t.Fatal(err)
	}
	cfg = r.Files[0].Content
	if !strings.Contains(cfg, `"name": "owner"`) || !strings.Contains(cfg, `"name": "u7"`) ||
		!strings.Contains(cfg, `"password": "`+userKey+`"`) || !strings.Contains(cfg, `"auth_user"`) || len(r.UserMarks) != 1 {
		t.Fatalf("sing-box multi-user shadowsocks:\n%s", cfg)
	}

	// The owner and each subscription send "server:own key".
	e := Endpoint{Name: "ss", Host: "1.2.3.4", Port: 8388, Inbound: ss}
	if p, _ := ClashProxy(e); !strings.Contains(marshalYAML(yamlNode{{"proxies", []interface{}{p}}}), server+":"+owner) {
		t.Fatal("the owner's link must carry its user key")
	}
	if got := ss.ForUser(u).Settings.Password; got != server+":"+userKey {
		t.Fatalf("user password = %q", got)
	}
	e.Inbound = ss.ForUser(u)
	if link, _ := ShareURI(e); !strings.Contains(link, url.QueryEscape(server+":"+userKey)) {
		t.Fatalf("user share link: %s", link)
	}
}

func TestShadowsocksMultiUserValidation(t *testing.T) {
	in := Inbound{Protocol: ProtocolShadowsocks, Port: 8388,
		Settings: Settings{Method: "2022-blake3-aes-256-gcm", MultiUser: true}}
	if err := normalizeSettings(&in); err != nil {
		t.Fatal(err)
	}
	if key, err := base64.StdEncoding.DecodeString(in.Settings.UserKey); err != nil || len(key) != 32 {
		t.Fatalf("owner key must be generated: %q", in.Settings.UserKey)
	}
	in.Settings.MultiUser = false
	if err := normalizeSettings(&in); err != nil || in.Settings.UserKey != "" {
		t.Fatalf("turning it off drops the owner key: %v %q", err, in.Settings.UserKey)
	}
	chacha := Inbound{Protocol: ProtocolShadowsocks, Settings: Settings{Method: "2022-blake3-chacha20-poly1305", MultiUser: true}}
	if err := normalizeSettings(&chacha); err == nil {
		t.Fatal("chacha 2022 has no multi-user mode")
	}
	legacy := Inbound{Protocol: ProtocolShadowsocks, Settings: Settings{Method: "aes-256-gcm", MultiUser: true}}
	if err := normalizeSettings(&legacy); err == nil {
		t.Fatal("pre-2022 ciphers have no multi-user mode")
	}
}

func TestShadowsocksMultiUserSurge(t *testing.T) {
	ss := Inbound{Protocol: ProtocolShadowsocks, Port: 8388,
		Settings: Settings{Method: "2022-blake3-aes-128-gcm", Password: "c2VydmVyLWtleS0xNmJ5dA==", MultiUser: true,
			UserKey: "b3duZXJvd25lcm93bmVyMQ=="}}
	line, _ := SurgeLine(Endpoint{Name: "ss", Host: "1.2.3.4", Port: 8388, Inbound: ss})
	if !strings.Contains(line, "password=c2VydmVyLWtleS0xNmJ5dA==:b3duZXJvd25lcm93bmVyMQ==") {
		t.Fatalf("surge line: %s", line)
	}
}
