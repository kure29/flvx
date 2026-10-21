package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/kernel"
	"go-backend/internal/store/model"
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
	statusBgConfig      = "status_page_bg"
	statusCardConfig    = "status_page_card_opacity"

	statusCacheTTL     = 3 * time.Second
	statusRateWindow   = time.Minute
	statusRatePerIP    = 120
	statusMaxTitleRune = 50
	// statusHistLen latency rounds (about an hour) per reference point.
	statusHistLen = 20
)

type statusLatency struct {
	Name    string  `json:"name"`
	OK      bool    `json:"ok"`
	Ms      int64   `json:"ms,omitempty"`
	LossPct float64 `json:"lossPct,omitempty"`
	// Route is the return route's name (e.g. CN2 GIA), never its hops.
	Route   string `json:"route,omitempty"`
	RouteV6 string `json:"routeV6,omitempty"`
	// Hist is the last rounds, oldest first: [ms, loss %, unix ms], with
	// ms 0 and loss 100 for a failed round.
	Hist [][3]float64 `json:"hist,omitempty"`
}

// statusNode is everything the status page shows about a node.
type statusNode struct {
	// Key opens the node's details on the public page (statusNodeKey).
	Key    string `json:"key,omitempty"`
	Name   string `json:"name"`
	Region string `json:"region"`
	Online bool   `json:"online"`
	// Uptime is seconds since the server booted.
	Uptime int64   `json:"uptime"`
	CPU    float64 `json:"cpu"`
	Mem    float64 `json:"mem"`
	Disk   float64 `json:"disk"`
	Load   float64 `json:"load"`
	// Cores is the CPU count, 0 from older agents.
	Cores    int             `json:"cores,omitempty"`
	NetIn    int64           `json:"netIn"`
	NetOut   int64           `json:"netOut"`
	MonthIn  int64           `json:"monthIn"`
	MonthOut int64           `json:"monthOut"`
	TCP      int64           `json:"tcp"`
	UDP      int64           `json:"udp"`
	Latency  []statusLatency `json:"latency"`
}

type statusView struct {
	Title string `json:"title"`
	// Background is an image URL behind the page; CardOpacity (10-100)
	// lets it show through the cards.
	Background  string       `json:"background,omitempty"`
	CardOpacity int          `json:"cardOpacity"`
	Nodes       []statusNode `json:"nodes"`
	UpdatedAt   int64        `json:"updatedAt"`
}

type statusSettings struct {
	Enabled     bool   `json:"enabled"`
	Title       string `json:"title"`
	Slug        string `json:"slug"`
	Background  string `json:"background"`
	CardOpacity int    `json:"cardOpacity"`
}

func (h *Handler) statusSettings() statusSettings {
	cfg, _ := h.repo.GetConfigsByNames([]string{statusEnabledConfig, statusTitleConfig, statusSlugConfig, statusBgConfig, statusCardConfig})
	opacity, err := strconv.Atoi(cfg[statusCardConfig])
	if err != nil || opacity < 10 || opacity > 100 {
		opacity = 100
	}
	return statusSettings{Enabled: cfg[statusEnabledConfig] == "true", Title: cfg[statusTitleConfig], Slug: cfg[statusSlugConfig],
		Background: cfg[statusBgConfig], CardOpacity: opacity}
}

// validStatusBackground accepts an http(s) URL or a path on this site,
// with nothing that could step out of a CSS url("...").
func validStatusBackground(v string) bool {
	if v == "" {
		return true
	}
	if len(v) > 500 || strings.ContainsAny(v, "\"'()\\<> \t\r\n") {
		return false
	}
	if strings.HasPrefix(v, "/") && !strings.HasPrefix(v, "//") {
		return true
	}
	u, err := url.Parse(v)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != ""
}

