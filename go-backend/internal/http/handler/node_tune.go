package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"go-backend/internal/http/response"
)

const nodeTuneTimeout = 30 * time.Second

// nodeTune reads (action "status") or changes (action "apply" with the
// chosen groups, or "restore") a node's sysctl network tuning. The agent
// does the work; see go-gost/x/socket/tuning.go.
func (h *Handler) nodeTune(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		ID     int64    `json:"id"`
		Action string   `json:"action"`
		Groups []string `json:"groups"`
	}
	if err := decodeJSON(r.Body, &req); err != nil || req.ID <= 0 {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	command, data := "TuneStatus", map[string]interface{}{}
	switch req.Action {
	case "", "status":
	case "apply":
		if len(req.Groups) == 0 {
			response.WriteJSON(w, response.ErrDefault("请至少选择一项"))
			return
		}
		command, data = "TuneApply", map[string]interface{}{"groups": req.Groups}
	case "restore":
		command, data = "TuneApply", map[string]interface{}{"restore": true}
	default:
		response.WriteJSON(w, response.ErrDefault("未知操作"))
		return
	}

	res, err := h.sendNodeCommandWithTimeout(req.ID, command, data, nodeTuneTimeout, false, false)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "未知命令类型") {
			msg = "节点 agent 版本过旧，不支持调优，请先升级节点"
		}
		response.WriteJSON(w, response.Err(-2, fmt.Sprintf("调优失败: %s", msg)))
		return
	}
	response.WriteJSON(w, response.OK(res.Data))
}
