package handler

import (
	"database/sql"
	"net/http"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/store/repo"
)

func (h *Handler) speedLimitCreate(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	name := asString(req["name"])
	if name == "" {
		response.WriteJSON(w, response.ErrDefault("名称不能为空"))
		return
	}

	speed := asInt(req["speed"], 100)

	now := time.Now().UnixMilli()
	_, err := h.repo.CreateSpeedLimit(name, speed, now, asInt(req["status"], 1))
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) speedLimitUpdate(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	id := asInt64(req["id"], 0)
	if id <= 0 {
		response.WriteJSON(w, response.ErrDefault("限速规则ID不能为空"))
		return
	}

	name := asString(req["name"])
	if name == "" {
		response.WriteJSON(w, response.ErrDefault("名称不能为空"))
		return
	}

	speed := asInt(req["speed"], 100)

	if err := h.repo.UpdateSpeedLimit(id, name, speed, asInt(req["status"], 1), time.Now().UnixMilli()); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) speedLimitDelete(w http.ResponseWriter, r *http.Request) {
	id := idFromBody(r, w)
	if id <= 0 {
		return
	}

	if err := h.repo.DeleteSpeedLimit(id); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) groupTunnelCreate(w http.ResponseWriter, r *http.Request) {
	h.groupCreate(w, r, "tunnel_group")
}

func (h *Handler) groupTunnelUpdate(w http.ResponseWriter, r *http.Request) {
	h.groupUpdate(w, r, "tunnel_group")
}

func (h *Handler) groupTunnelDelete(w http.ResponseWriter, r *http.Request) {
	h.groupDelete(w, r, "tunnel_group")
}

func (h *Handler) groupUserCreate(w http.ResponseWriter, r *http.Request) {
	h.groupCreate(w, r, "user_group")
}

func (h *Handler) groupUserUpdate(w http.ResponseWriter, r *http.Request) {
	h.groupUpdate(w, r, "user_group")
}

func (h *Handler) groupUserDelete(w http.ResponseWriter, r *http.Request) {
	h.groupDelete(w, r, "user_group")
}

