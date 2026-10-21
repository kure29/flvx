package contract_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"go-backend/internal/auth"
)

// The public status page answers only with its slug while enabled, lists
// only public nodes and never their addresses; only admins manage it.
func TestStatusPageContract(t *testing.T) {
	secret := "contract-jwt-secret"
	router, r := setupContractRouter(t, secret)
	admin, _ := auth.GenerateToken(1, "admin_user", 0, secret)
	user, _ := auth.GenerateToken(2, "normal_user", 1, secret)
	shown := seedKernelNode(t, r, "香港 HKT")
	seedKernelNode(t, r, "日本 东京")

	get := func(path string) (int, string) {
		res := getSub(t, router, path, "")
		return res.Code, res.Body.String()
	}
	if code, _ := get("/api/v1/open_api/status/anything"); code != http.StatusNotFound {
		t.Fatalf("off: %d", code)
	}
	if out := kernelContractPost(t, router, user, "/api/v1/node/status-page/save", `{"enabled":true}`); out.Code == 0 {
		t.Fatal("a user must not turn the page on")
	}
	out := kernelContractPost(t, router, admin, "/api/v1/node/status-page/save", `{"enabled":true,"title":"我的节点"}`)
	slug, _ := out.Data.(map[string]interface{})["slug"].(string)
	if out.Code != 0 || len(slug) != 16 {
		t.Fatalf("save: %+v", out)
	}
	if out := kernelContractPost(t, router, user, "/api/v1/config/get", `{"name":"status_page_slug"}`); out.Code == 0 {
		t.Fatal("the slug is secret to non-admins")
	}
	if code, _ := get("/api/v1/open_api/status/" + strings.Repeat("0", 16)); code != http.StatusNotFound {
		t.Fatalf("wrong slug: %d", code)
	}

	if out := kernelContractPost(t, router, admin, "/api/v1/node/status-public", `{"id":`+jsonInt64(shown)+`,"public":true}`); out.Code != 0 {
		t.Fatalf("public: %+v", out)
	}
	code, body := get("/api/v1/open_api/status/" + slug + "?tz=480")
	var view struct {
		Data struct {
			Title string                   `json:"title"`
			Nodes []map[string]interface{} `json:"nodes"`
		} `json:"data"`
	}
	_ = json.Unmarshal([]byte(body), &view)
	if code != 200 || view.Data.Title != "我的节点" || len(view.Data.Nodes) != 1 || view.Data.Nodes[0]["name"] != "香港 HKT" || view.Data.Nodes[0]["region"] != "🇭🇰 香港" {
		t.Fatalf("view: %d %s", code, body)
	}
	for _, leak := range []string{"203.0.113.10", "secret", "30000", "v1", "\"id\""} {
		if strings.Contains(body, leak) {
			t.Fatalf("public view leaks %q: %s", leak, body)
		}
	}
	got := kernelContractPost(t, router, admin, "/api/v1/node/status-page/get", `{}`).Data.(map[string]interface{})
	if list := got["nodes"].([]interface{}); len(list) != 2 || list[0].(map[string]interface{})["public"] != true || list[1].(map[string]interface{})["public"] != false {
		t.Fatalf("nodes: %v", got)
	}

	// A new path retires the old link; turning the page off hides it.
	out = kernelContractPost(t, router, admin, "/api/v1/node/status-page/save", `{"enabled":true,"newSlug":true}`)
	next := out.Data.(map[string]interface{})["slug"].(string)
	if code, _ := get("/api/v1/open_api/status/" + slug); code != http.StatusNotFound || next == slug {
		t.Fatalf("old slug after a new one: %d", code)
	}
	kernelContractPost(t, router, admin, "/api/v1/node/status-page/save", `{"enabled":false}`)
	if code, _ := get("/api/v1/open_api/status/" + next); code != http.StatusNotFound {
		t.Fatalf("off again: %d", code)
	}
	kernelContractPost(t, router, admin, "/api/v1/node/status-page/save", `{"enabled":true}`)

	// One client gets a bounded number of answers a minute.
	limited := false
	for i := 0; i < 200 && !limited; i++ {
		code, _ := get("/api/v1/open_api/status/" + next)
		limited = code == http.StatusTooManyRequests
	}
	if !limited {
		t.Fatal("the public endpoint must be rate limited")
	}
}
