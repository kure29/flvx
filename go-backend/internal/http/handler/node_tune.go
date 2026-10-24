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
		// The line the buffers are sized for; 0 lets the agent use the
		// last applied values. Older agents ignore them.
		BandwidthMbps int `json:"bandwidthMbps"`
		RTTMs         int `json:"rttMs"`
	}
	if err := decodeJSON(r.Body, &req); err != nil || req.ID <= 0 {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	line := map[string]interface{}{}
	if req.BandwidthMbps != 0 || req.RTTMs != 0 {
		if req.BandwidthMbps < 1 || req.BandwidthMbps > 100000 || req.RTTMs < 1 || req.RTTMs > 2000 {
			response.WriteJSON(w, response.ErrDefault("带宽需在 1–100000 Mbps，延迟需在 1–2000 ms"))
			return
		}
		line = map[string]interface{}{"bandwidthMbps": req.BandwidthMbps, "rttMs": req.RTTMs}
	}
	command, data := "TuneStatus", line
	switch req.Action {
	case "", "status":
	case "apply":
		if len(req.Groups) == 0 {
			response.WriteJSON(w, response.ErrDefault("请至少选择一项"))
			return
		}
		data = map[string]interface{}{"groups": req.Groups}
		for k, v := range line {
			data[k] = v
		}
		command = "TuneApply"
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
			msg = "服务器 agent 版本过旧，不支持调优，请先升级服务器"
		}
		response.WriteJSON(w, response.Err(-2, fmt.Sprintf("调优失败: %s", msg)))
		return
	}
	response.WriteJSON(w, response.OK(res.Data))
}
