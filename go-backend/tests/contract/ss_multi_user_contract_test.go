package contract_test

import (
	"encoding/base64"
	"encoding/json"
	"net/url"
	"strings"
	"testing"

	"go-backend/internal/auth"
)

// A Shadowsocks 2022 inbound in multi-user mode gives each subscription its
// own key ("server:user"), so it is no longer a shared credential.
func TestShadowsocksMultiUserContract(t *testing.T) {
	secret := "contract-jwt-secret"
	router, r := setupContractRouter(t, secret)
	admin, _ := auth.GenerateToken(1, "admin_user", 0, secret)
	landing := seedKernelNode(t, r, "landing")
	if err := r.DB().Exec(`UPDATE node SET server_ip = '198.51.100.9' WHERE id = ?`, landing).Error; err != nil {
		t.Fatal(err)
	}
	ss := seedInboundOnNode(t, router, r, admin, landing,
		`{"nodeId":`+jsonInt64(landing)+`,"kernelType":"xray","name":"香港 SS","protocol":"shadowsocks","port":8388,`+
			`"settings":{"method":"2022-blake3-aes-128-gcm","multiUser":true}}`)
	var settings struct {
		Password  string `json:"password"`
		MultiUser bool   `json:"multiUser"`
		UserKey   string `json:"userKey"`
	}
	_ = json.Unmarshal([]byte(mustQueryString(t, r, `SELECT settings FROM node_inbound WHERE id = ?`, ss)), &settings)
	if key, err := base64.StdEncoding.DecodeString(settings.UserKey); !settings.MultiUser || err != nil || len(key) != 16 {
		t.Fatalf("multi-user mode must store the owner's key: %+v", settings)
	}

	list := kernelContractPost(t, router, admin, "/api/v1/subscription/list", `{}`).Data.(map[string]interface{})
	def := list["items"].([]interface{})[0].(map[string]interface{})
	if shared := def["sharedIds"].([]interface{}); len(shared) != 0 {
		t.Fatalf("a multi-user inbound is not shared: %v", shared)
	}
	resp := getSub(t, router, def["path"].(string)+"?format=base64", "")
	body, _ := base64.StdEncoding.DecodeString(resp.Body.String())
	server := url.QueryEscape(settings.Password) + "%3A"
	if !strings.Contains(string(body), server) || strings.Contains(string(body), url.QueryEscape(settings.UserKey)) {
		t.Fatalf("the subscription sends the server key with its own user key: %s", body)
	}

	// Turning it off makes the inbound shared again.
	out := kernelContractPost(t, router, admin, "/api/v1/inbound/update",
		`{"id":`+jsonInt64(ss)+`,"nodeId":`+jsonInt64(landing)+`,"kernelType":"xray","name":"香港 SS","protocol":"shadowsocks","port":8388,`+
			`"settings":{"method":"2022-blake3-aes-128-gcm","password":"`+settings.Password+`"}}`)
	if out.Code != 0 {
		t.Fatalf("update: %+v", out)
	}
	list = kernelContractPost(t, router, admin, "/api/v1/subscription/list", `{}`).Data.(map[string]interface{})
	def = list["items"].([]interface{})[0].(map[string]interface{})
	if shared := def["sharedIds"].([]interface{}); len(shared) != 1 {
		t.Fatalf("a single-user shadowsocks inbound is shared: %v", shared)
	}

	if out := kernelContractPost(t, router, admin, "/api/v1/inbound/update",
		`{"id":`+jsonInt64(ss)+`,"nodeId":`+jsonInt64(landing)+`,"kernelType":"xray","name":"香港 SS","protocol":"shadowsocks","port":8388,`+
			`"settings":{"method":"2022-blake3-chacha20-poly1305","multiUser":true}}`); out.Code == 0 {
		t.Fatal("chacha 2022 has no multi-user mode")
	}
}
