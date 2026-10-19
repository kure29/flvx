package repo

import (
	"database/sql"
	"errors"
	"go-backend/internal/store/model"
)

// ─── Semantic Group Queries (replacing QueryInt64List/QueryPairs passthrough) ─

// ListUserIDsByUserGroup returns all user IDs belonging to a user group.
func (r *Repository) ListUserIDsByUserGroup(userGroupID int64) ([]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var ids []int64
	err := r.db.Model(&model.UserGroupUser{}).
		Where("user_group_id = ?", userGroupID).
		Pluck("user_id", &ids).Error
	return ids, err
}

// ListTunnelIDsByTunnelGroup returns all tunnel IDs belonging to a tunnel group.
func (r *Repository) ListTunnelIDsByTunnelGroup(tunnelGroupID int64) ([]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var ids []int64
	err := r.db.Model(&model.TunnelGroupTunnel{}).
		Where("tunnel_group_id = ?", tunnelGroupID).
		Pluck("tunnel_id", &ids).Error
	return ids, err
}

// ListGroupPermissionPairsByUserGroup returns [userGroupID, tunnelGroupID] pairs
// for all group permissions associated with a user group.
func (r *Repository) ListGroupPermissionPairsByUserGroup(userGroupID int64) ([][2]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var perms []model.GroupPermission
	err := r.db.Where("user_group_id = ?", userGroupID).Find(&perms).Error
	if err != nil {
		return nil, err
	}
	result := make([][2]int64, len(perms))
	for i, p := range perms {
		result[i] = [2]int64{p.UserGroupID, p.TunnelGroupID}
	}
	return result, err
}

func (r *Repository) GetUserGroupIDsByUserID(userID int64) ([]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var ids []int64
	err := r.db.Model(&model.UserGroupUser{}).
		Where("user_id = ?", userID).
		Pluck("user_group_id", &ids).Error
	return ids, err
}

func (r *Repository) ListGroupPermissionPairsByTunnelGroup(tunnelGroupID int64) ([][2]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var perms []model.GroupPermission
	err := r.db.Where("tunnel_group_id = ?", tunnelGroupID).Find(&perms).Error
	if err != nil {
		return nil, err
	}
	result := make([][2]int64, len(perms))
	for i, p := range perms {
		result[i] = [2]int64{p.UserGroupID, p.TunnelGroupID}
	}
	return result, err
}

func (r *Repository) ListSpeedLimits() ([]map[string]interface{}, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var limits []model.SpeedLimit
	if err := r.db.Order("id DESC").Find(&limits).Error; err != nil {
		return nil, err
	}
	items := make([]map[string]interface{}, 0, len(limits))
	for _, sl := range limits {
		item := map[string]interface{}{
			"id": sl.ID, "name": sl.Name, "speed": sl.Speed,
			"status": sl.Status, "createdTime": sl.CreatedTime,
			"updatedTime": nullableInt64(sl.UpdatedTime),
		}
		items = append(items, item)
	}
	return items, nil
}

// ─── Group Queries ───────────────────────────────────────────────────

func (r *Repository) ListTunnelGroups() ([]map[string]interface{}, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var groups []model.TunnelGroup
	if err := r.db.Order("id ASC").Find(&groups).Error; err != nil {
		return nil, err
	}
	result := make([]map[string]interface{}, 0, len(groups))
	for _, g := range groups {
		ids, names, err := r.listTunnelGroupMembers(g.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, map[string]interface{}{
			"id": g.ID, "name": g.Name, "status": g.Status,
			"tunnelIds": ids, "tunnelNames": names,
			"createdTime": g.CreatedTime,
		})
	}
	return result, nil
}

func (r *Repository) ListUserGroups() ([]map[string]interface{}, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var groups []model.UserGroup
	if err := r.db.Order("id ASC").Find(&groups).Error; err != nil {
		return nil, err
	}
	result := make([]map[string]interface{}, 0, len(groups))
	for _, g := range groups {
		ids, names, err := r.listUserGroupMembers(g.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, map[string]interface{}{
			"id": g.ID, "name": g.Name, "status": g.Status,
			"userIds": ids, "userNames": names,
			"createdTime": g.CreatedTime,
		})
	}
	return result, nil
}

func (r *Repository) ListGroupPermissions() ([]map[string]interface{}, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	type permRow struct {
		ID              int64
		UserGroupID     int64
		UserGroupName   sql.NullString
		TunnelGroupID   int64
		TunnelGroupName sql.NullString
		CreatedTime     int64
	}
	var rows []permRow
	err := r.db.Model(&model.GroupPermission{}).
		Select("group_permission.id, group_permission.user_group_id, user_group.name AS user_group_name, group_permission.tunnel_group_id, tunnel_group.name AS tunnel_group_name, group_permission.created_time").
		Joins("LEFT JOIN user_group ON user_group.id = group_permission.user_group_id").
		Joins("LEFT JOIN tunnel_group ON tunnel_group.id = group_permission.tunnel_group_id").
		Order("group_permission.id ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		result = append(result, map[string]interface{}{
			"id": r.ID, "userGroupId": r.UserGroupID,
			"userGroupName":   nullableString(r.UserGroupName),
			"tunnelGroupId":   r.TunnelGroupID,
			"tunnelGroupName": nullableString(r.TunnelGroupName),
			"createdTime":     r.CreatedTime,
		})
	}
	return result, nil
}

func (r *Repository) listTunnelGroupMembers(groupID int64) ([]int64, []string, error) {
	type row struct {
		ID   int64
		Name string
	}
	var rows []row
	err := r.db.Model(&model.TunnelGroupTunnel{}).
		Select("tunnel.id, tunnel.name").
		Joins("JOIN tunnel ON tunnel.id = tunnel_group_tunnel.tunnel_id").
		Where("tunnel_group_tunnel.tunnel_group_id = ?", groupID).
		Order("tunnel.id ASC").
		Find(&rows).Error
	if err != nil {
		return nil, nil, err
	}
	ids := make([]int64, 0, len(rows))
	names := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
		names = append(names, r.Name)
	}
	return ids, names, nil
}

func (r *Repository) listUserGroupMembers(groupID int64) ([]int64, []string, error) {
	type row struct {
		ID   int64
		Name string
	}
	var rows []row
	err := r.db.Model(&model.UserGroupUser{}).
		Select(`"user".id, "user"."user" AS name`).
		Joins(`JOIN "user" ON "user".id = user_group_user.user_id`).
		Where("user_group_user.user_group_id = ?", groupID).
		Order(`"user".id ASC`).
		Find(&rows).Error
	if err != nil {
		return nil, nil, err
	}
	ids := make([]int64, 0, len(rows))
	names := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
		names = append(names, r.Name)
	}
	return ids, names, nil
}
