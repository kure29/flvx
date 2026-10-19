package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNodeTuneRejectsBadRequests(t *testing.T) {
	for body, want := range map[string]string{
		`{"id":0}`:                   "参数错误",
		`{"id":1,"action":"apply"}`:  "至少选择",
		`{"id":1,"action":"reboot"}`: "未知操作",
		`{"id":1,"extra":true}`:      "参数错误",
	} {
		rec := httptest.NewRecorder()
		(&Handler{}).nodeTune(rec, httptest.NewRequest(http.MethodPost, "/api/v1/node/tune", strings.NewReader(body)))
		if !strings.Contains(rec.Body.String(), want) {
			t.Errorf("%s: %s", body, rec.Body.String())
		}
	}
}