func newStatusSlug() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// buildStatusView reads the nodes (all, or the public ones) and their last
// reports. Monthly traffic starts at the 1st in the viewer's time zone.
// slug, when set, gives each node its detail key.
func (h *Handler) buildStatusView(publicOnly bool, tzOffset int, title, slug string) (statusView, error) {
	nodes, err := h.repo.ListMonitorNodes()
	if err != nil {
		return statusView{}, err
	}
	now := time.Now().In(time.FixedZone("", tzOffset*60))
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	traffic, _ := h.repo.NodeTrafficSince(month.UnixMilli())
	view := statusView{Title: title, Nodes: []statusNode{}, UpdatedAt: time.Now().UnixMilli()}
	hist := h.statusLatencyHistory(nodes, publicOnly)
	for _, n := range nodes {
		if publicOnly && n.StatusPublic != 1 {
			continue
		}
		item := statusNode{Name: n.Name, Region: kernel.RegionOf(n.Name), Online: n.Status == 1, Latency: []statusLatency{},
			MonthIn: traffic[n.ID][0], MonthOut: traffic[n.ID][1]}
		if slug != "" {
			item.Key = statusNodeKey(slug, n.ID)
		}
		if m, ok := h.metrics.LatestNodeMetric(n.ID); ok && item.Online {
			item.Uptime, item.CPU, item.Mem, item.Disk, item.Load = m.Uptime, m.CPUUsage, m.MemUsage, m.DiskUsage, m.Load1
			item.NetIn, item.NetOut, item.TCP, item.UDP = m.NetInSpeed, m.NetOutSpeed, m.TCPConns, m.UDPConns
			item.Cores = h.metrics.NodeCPUCores(n.ID)
		}
		if p, ok := h.nodeLatency.get(n.ID); ok && item.Online {
			for _, pt := range h.withRoutes(n.ID, p).Points {
				item.Latency = append(item.Latency, statusLatency{Name: pt.Name, OK: pt.OK, Ms: pt.LatencyMs, LossPct: pt.LossPct,
					Route: pt.Route, RouteV6: pt.RouteV6, Hist: hist[latencyHistKey{n.ID, pt.Name}]})
			}
		}
		view.Nodes = append(view.Nodes, item)
	}
	return view, nil
}

type latencyHistKey struct {
	node  int64
	point string
}

// statusLatencyHistory reads the last statusHistLen rounds of each shown
// node's reference points in one query.
func (h *Handler) statusLatencyHistory(nodes []model.Node, publicOnly bool) map[latencyHistKey][][3]float64 {
	var ids []int64
	for _, n := range nodes {
		if n.Status == 1 && (!publicOnly || n.StatusPublic == 1) {
			ids = append(ids, n.ID)
		}
	}
	since := time.Now().Add(-time.Duration(statusHistLen+3) * reachProbeInterval).UnixMilli()
	samples, err := h.repo.ListLatencySamplesSince(ids, since)
	out := make(map[latencyHistKey][][3]float64)
	if err != nil {
		return out
	}
	for _, s := range samples {
		k := latencyHistKey{s.NodeID, s.Point}
		v := [3]float64{0, 100, float64(s.CreatedTime)}
		if s.OK == 1 {
			v[0], v[1] = float64(s.LatencyMs), s.LossPct
		}
		out[k] = append(out[k], v)
	}
	for k, v := range out {
		if len(v) > statusHistLen {
			out[k] = v[len(v)-statusHistLen:]
		}
	}
	return out
}

// statusCache keeps the public answer per time zone for statusCacheTTL;
// statusRate counts each client IP's requests in the current window.
var statusCache = struct {
	sync.Mutex
	views map[int]statusView
	at    map[int]time.Time
	slug  string
	rate  map[string]int
	reset time.Time
	// details keeps node detail answers by key and hours.
	details   map[string]statusDetail
	detailsAt map[string]time.Time
}{views: map[int]statusView{}, at: map[int]time.Time{}, rate: map[string]int{},
	details: map[string]statusDetail{}, detailsAt: map[string]time.Time{}}

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
	slug, rest, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/api/v1/open_api/status/"), "/")
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
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex")
	if rest != "" {
		key, ok := strings.CutPrefix(rest, "node/")
		if !ok || key == "" {
			http.NotFound(w, r)
			return
		}
		h.publicStatusNode(w, r, s.Slug, key, now)
		return
	}
	tz, _ := strconv.Atoi(r.URL.Query().Get("tz"))
	if tz < -14*60 || tz > 14*60 {
		tz = 0
	}
	statusCache.Lock()
	if statusCache.slug != s.Slug {
		statusCache.views, statusCache.at, statusCache.slug = map[int]statusView{}, map[int]time.Time{}, s.Slug
		statusCache.details, statusCache.detailsAt = map[string]statusDetail{}, map[string]time.Time{}
	}
	view, ok := statusCache.views[tz]
	fresh := ok && now.Sub(statusCache.at[tz]) < statusCacheTTL && view.Title == s.Title &&
		view.Background == s.Background && view.CardOpacity == s.CardOpacity
	statusCache.Unlock()
	if !fresh {
		var err error
		if view, err = h.buildStatusView(true, tz, s.Title, s.Slug); err != nil {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		view.Background, view.CardOpacity = s.Background, s.CardOpacity
		statusCache.Lock()
		statusCache.views[tz], statusCache.at[tz] = view, now
		statusCache.Unlock()
	}
	response.WriteJSON(w, response.OK(view))
}

// statusNodeKey names a public node without its ID; a new link gives
// every node a new key.
func statusNodeKey(slug string, id int64) string {
	sum := sha256.Sum256([]byte(slug + "/" + strconv.FormatInt(id, 10)))
	return hex.EncodeToString(sum[:6])
}

// statusMetricPoint is one moment of a node's history:
// [unix ms, cpu %, mem %, disk %, load1, net in B/s, net out B/s].
type statusMetricPoint [7]float64