func (h *Handler) groupTunnelAssign(w http.ResponseWriter, r *http.Request) {
	var req struct {
		GroupID   int64   `json:"groupId"`
		TunnelIDs []int64 `json:"tunnelIds"`
	}
	if err := decodeJSON(r.Body, &req); err != nil || req.GroupID <= 0 {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	tx := h.repo.BeginTx()
	if tx.Error != nil {
		response.WriteJSON(w, response.Err(-2, tx.Error.Error()))
		return
	}
	defer func() { tx.Rollback() }()
	if err := h.repo.ReplaceTunnelGroupMembersTx(tx, req.GroupID, req.TunnelIDs, time.Now().UnixMilli()); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	if err := tx.Commit().Error; err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	_ = h.syncPermissionsByTunnelGroup(req.GroupID)
	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) groupUserAssign(w http.ResponseWriter, r *http.Request) {
	var req struct {
		GroupID int64   `json:"groupId"`
		UserIDs []int64 `json:"userIds"`
	}
	if err := decodeJSON(r.Body, &req); err != nil || req.GroupID <= 0 {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	tx := h.repo.BeginTx()
	if tx.Error != nil {
		response.WriteJSON(w, response.Err(-2, tx.Error.Error()))
		return
	}
	defer func() { tx.Rollback() }()
	previousUserIDs, err := h.repo.ListUserIDsByUserGroupTx(tx, req.GroupID)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	if err := h.repo.ReplaceUserGroupMembersTx(tx, req.GroupID, req.UserIDs, time.Now().UnixMilli()); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	revokedPairs, revokeErr := h.repo.RevokeGroupGrantsForRemovedUsersTx(tx, req.GroupID, previousUserIDs, req.UserIDs)
	if revokeErr != nil {
		response.WriteJSON(w, response.Err(-2, revokeErr.Error()))
		return
	}
	if err := tx.Commit().Error; err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	for _, pair := range revokedPairs {
		h.cleanupForwardsForUserTunnel(pair.UserID, pair.TunnelID)
	}
	_ = h.syncPermissionsByUserGroup(req.GroupID)
	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) groupPermissionAssign(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserGroupID   int64 `json:"userGroupId"`
		TunnelGroupID int64 `json:"tunnelGroupId"`
	}
	if err := decodeJSON(r.Body, &req); err != nil || req.UserGroupID <= 0 || req.TunnelGroupID <= 0 {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	if err := h.repo.InsertGroupPermission(req.UserGroupID, req.TunnelGroupID, time.Now().UnixMilli()); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	_ = h.applyGroupPermission(req.UserGroupID, req.TunnelGroupID)
	response.WriteJSON(w, response.OK("权限分配成功"))
}

func (h *Handler) groupPermissionRemove(w http.ResponseWriter, r *http.Request) {
	id := idFromBody(r, w)
	if id <= 0 {
		return
	}
	tx := h.repo.BeginTx()
	if tx.Error != nil {
		response.WriteJSON(w, response.Err(-2, tx.Error.Error()))
		return
	}
	defer func() { tx.Rollback() }()

	ug, tg, exists, err := h.repo.GetGroupPermissionPairByIDTx(tx, id)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	if err := h.repo.DeleteGroupPermissionByIDTx(tx, id); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	var revokedPairs []repo.RevokedUserTunnelPair
	if exists {
		var revokeErr error
		revokedPairs, revokeErr = h.repo.RevokeGroupPermissionPairTx(tx, ug, tg)
		if revokeErr != nil {
			response.WriteJSON(w, response.Err(-2, revokeErr.Error()))
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	for _, pair := range revokedPairs {
		h.cleanupForwardsForUserTunnel(pair.UserID, pair.TunnelID)
	}
	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) groupCreate(w http.ResponseWriter, r *http.Request, table string) {
	var req map[string]interface{}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	name := asString(req["name"])
	if name == "" {
		response.WriteJSON(w, response.ErrDefault("分组名称不能为空"))
		return
	}
	now := time.Now().UnixMilli()
	if err := h.repo.GroupCreate(table, name, asInt(req["status"], 1), now); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) groupUpdate(w http.ResponseWriter, r *http.Request, table string) {
	var req map[string]interface{}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	id := asInt64(req["id"], 0)
	if id <= 0 {
		response.WriteJSON(w, response.ErrDefault("分组ID不能为空"))
		return
	}
	if err := h.repo.GroupUpdate(table, id, asString(req["name"]), asInt(req["status"], 1), time.Now().UnixMilli()); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) groupDelete(w http.ResponseWriter, r *http.Request, table string) {
	id := idFromBody(r, w)
	if id <= 0 {
		return
	}
	if err := h.repo.GroupDeleteCascade(table, id); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OKEmpty())
}

func (h *Handler) applyGroupPermission(userGroupID, tunnelGroupID int64) error {
	userIDs, _ := h.repo.ListUserIDsByUserGroup(userGroupID)
	tunnelIDs, _ := h.repo.ListTunnelIDsByTunnelGroup(tunnelGroupID)
	for _, uid := range userIDs {
		for _, tid := range tunnelIDs {
			utID, created, err := h.repo.EnsureUserTunnelGrant(uid, tid)
			if err != nil {
				continue
			}
			createdByGroup := 0
			if created {
				createdByGroup = 1
			}
			h.repo.InsertGroupPermissionGrant(userGroupID, tunnelGroupID, utID, createdByGroup, time.Now().UnixMilli())
		}
	}
	return nil
}

func (h *Handler) syncPermissionsByUserGroup(userGroupID int64) error {
	pairs, err := h.repo.ListGroupPermissionPairsByUserGroup(userGroupID)
	if err != nil {
		return err
	}
	for _, p := range pairs {
		_ = h.applyGroupPermission(p[0], p[1])
	}
	return nil
}

func (h *Handler) syncPermissionsByTunnelGroup(tunnelGroupID int64) error {
	pairs, err := h.repo.ListGroupPermissionPairsByTunnelGroup(tunnelGroupID)
	if err != nil {
		return err
	}
	for _, p := range pairs {
		_ = h.applyGroupPermission(p[0], p[1])
	}
	return nil
}

func (h *Handler) normalizeSpeedLimitReference(speedID *int64) (*int64, error) {
	if speedID == nil {
		return nil, nil
	}

	exists, err := h.repo.SpeedLimitExists(*speedID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, nil
	}

	return speedID, nil
}

func sameSpeedLimitSelection(current sql.NullInt64, requested *int64) bool {
	if requested == nil {
		return !current.Valid
	}

	return current.Valid && current.Int64 == *requested
}
