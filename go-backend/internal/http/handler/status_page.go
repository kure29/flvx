package handler

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/kernel"
)

// The public status page: a read-only view of the nodes an admin marked
// public, served without login at /status/<slug>. Its one endpoint
// returns only the fields in statusNode (no address, port, secret, remark
// or agent version), answers 404 while the page is off or the slug is
// wrong, caches its answer for a few seconds and limits each client IP.

const (
	statusEnabledConfig = "status_page_enabled"
	statusTitleConfig   = "status_page_title"
	statusSlugConfig    = "status_page_slug"

	statusCacheTTL     = 3 * time.Second
	statusRateWindow   = time.Minute
	statusRatePerIP    = 120
	statusMaxTitleRune = 50
)

type statusLatency struct {
	Name    string  `json:"name"`
	OK      bool    `json:"ok"`
	Ms      int64   `json:"ms,omitempty"`
	LossPct float64 `json:"lossPct,omitempty"`
	// Route is the return route's name (e.g. CN2 GIA), never its hops.
	Route   string `json:"route,omitempty"`
	RouteV6 string `json:"routeV6,omitempty"`
}

// statusNode is everything the status page shows about a node.
type statusNode struct {
	Name   string `json:"name"`
	Region string `json:"region"`
	Online bool   `json:"online"`
	// Uptime is seconds since the server booted.
	Uptime   int64           `json:"uptime"`
	CPU      float64         `json:"cpu"`
	Mem      float64         `json:"mem"`
	Disk     float64         `json:"disk"`
	Load     float64         `json:"load"`
	NetIn    int64           `json:"netIn"`
	NetOut   int64           `json:"netOut"`
	MonthIn  int64           `json:"monthIn"`
	MonthOut int64           `json:"monthOut"`
	TCP      int64           `json:"tcp"`
	UDP      int64           `json:"udp"`
	Latency  []statusLatency `json:"latency"`
}

type statusView struct {
	Title     string       `json:"title"`
	Nodes     []statusNode `json:"nodes"`
	UpdatedAt int64        `json:"updatedAt"`
}

type statusSettings struct {
	Enabled bool   `json:"enabled"`
	Title   string `json:"title"`
	Slug    string `json:"slug"`
}

func (h *Handler) statusSettings() statusSettings {
	cfg, _ := h.repo.GetConfigsByNames([]string{statusEnabledConfig, statusTitleConfig, statusSlugConfig})
	return statusSettings{Enabled: cfg[statusEnabledConfig] == "true", Title: cfg[statusTitleConfig], Slug: cfg[statusSlugConfig]}
}

func newStatusSlug() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// buildStatusView reads the nodes (all, or the public ones) and their last
// reports. Monthly traffic starts at the 1st in the viewer's time zone.
func (h *Handler) buildStatusView(publicOnly bool, tzOffset int, title string) (statusView, error) {
	nodes, err := h.repo.ListMonitorNodes()
	if err != nil {
		return statusView{}, err
	}
	now := time.Now().In(time.FixedZone("", tzOffset*60))
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	traffic, _ := h.repo.NodeTrafficSince(month.UnixMilli())
	view := statusView{Title: title, Nodes: []statusNode{}, UpdatedAt: time.Now().UnixMilli()}
	for _, n := range nodes {
		if publicOnly && n.StatusPublic != 1 {
			continue
		}
		item := statusNode{Name: n.Name, Region: kernel.RegionOf(n.Name), Online: n.Status == 1, Latency: []statusLatency{},
			MonthIn: traffic[n.ID][0], MonthOut: traffic[n.ID][1]}
		if m, ok := h.metrics.LatestNodeMetric(n.ID); ok && item.Online {
			item.Uptime, item.CPU, item.Mem, item.Disk, item.Load = m.Uptime, m.CPUUsage, m.MemUsage, m.DiskUsage, m.Load1
			item.NetIn, item.NetOut, item.TCP, item.UDP = m.NetInSpeed, m.NetOutSpeed, m.TCPConns, m.UDPConns
		}
		if p, ok := h.nodeLatency.get(n.ID); ok && item.Online {
			for _, pt := range h.withRoutes(n.ID, p).Points {
				item.Latency = append(item.Latency, statusLatency{Name: pt.Name, OK: pt.OK, Ms: pt.LatencyMs, LossPct: pt.LossPct,
					Route: pt.Route, RouteV6: pt.RouteV6})
			}
		}
		view.Nodes = append(view.Nodes, item)
	}
	return view, nil
}

// statusCache keeps the public answer per time zone for statusCacheTTL;
// statusRate counts each client IP's requests in the current window.
var statusCache = struct {
	sync.Mutex
	views map[int]statusView
	at    map[int]time.Time
	rate  map[string]int
	reset time.Time
}{views: map[int]statusView{}, at: map[int]time.Time{}, rate: map[string]int{}}

func statusAllowed(ip string, now time.Time) bool {
	statusCache.Lock()
	defer statusCache.Unlock()
	if now.Sub(statusCache.reset) >= statusRateWindow {
		statusCache.rate, statusCache.reset = map[string]int{}, now
	}
	statusCache.rate[ip]++
	return statusCache.rate[ip] <= statusRatePerIP
}

