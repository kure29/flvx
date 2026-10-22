package handler

import (
	"net/http"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/kernel"
	"go-backend/internal/store/model"
)

// A panel user's view of the subscriptions assigned to them: links, traffic
// and expiry, without the admin's settings (sources, processing, remark).

type userSubscriptionView struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
	// Status is "ok", "disabled", "expired" or "over_quota".
	Status        string `json:"status"`
	ExpireTime    int64  `json:"expireTime"`
	NodeCount     int    `json:"nodeCount"`
	UploadBytes   int64  `json:"uploadBytes"`
	DownloadBytes int64  `json:"downloadBytes"`
	TrafficLimit  int64  `json:"trafficLimit"`
	ResetDay      int    `json:"resetDay"`
	// TrafficSince is when the traffic above started counting (unix ms).
	TrafficSince int64 `json:"trafficSince"`
	// NextResetTime is the next monthly traffic reset (unix ms; 0 none).
	NextResetTime int64 `json:"nextResetTime"`
	// Rules: routing rules are on, so some clients import a full config.
	Rules bool `json:"rules"`
	// Templates are the client slots rendered from a template (a
	// Shadowrocket template, like rules, makes it import a full config).
	Templates []string `json:"templates"`
}

func subStatus(s *model.Subscription, now time.Time) string {
	switch {
	case s.Enabled != 1:
		return "disabled"
	case s.ExpireTime > 0 && s.ExpireTime <= now.UnixMilli():
		return "expired"
	case subOverQuota(s):
		return "over_quota"
	}
	return "ok"
}

// nextResetAt is the monthly reset after now for reset day d.
func nextResetAt(d int, now time.Time) time.Time {
	return lastResetAt(d, now.AddDate(0, 1, 0))
}

func (h *Handler) userSubscriptionView(s *model.Subscription, rows []model.NodeInbound, now time.Time) userSubscriptionView {
	pipe := parsePipeline(s.Options)
	v := userSubscriptionView{
		ID: s.ID, Name: s.Name, Path: "/api/v1/open_api/sub/" + s.Token, Status: subStatus(s, now),
		ExpireTime: s.ExpireTime, UploadBytes: s.UploadBytes, DownloadBytes: s.DownloadBytes,
		TrafficLimit: s.TrafficLimit, ResetDay: s.ResetDay, TrafficSince: subTrafficSince(s), Rules: pipe.Rules, Templates: templateSlots(pipe),
		NodeCount: len(kernel.ApplySubOptions(h.subEndpoints(s, rows), pipe.options())),
	}
	if s.ResetDay > 0 {
		v.NextResetTime = nextResetAt(s.ResetDay, now).UnixMilli()
	}
	return v
}

// userSubscriptionList returns the subscriptions assigned to the caller.
func (h *Handler) userSubscriptionList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	uid, err := userIDFromRequest(r)
	if err != nil {
		response.WriteJSON(w, response.ErrDefault("未登录"))
		return
	}
	subs, err := h.repo.ListUserSubscriptions(uid)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	items := make([]userSubscriptionView, 0, len(subs))
	if len(subs) > 0 {
		rows, err := h.repo.ListNodeInbounds()
		if err != nil {
			response.WriteJSON(w, response.Err(-2, err.Error()))
			return
		}
		now := time.Now()
		for i := range subs {
			items = append(items, h.userSubscriptionView(&subs[i], rows, now))
		}
	}
	response.WriteJSON(w, response.OK(items))
}

// userSubscriptionReset gives one of the caller's subscriptions a new link
// and credentials; the old link and imported configs stop working.
func (h *Handler) userSubscriptionReset(w http.ResponseWriter, r *http.Request) {
	uid, err := userIDFromRequest(r)
	if err != nil {
		response.WriteJSON(w, response.ErrDefault("未登录"))
		return
	}
	id := idFromBody(r, w)
	if id <= 0 {
		return
	}
	s, err := h.repo.GetSubscription(id)
	if err != nil || s == nil || s.UserID != uid {
		response.WriteJSON(w, response.ErrDefault("订阅不存在"))
		return
	}
	rows, push, err := h.resetSubscriptionLink(s)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	h.respondAfterSubPush(w, push, h.userSubscriptionView(s, rows, time.Now()))
}

// userSubscriptionIDs reads the subscriptionIds of a user create / update
// request: the subscriptions the user should have. ok is false when the
// request leaves them alone.
func (h *Handler) userSubscriptionIDs(req map[string]interface{}) (ids []int64, ok bool, err error) {
	raw, ok := req["subscriptionIds"]
	if !ok || raw == nil {
		return nil, false, nil
	}
	ids = asInt64Slice(raw)
	for _, id := range ids {
		if s, err := h.repo.GetSubscription(id); err != nil || s == nil {
			return nil, false, errText("订阅不存在")
		}
	}
	return ids, true, nil
}

func templateSlots(p subPipeline) []string {
	out := []string{}
	for _, slot := range kernel.TemplateSlots {
		if p.Templates[slot] > 0 {
			out = append(out, slot)
		}
	}
	return out
}