type statusPointHistory struct {
	Name  string `json:"name"`
	Route string `json:"route,omitempty"`
	// Samples are [unix ms, ms, loss %], ms 0 and loss 100 when it failed.
	Samples [][3]float64 `json:"samples"`
}

// statusDetail is a public node's history for the detail view.
type statusDetail struct {
	Name    string               `json:"name"`
	Region  string               `json:"region"`
	Online  bool                 `json:"online"`
	Cores   int                  `json:"cores,omitempty"`
	Hours   int                  `json:"hours"`
	Metrics []statusMetricPoint  `json:"metrics"`
	Latency []statusPointHistory `json:"latency"`
}

const (
	statusDetailTTL       = 30 * time.Second
	statusDetailMaxPoints = 360
)

// publicStatusNode serves GET .../status/<slug>/node/<key>?hours=1|6|24:
// one public node's resource and latency history.
func (h *Handler) publicStatusNode(w http.ResponseWriter, r *http.Request, slug, key string, now time.Time) {
	hours, _ := strconv.Atoi(r.URL.Query().Get("hours"))
	if hours != 6 && hours != 24 {
		hours = 1
	}
	cacheKey := key + "/" + strconv.Itoa(hours)
	statusCache.Lock()
	d, ok := statusCache.details[cacheKey]
	fresh := ok && statusCache.slug == slug && now.Sub(statusCache.detailsAt[cacheKey]) < statusDetailTTL
	statusCache.Unlock()
	if fresh {
		response.WriteJSON(w, response.OK(d))
		return
	}
	nodes, err := h.repo.ListMonitorNodes()
	if err != nil {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
		return
	}
	var node *model.Node
	for i := range nodes {
		if nodes[i].StatusPublic == 1 && subtle.ConstantTimeCompare([]byte(statusNodeKey(slug, nodes[i].ID)), []byte(key)) == 1 {
			node = &nodes[i]
			break
		}
	}
	if node == nil {
		http.NotFound(w, r)
		return
	}
	from := now.Add(-time.Duration(hours) * time.Hour).UnixMilli()
	d = statusDetail{Name: node.Name, Region: kernel.RegionOf(node.Name), Online: node.Status == 1,
		Cores: h.metrics.NodeCPUCores(node.ID), Hours: hours, Metrics: []statusMetricPoint{}, Latency: []statusPointHistory{}}
	if rows, err := h.repo.GetNodeMetrics(node.ID, from, now.UnixMilli()); err == nil {
		step := (len(rows) + statusDetailMaxPoints - 1) / statusDetailMaxPoints
		if step < 1 {
			step = 1
		}
		for i := 0; i < len(rows); i += step {
			m := rows[i]
			d.Metrics = append(d.Metrics, statusMetricPoint{float64(m.Timestamp), m.CPUUsage, m.MemUsage, m.DiskUsage,
				m.Load1, float64(m.NetInSpeed), float64(m.NetOutSpeed)})
		}
	}
	routes := map[string]string{}
	if p, ok := h.nodeLatency.get(node.ID); ok {
		for _, pt := range h.withRoutes(node.ID, p).Points {
			routes[pt.Name] = pt.Route
		}
	}
	if samples, err := h.repo.ListNodeLatencySamples(node.ID, from); err == nil {
		index := map[string]int{}
		for _, smp := range samples {
			i, ok := index[smp.Point]
			if !ok {
				i = len(d.Latency)
				index[smp.Point] = i
				d.Latency = append(d.Latency, statusPointHistory{Name: smp.Point, Route: routes[smp.Point]})
			}
			v := [3]float64{float64(smp.CreatedTime), 0, 100}
			if smp.OK == 1 {
				v[1], v[2] = float64(smp.LatencyMs), smp.LossPct
			}
			d.Latency[i].Samples = append(d.Latency[i].Samples, v)
		}
	}
	statusCache.Lock()
	if statusCache.slug == slug {
		statusCache.details[cacheKey], statusCache.detailsAt[cacheKey] = d, now
	}
	statusCache.Unlock()
	response.WriteJSON(w, response.OK(d))
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
	view, err := h.buildStatusView(false, tz, "", "")
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
		// Left out, the background and card opacity stay as they are.
		Background  *string `json:"background"`
		CardOpacity *int    `json:"cardOpacity"`
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
	if req.Background != nil {
		bg := strings.TrimSpace(*req.Background)
		if !validStatusBackground(bg) {
			response.WriteJSON(w, response.ErrDefault("背景图要填 http(s) 地址或以 / 开头的路径"))
			return
		}
		values[statusBgConfig] = bg
	}
	if req.CardOpacity != nil {
		if *req.CardOpacity < 10 || *req.CardOpacity > 100 {
			response.WriteJSON(w, response.ErrDefault("卡片不透明度要在 10 到 100 之间"))
			return
		}
		values[statusCardConfig] = strconv.Itoa(*req.CardOpacity)
	}
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