// statusClientIP is the address the rate limit counts. Behind a local
// proxy it is the rightmost public address the proxies recorded: entries
// left of it come from the client and can be made up.
func statusClientIP(r *http.Request) string {
	remote := parseIPLiteral(r.RemoteAddr)
	if !isTrustedProxyIP(remote) {
		return remote.String()
	}
	hops := append(strings.Split(r.Header.Get("X-Forwarded-For"), ","), r.Header.Get("X-Real-IP"))
	for i := len(hops) - 1; i >= 0; i-- {
		if ip := parseIPLiteral(hops[i]); ip != nil && !isTrustedProxyIP(ip) {
			return ip.String()
		}
	}
	return remote.String()
}

// publicStatus serves GET /api/v1/open_api/status/<slug>?tz=<minutes>.
func (h *Handler) publicStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}
	slug := strings.TrimPrefix(r.URL.Path, "/api/v1/open_api/status/")
	s := h.statusSettings()
	if !s.Enabled || s.Slug == "" || subtle.ConstantTimeCompare([]byte(slug), []byte(s.Slug)) != 1 {
		http.NotFound(w, r)
		return
	}
	ip := statusClientIP(r)
	now := time.Now()
	if !statusAllowed(ip, now) {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	tz, _ := strconv.Atoi(r.URL.Query().Get("tz"))
	if tz < -14*60 || tz > 14*60 {
		tz = 0
	}
	statusCache.Lock()
	view, ok := statusCache.views[tz]
	fresh := ok && now.Sub(statusCache.at[tz]) < statusCacheTTL && view.Title == s.Title
	statusCache.Unlock()
	if !fresh {
		var err error
		if view, err = h.buildStatusView(true, tz, s.Title); err != nil {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		statusCache.Lock()
		statusCache.views[tz], statusCache.at[tz] = view, now
		statusCache.Unlock()
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex")
	response.WriteJSON(w, response.OK(view))
}

// monitorStatus is the same read-only view of every node for logged-in
// users allowed to see monitoring.
func (h *Handler) monitorStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	if !h.ensureMonitoringAccess(w, r) {
		return
	}
	tz, _ := strconv.Atoi(r.URL.Query().Get("tz"))
	if tz < -14*60 || tz > 14*60 {
		tz = 0
	}
	view, err := h.buildStatusView(false, tz, "")
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(view))
}

type statusPageNode struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Public bool   `json:"public"`
}

// nodeStatusPageGet returns the page settings and the nodes it can show
// (remote nodes report no metrics), marked public or not.
func (h *Handler) nodeStatusPageGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	nodes, err := h.repo.ListMonitorNodes()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	items := make([]statusPageNode, 0, len(nodes))
	for _, n := range nodes {
		items = append(items, statusPageNode{ID: n.ID, Name: n.Name, Public: n.StatusPublic == 1})
	}
	response.WriteJSON(w, response.OK(map[string]interface{}{"settings": h.statusSettings(), "nodes": items}))
}

// nodeStatusPageSave turns the page on or off, sets its title and can
// give it a new path (the old link stops working).
func (h *Handler) nodeStatusPageSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		Enabled bool   `json:"enabled"`
		Title   string `json:"title"`
		NewSlug bool   `json:"newSlug"`
	}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if len([]rune(req.Title)) > statusMaxTitleRune {
		response.WriteJSON(w, response.ErrDefault("标题最多 50 个字"))
		return
	}
	s := h.statusSettings()
	if s.Slug == "" || req.NewSlug {
		s.Slug = newStatusSlug()
	}
	values := map[string]string{statusEnabledConfig: strconv.FormatBool(req.Enabled), statusTitleConfig: req.Title, statusSlugConfig: s.Slug}
	if err := h.repo.UpsertConfigs(values, time.Now().UnixMilli()); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(h.statusSettings()))
}

// nodeStatusPublic shows or hides one node on the page.
func (h *Handler) nodeStatusPublic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		ID     int64 `json:"id"`
		Public bool  `json:"public"`
	}
	if err := decodeJSON(r.Body, &req); err != nil || req.ID <= 0 {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	if err := h.repo.SetNodeStatusPublic(req.ID, req.Public); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OKEmpty())
}

// nodeTrafficMonth returns each node's traffic since the 1st of this month
// in the viewer's time zone, for the node list: {"<id>": [in, out]}.
func (h *Handler) nodeTrafficMonth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		TZOffset int `json:"tzOffset"`
	}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	if req.TZOffset < -14*60 || req.TZOffset > 14*60 {
		req.TZOffset = 0
	}
	now := time.Now().In(time.FixedZone("", req.TZOffset*60))
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	traffic, err := h.repo.NodeTrafficSince(month.UnixMilli())
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	out := make(map[string][2]int64, len(traffic))
	for id, v := range traffic {
		out[strconv.FormatInt(id, 10)] = v
	}
	response.WriteJSON(w, response.OK(out))
}
