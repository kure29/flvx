package contract_test

import (
	"strings"
	"testing"
	"time"

	"go-backend/internal/auth"
)

// A subscription assigned to a panel user shows up in that user's 订阅
// (and nobody else's); they can reset its link, not other subscriptions.
func TestUserSubscriptionsContract(t *testing.T) {
	secret := "contract-jwt-secret"
	router, r := setupContractRouter(t, secret)
	now := time.Now().UnixMilli()
	for _, u := range []struct {
		id   int
		name string
	}{{2, "xiaoming"}, {3, "aqiang"}} {
		if err := r.DB().Exec(`
			INSERT INTO user(id, user, pwd, role_id, exp_time, flow, in_flow, out_flow, flow_reset_time, num, created_time, updated_time, status)
			VALUES(?, ?, '3c85cdebade1c51cf64ca9f3c09d182d', 1, 2727251700000, 99999, 0, 0, 1, 99999, ?, ?, 1)`, u.id, u.name, now, now).Error; err != nil {
			t.Fatalf("insert user: %v", err)
		}
	}
	admin, _ := auth.GenerateToken(1, "admin_user", 0, secret)
	xiaoming, _ := auth.GenerateToken(2, "xiaoming", 1, secret)
	aqiang, _ := auth.GenerateToken(3, "aqiang", 1, secret)

	save := kernelContractPost(t, router, admin, "/api/v1/subscription/save",
		`{"name":"小明 · 手机","sourceAll":true,"userId":2,"trafficLimit":214748364800,"resetDay":1,"expireTime":`+jsonInt64(now+86400000*30)+`}`)
	if save.Code != 0 {
		t.Fatalf("save: %+v", save)
	}
	saved := save.Data.(map[string]interface{})
	subID := int64(saved["id"].(float64))
	if saved["userId"].(float64) != 2 || saved["userName"] != "xiaoming" {
		t.Fatalf("assigned view: %v", saved)
	}
	other := kernelContractPost(t, router, admin, "/api/v1/subscription/save", `{"name":"别人的","sourceAll":true}`)
	otherID := int64(other.Data.(map[string]interface{})["id"].(float64))
	if bad := kernelContractPost(t, router, admin, "/api/v1/subscription/save", `{"name":"x","sourceAll":true,"userId":99}`); bad.Code == 0 {
		t.Fatal("assigning a missing user must fail")
	}

	mine := kernelContractPost(t, router, xiaoming, "/api/v1/user/subscription/list", `{}`)
	items, _ := mine.Data.([]interface{})
	if mine.Code != 0 || len(items) != 1 {
		t.Fatalf("xiaoming's subscriptions: %+v", mine)
	}
	item := items[0].(map[string]interface{})
	oldPath := item["path"].(string)
	if item["name"] != "小明 · 手机" || item["status"] != "ok" || item["resetDay"].(float64) != 1 ||
		item["nextResetTime"].(float64) <= float64(now) || !strings.HasPrefix(oldPath, "/api/v1/open_api/sub/") {
		t.Fatalf("user view: %v", item)
	}
	for _, key := range []string{"options", "inboundIds", "remark", "userId"} {
		if _, ok := item[key]; ok {
			t.Fatalf("user view leaks %s: %v", key, item)
		}
	}
	if theirs := kernelContractPost(t, router, aqiang, "/api/v1/user/subscription/list", `{}`); len(theirs.Data.([]interface{})) != 0 {
		t.Fatalf("aqiang must see nothing: %+v", theirs)
	}
	// The admin endpoints stay admin-only.
	if res := kernelContractPost(t, router, xiaoming, "/api/v1/subscription/list", `{}`); res.Code == 0 {
		t.Fatal("users cannot list every subscription")
	}

	if res := kernelContractPost(t, router, xiaoming, "/api/v1/user/subscription/reset", `{"id":`+jsonInt64(otherID)+`}`); res.Code == 0 {
		t.Fatal("users cannot reset someone else's subscription")
	}
	if res := kernelContractPost(t, router, aqiang, "/api/v1/user/subscription/reset", `{"id":`+jsonInt64(subID)+`}`); res.Code == 0 {
		t.Fatal("another user cannot reset it")
	}
	reset := kernelContractPost(t, router, xiaoming, "/api/v1/user/subscription/reset", `{"id":`+jsonInt64(subID)+`}`)
	if reset.Code != 0 || reset.Data.(map[string]interface{})["path"] == oldPath {
		t.Fatalf("reset: %+v", reset)
	}

	// Deleting the user keeps the subscription, unassigned.
	if res := kernelContractPost(t, router, admin, "/api/v1/user/delete", `{"id":2}`); res.Code != 0 {
		t.Fatalf("delete user: %+v", res)
	}
	if got := mustQueryInt64(t, r, `SELECT user_id FROM subscription WHERE id = ?`, subID); got != 0 {
		t.Fatalf("subscription still assigned to %d", got)
	}
}
