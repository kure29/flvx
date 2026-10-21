package handler

import (
	"net/http"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/store/model"
)

// Subscription traffic history: hourly rows (model.SubscriptionTraffic)
// summed into the last 24 hours, 30 days or 12 months, in the viewer's
// time zone.

// subTrafficRetention keeps a little over a year, for the monthly view.
const subTrafficRetention = 400 * 24 * time.Hour

type subTrafficRequest struct {
	ID    int64  `json:"id"`
	Range string `json:"range"`
	// TZOffset is the viewer's offset from UTC in minutes (UTC+8 = 480).
	TZOffset int `json:"tzOffset"`
}

type subTrafficPoint struct {
	// Time is the unix ms the bucket starts at.
	Time int64 `json:"time"`
	Up   int64 `json:"up"`
	Down int64 `json:"down"`
}

type subTrafficView struct {
	Range  string            `json:"range"`
	Points []subTrafficPoint `json:"points"`
	Up     int64             `json:"up"`
	Down   int64             `json:"down"`
}

// subTrafficBuckets returns the bucket starts of a range ending at now:
// 24 hours, 30 days or 12 months.
func subTrafficBuckets(rangeKey string, now time.Time) []time.Time {
	var out []time.Time
	switch rangeKey {
	case "day":
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		for i := 29; i >= 0; i-- {
			out = append(out, today.AddDate(0, 0, -i))
		}
	case "month":
		month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		for i := 11; i >= 0; i-- {
			out = append(out, month.AddDate(0, -i, 0))
		}
	default:
		hour := now.Truncate(time.Hour)
		for i := 23; i >= 0; i-- {
			out = append(out, hour.Add(-time.Duration(i)*time.Hour))
		}
	}
	return out
}

// subTraffic sums a subscription's hours into the range's buckets.
func subTraffic(hours []model.SubscriptionTraffic, rangeKey string, now time.Time) subTrafficView {
	if rangeKey != "day" && rangeKey != "month" {
		rangeKey = "hour"
	}
	starts := subTrafficBuckets(rangeKey, now)
	view := subTrafficView{Range: rangeKey, Points: make([]subTrafficPoint, len(starts))}
	for i, s := range starts {
		view.Points[i].Time = s.UnixMilli()
	}
	b := 0
	for _, h := range hours {
		if h.Hour < view.Points[0].Time {
			continue
		}
		for b+1 < len(view.Points) && h.Hour >= view.Points[b+1].Time {
			b++
		}
		view.Points[b].Up += h.UploadBytes
		view.Points[b].Down += h.DownloadBytes
		view.Up += h.UploadBytes
		view.Down += h.DownloadBytes
	}
	return view
}

func (h *Handler) respondSubTraffic(w http.ResponseWriter, s *model.Subscription, req subTrafficRequest) {
	if req.TZOffset < -14*60 || req.TZOffset > 14*60 {
		req.TZOffset = 0
	}
	now := time.Now().In(time.FixedZone("", req.TZOffset*60))
	starts := subTrafficBuckets(req.Range, now)
	hours, err := h.repo.ListSubscriptionTraffic(s.ID, starts[0].UnixMilli())
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(subTraffic(hours, req.Range, now)))
}

func (h *Handler) subscriptionTraffic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req subTrafficRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	s, err := h.repo.GetSubscription(req.ID)
	if err != nil || s == nil {
		response.WriteJSON(w, response.ErrDefault("订阅不存在"))
		return
	}
	h.respondSubTraffic(w, s, req)
}

// userSubscriptionTraffic is the same history for one of the caller's own
// subscriptions.
func (h *Handler) userSubscriptionTraffic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	uid, err := userIDFromRequest(r)
	if err != nil {
		response.WriteJSON(w, response.ErrDefault("未登录"))
		return
	}
	var req subTrafficRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	s, err := h.repo.GetSubscription(req.ID)
	if err != nil || s == nil || s.UserID != uid {
		response.WriteJSON(w, response.ErrDefault("订阅不存在"))
		return
	}
	h.respondSubTraffic(w, s, req)
}
