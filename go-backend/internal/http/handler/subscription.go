package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/kernel"
	"go-backend/internal/store/model"
	"go-backend/internal/store/repo"
)

var subscriptionCheckInterval = time.Minute

// subSyncMu keeps the loop and the traffic-triggered syncs from pushing the
// same kernels at once.
var subSyncMu sync.Mutex

// subPipeline is the JSON form of kernel.SubOptions stored per subscription.
type subPipeline struct {
	Lines        string   `json:"lines"`
	Regions      []string `json:"regions"`
	Protocols    []string `json:"protocols"`
	Include      string   `json:"include"`
	Exclude      string   `json:"exclude"`
	Rename       string   `json:"rename"`
	AddFlag      bool     `json:"addFlag"`
	Prefix       string   `json:"prefix"`
	Dedupe       bool     `json:"dedupe"`
	Sort         string   `json:"sort"`
	RegionGroups bool     `json:"regionGroups"`
	ChainLanding string   `json:"chainLanding"`
	ChainRelay   string   `json:"chainRelay"`
	Rules        bool     `json:"rules"`
	RuleGroups   []string `json:"ruleGroups"`
	// ChainLandingNames / ChainRelayNames are the nodes picked for the
	// chain, by their name before the pipeline.
	ChainLandingNames []string `json:"chainLandingNames"`
	ChainRelayNames   []string `json:"chainRelayNames"`
	Script            string   `json:"script"`
	// Templates picks a subscription template per kind (kernel.TemplateClash,
	// ...): template ids; a kind without one renders the built-in profile.
	Templates map[string]int64 `json:"templates,omitempty"`
}

func (p subPipeline) options() kernel.SubOptions {
	return kernel.SubOptions{
		Lines: p.Lines, Regions: p.Regions, Protocols: p.Protocols, Include: p.Include, Exclude: p.Exclude,
		Rename: p.Rename, AddFlag: p.AddFlag, Prefix: p.Prefix, Dedupe: p.Dedupe, Sort: p.Sort,
		RegionGroups: p.RegionGroups, ChainLanding: p.ChainLanding, ChainRelay: p.ChainRelay,
		Rules: p.Rules, RuleGroups: p.RuleGroups,
		ChainLandingNames: p.ChainLandingNames, ChainRelayNames: p.ChainRelayNames, Script: p.Script,
	}
}

func (p *subPipeline) normalize() error {
	p.Rename = strings.TrimSpace(strings.ReplaceAll(p.Rename, "\r\n", "\n"))
	p.Include = strings.TrimSpace(p.Include)
	p.Exclude = strings.TrimSpace(p.Exclude)
	p.ChainLanding = strings.TrimSpace(p.ChainLanding)
	p.ChainRelay = strings.TrimSpace(p.ChainRelay)
	if len(p.Rename) > 10000 || len(p.Include) > 1000 || len(p.Exclude) > 1000 ||
		len(p.ChainLanding) > 1000 || len(p.ChainRelay) > 1000 {
		return errText("规则太长")
	}
	if len([]rune(p.Prefix)) > 50 {
		return errText("前缀最多 50 个字")
	}
	if p.Sort != "name" {
		p.Sort = ""
	}
	if p.Lines != "relay" && p.Lines != "direct" {
		p.Lines = ""
	}
	if p.Regions == nil {
		p.Regions = []string{}
	}
	if p.Protocols == nil {
		p.Protocols = []string{}
	}
	p.RuleGroups = kernel.NormalizeRuleGroups(p.RuleGroups)
	var err error
	if p.ChainLandingNames, err = normalizeNames(p.ChainLandingNames); err != nil {
		return err
	}
	if p.ChainRelayNames, err = normalizeNames(p.ChainRelayNames); err != nil {
		return err
	}
	p.Script = strings.TrimSpace(strings.ReplaceAll(p.Script, "\r\n", "\n"))
	templates := map[string]int64{}
	for _, kind := range kernel.TemplateSlots {
		if id := p.Templates[kind]; id > 0 {
			templates[kind] = id
		}
	}
	p.Templates = templates
	return p.options().Validate()
}

func parsePipeline(raw string) subPipeline {
	var p subPipeline
	_ = json.Unmarshal([]byte(raw), &p)
	if p.Regions == nil {
		p.Regions = []string{}
	}
	if p.Protocols == nil {
		p.Protocols = []string{}
	}
	if p.RuleGroups == nil {
		p.RuleGroups = []string{}
	}
	if p.ChainLandingNames == nil {
		p.ChainLandingNames = []string{}
	}
	if p.ChainRelayNames == nil {
		p.ChainRelayNames = []string{}
	}
	return p
}

// normalizeNames trims and dedupes picked node names; a node picked as
// both landing and relay counts as landing (see markChain).
func normalizeNames(names []string) ([]string, error) {
	if len(names) > 1000 {
		return nil, errText("选的节点太多")
	}
	out := []string{}
	seen := map[string]bool{}
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" || seen[n] {
			continue
		}
		if len([]rune(n)) > 200 {
			return nil, errText("节点名称太长")
		}
		seen[n] = true
		out = append(out, n)
	}
	return out, nil
}

type errText string

func (e errText) Error() string { return string(e) }

func parseIDList(s string) []int64 {
	var out []int64
	seen := map[int64]bool{}
	for _, part := range strings.Split(s, ",") {
		id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
		if err == nil && id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func formatIDList(ids []int64) string {
	sorted := append([]int64(nil), ids...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	parts := make([]string, len(sorted))
	for i, id := range sorted {
		parts[i] = strconv.FormatInt(id, 10)
	}
	return strings.Join(parts, ",")
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	h := hex.EncodeToString(b)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

// subActive reports whether the link works (and, for share subscriptions,
// whether its credentials must be on the kernels).
func subActive(s *model.Subscription, now time.Time) bool {
	return s.Enabled == 1 && (s.ExpireTime == 0 || s.ExpireTime > now.UnixMilli()) && !subOverQuota(s)
}

func subUsed(s *model.Subscription) int64 { return s.UploadBytes + s.DownloadBytes }

func subOverQuota(s *model.Subscription) bool {
	return s.TrafficLimit > 0 && subUsed(s) >= s.TrafficLimit
}

// lastResetAt is the most recent monthly reset moment at or before now for
// reset day d (local time), clamped to the month's length.
func lastResetAt(d int, now time.Time) time.Time {
	at := func(y int, m time.Month) time.Time {
		last := time.Date(y, m+1, 0, 0, 0, 0, 0, now.Location()).Day()
		day := d
		if day > last {
			day = last
		}
		return time.Date(y, m, day, 0, 0, 0, 0, now.Location())
	}
	t := at(now.Year(), now.Month())
	if t.After(now) {
		t = at(now.Year(), now.Month()-1)
	}
	return t
}

// subDueReset reports whether the monthly reset is due.
func subDueReset(s *model.Subscription, now time.Time) bool {
	if s.ResetDay <= 0 || !isShare(s) {
		return false
	}
	return s.TrafficResetTime < lastResetAt(s.ResetDay, now).UnixMilli()
}

// applyUserCounters adds a node's per-user traffic to the subscriptions
// and cuts off the ones that reached their limit right away.
func (h *Handler) applyUserCounters(nodeID int64, epoch string, counters []agentUserCounter, now int64) {
	samples := make([]repo.SubscriptionCounterSample, 0, len(counters))
	for _, c := range counters {
		samples = append(samples, repo.SubscriptionCounterSample{SubscriptionID: c.ID, Direction: c.Dir, Bytes: c.Bytes})
	}
	if err := h.repo.ApplySubscriptionCounterSamples(nodeID, epoch, samples, now); err != nil {
		log.Printf("subscription traffic apply failed node_id=%d err=%v", nodeID, err)
		return
	}
	h.syncSubscriptions(time.UnixMilli(now))
}

func isShare(s *model.Subscription) bool { return s.Kind == model.SubscriptionShare }

func kernelUser(s *model.Subscription) kernel.User {
	return kernel.User{ID: s.ID, UUID: s.UUID, Password: s.Password}
}

// subInboundIDs resolves the subscription's sources against the inbounds.
func subInboundIDs(s *model.Subscription, rows []model.NodeInbound) []int64 {
	if s.SourceAll == 1 {
		ids := make([]int64, 0, len(rows))
		for _, r := range rows {
			ids = append(ids, r.ID)
		}
		return ids
	}
	ids := subExplicitIDs(s, rows)
	picked := make(map[int64]bool, len(ids))
	for _, id := range ids {
		picked[id] = true
	}
	sources := map[int64]bool{}
	for _, id := range parseIDList(s.SourceIDs) {
		sources[id] = true
	}
	for _, r := range rows {
		if r.SourceID != 0 && sources[r.SourceID] && !picked[r.ID] {
			ids = append(ids, r.ID)
		}
	}
	return ids
}

// subExplicitIDs are the inbounds picked one by one (still existing).
func subExplicitIDs(s *model.Subscription, rows []model.NodeInbound) []int64 {
	known := make(map[int64]bool, len(rows))
	for _, r := range rows {
		known[r.ID] = true
	}
	var ids []int64
	for _, id := range parseIDList(s.InboundIDs) {
		if known[id] {
			ids = append(ids, id)
		}
	}
	return ids
}

// activeUsersByInbound maps inbound ids to the share subscriptions whose
// credentials the kernels must currently accept.
func (h *Handler) activeUsersByInbound(now time.Time) map[int64][]kernel.User {
	subs, err := h.repo.ListSubscriptions()
	if err != nil {
		log.Printf("subscription lookup failed: %v", err)
		return nil
	}
	var rows []model.NodeInbound
	out := map[int64][]kernel.User{}
	for i := range subs {
		s := &subs[i]
		if !isShare(s) || !subActive(s, now) {
			continue
		}
		if rows == nil {
			if rows, err = h.repo.ListNodeInbounds(); err != nil {
				return nil
			}
		}
		for _, id := range subInboundIDs(s, rows) {
			out[id] = append(out[id], kernelUser(s))
		}
	}
	return out
}

// applyKernelsForInbounds pushes the kernels serving the given inbounds,
// once each. Imported nodes have no kernel and are skipped.
func (h *Handler) applyKernelsForInbounds(ids []int64) error {
	seen := map[int64]bool{}
	var firstErr error
	for _, id := range ids {
		row, err := h.repo.GetNodeInbound(id)
		if err != nil || row == nil || isExternalInbound(row) || seen[row.KernelID] {
			continue
		}
		seen[row.KernelID] = true
		if err := h.applyKernel(row.KernelID, false); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// syncSubscriptions pushes credential changes for share subscriptions
// whose active state differs from what the kernels last received.
func (h *Handler) syncSubscriptions(now time.Time) {
	subSyncMu.Lock()
	defer subSyncMu.Unlock()
	subs, err := h.repo.ListSubscriptions()
	if err != nil {
		return
	}
	var rows []model.NodeInbound
	for i := range subs {
		s := &subs[i]
		if subDueReset(s, now) {
			if err := h.repo.ResetSubscriptionTraffic(s.ID, now.UnixMilli()); err == nil {
				s.UploadBytes, s.DownloadBytes = 0, 0
				if h.notifier != nil {
					h.notifier.clearAlerts(fmt.Sprintf("subflow:%d:", s.ID))
				}
			}
		}
		active := boolToInt(isShare(s) && subActive(s, now))
		if active == s.AppliedActive {
			continue
		}
		if rows == nil {
			if rows, err = h.repo.ListNodeInbounds(); err != nil {
				return
			}
		}
		if err := h.applyKernelsForInbounds(subInboundIDs(s, rows)); err != nil {
			log.Printf("subscription %d kernel push failed: %v", s.ID, err)
		}
		_ = h.repo.UpdateSubscriptionApplied(s.ID, active)
	}
}

func (h *Handler) runSubscriptionLoop(ctx context.Context) {
	defer h.jobsWG.Done()
	ticker := time.NewTicker(subscriptionCheckInterval)
	defer ticker.Stop()
	for {
		h.syncSubscriptions(time.Now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// subEndpoints are the subscription's endpoints before its pipeline: the
// selected inbounds and their relays, with the share credentials where
// the protocol allows.
func (h *Handler) subEndpoints(s *model.Subscription, rows []model.NodeInbound) []kernel.Endpoint {
	want := map[int64]bool{}
	for _, id := range subInboundIDs(s, rows) {
		want[id] = true
	}
	selected := make([]model.NodeInbound, 0, len(want))
	for _, row := range rows {
		if want[row.ID] {
			selected = append(selected, row)
		}
	}
	endpoints, _ := h.inboundEndpoints(selected)
	if isShare(s) {
		ku := kernelUser(s)
		for i := range endpoints {
			if endpoints[i].Proxy == nil {
				endpoints[i].Inbound = endpoints[i].Inbound.ForUser(ku)
			}
		}
	}
	return endpoints
}

// ---- API ----

type subscriptionView struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Kind       string  `json:"kind"`
	Token      string  `json:"token"`
	Path       string  `json:"path"`
	SourceAll  bool    `json:"sourceAll"`
	InboundIDs []int64 `json:"inboundIds"`
	SourceIDs  []int64 `json:"sourceIds"`
	// SharedIDs are selected inbounds of a share subscription that can't
	// carry per-user credentials (Snell, Shadowsocks, imported nodes).
	SharedIDs  []int64     `json:"sharedIds"`
	Options    subPipeline `json:"options"`
	ExpireTime int64       `json:"expireTime"`
	Enabled    bool        `json:"enabled"`
	Active     bool        `json:"active"`
	Remark     string      `json:"remark"`
	NodeCount  int         `json:"nodeCount"`
	// Traffic (share subscriptions; bytes).
	UploadBytes   int64 `json:"uploadBytes"`
	DownloadBytes int64 `json:"downloadBytes"`
	TrafficLimit  int64 `json:"trafficLimit"`
	ResetDay      int   `json:"resetDay"`
	OverQuota     bool  `json:"overQuota"`
	// UserID / UserName: the panel user it is assigned to (0 = none).
	UserID   int64  `json:"userId"`
	UserName string `json:"userName,omitempty"`
}

// withUserName fills in the assigned user's name.
func (h *Handler) withUserName(v subscriptionView, names map[int64]string) subscriptionView {
	if v.UserID == 0 {
		return v
	}
	if names == nil {
		names, _ = h.repo.UserNames()
	}
	v.UserName = names[v.UserID]
	return v
}

func (h *Handler) subscriptionView(s *model.Subscription, rows []model.NodeInbound, now time.Time) subscriptionView {
	ids := subInboundIDs(s, rows)
	byID := make(map[int64]model.NodeInbound, len(rows))
	for _, r := range rows {
		byID[r.ID] = r
	}
	shared := []int64{}
	if isShare(s) {
		for _, id := range ids {
			row := byID[id]
			if isExternalInbound(&row) {
				shared = append(shared, id)
			} else if in, err := inboundFromModel(row); err == nil && !in.SupportsUsers() {
				shared = append(shared, id)
			}
		}
	}
	selected := []int64{}
	sourceIDs := []int64{}
	if s.SourceAll != 1 {
		selected = append(selected, subExplicitIDs(s, rows)...)
		sourceIDs = append(sourceIDs, parseIDList(s.SourceIDs)...)
	}
	pipe := parsePipeline(s.Options)
	return subscriptionView{
		ID: s.ID, Name: s.Name, Kind: s.Kind, Token: s.Token, Path: "/api/v1/open_api/sub/" + s.Token,
		SourceAll: s.SourceAll == 1, InboundIDs: selected, SourceIDs: sourceIDs, SharedIDs: shared, Options: pipe,
		ExpireTime: s.ExpireTime, Enabled: s.Enabled == 1, Active: subActive(s, now), Remark: s.Remark,
		NodeCount:   len(kernel.ApplySubOptions(h.subEndpoints(s, rows), pipe.options())),
		UploadBytes: s.UploadBytes, DownloadBytes: s.DownloadBytes, TrafficLimit: s.TrafficLimit,
		ResetDay: s.ResetDay, OverQuota: subOverQuota(s), UserID: s.UserID,
	}
}

func (h *Handler) subscriptionList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	subs, err := h.repo.ListSubscriptions()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	if len(subs) == 0 {
		// Start everyone off with one; deleting it later is the user's call.
		def, err := h.repo.DefaultSubscription(time.Now().UnixMilli())
		if err != nil {
			response.WriteJSON(w, response.Err(-2, err.Error()))
			return
		}
		subs = append(subs, *def)
	}
	rows, err := h.repo.ListNodeInbounds()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	now := time.Now()
	names, _ := h.repo.UserNames()
	items := make([]subscriptionView, 0, len(subs))
	for i := range subs {
		items = append(items, h.withUserName(h.subscriptionView(&subs[i], rows, now), names))
	}
	response.WriteJSON(w, response.OK(map[string]interface{}{
		"items":      items,
		"regions":    append(kernel.RegionNames(), kernel.RegionOther),
		"ruleGroups": kernel.RuleGroups(),
	}))
}

type subscriptionRequest struct {
	ID         int64       `json:"id"`
	Name       string      `json:"name"`
	Kind       string      `json:"kind"`
	SourceAll  bool        `json:"sourceAll"`
	InboundIDs []int64     `json:"inboundIds"`
	SourceIDs  []int64     `json:"sourceIds"`
	Options    subPipeline `json:"options"`
	ExpireTime int64       `json:"expireTime"`
	Enabled    *bool       `json:"enabled"`
	Remark     string      `json:"remark"`
	// TrafficLimit is in bytes (0 = unlimited); ResetDay 1-28 (0 = never).
	TrafficLimit int64 `json:"trafficLimit"`
	ResetDay     int   `json:"resetDay"`
}

// validate checks the request and returns the inbound ids it selects.
func (req *subscriptionRequest) validate(rows []model.NodeInbound) ([]int64, error) {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len([]rune(req.Name)) > 100 {
		return nil, errText("请填写名称（最多 100 个字）")
	}
	// Every subscription has its own credentials.
	req.Kind = model.SubscriptionShare
	if req.ExpireTime < 0 {
		req.ExpireTime = 0
	}
	if req.TrafficLimit < 0 {
		req.TrafficLimit = 0
	}
	if req.ResetDay < 0 || req.ResetDay > 28 {
		return nil, errText("每月重置日只能是 1–28 号")
	}
	if err := req.Options.normalize(); err != nil {
		return nil, err
	}
	known := make(map[int64]bool, len(rows))
	for _, r := range rows {
		known[r.ID] = true
	}
	var ids []int64
	for _, id := range req.InboundIDs {
		if known[id] {
			ids = append(ids, id)
		}
	}
	var sources []int64
	for _, id := range req.SourceIDs {
		if id > 0 {
			sources = append(sources, id)
		}
	}
	req.SourceIDs = sources
	if !req.SourceAll && len(ids) == 0 && len(sources) == 0 {
		return nil, errText("请至少选择一个入站或订阅源，或选择全部")
	}
	return ids, nil
}

func (h *Handler) subscriptionSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req subscriptionRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	rows, err := h.repo.ListNodeInbounds()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	ids, err := req.validate(rows)
	if err == nil {
		err = h.checkPipelineTemplates(req.Options)
	}
	if err != nil {
		response.WriteJSON(w, response.ErrDefault(err.Error()))
		return
	}
	now := time.Now()
	var s *model.Subscription
	var before []int64
	if req.ID > 0 {
		if s, err = h.repo.GetSubscription(req.ID); err != nil || s == nil {
			response.WriteJSON(w, response.ErrDefault("订阅不存在"))
			return
		}
		if isShare(s) {
			before = subInboundIDs(s, rows)
		}
	} else {
		s = &model.Subscription{Token: randomHex(16), Enabled: 1, CreatedTime: now.UnixMilli()}
	}
	s.Name = req.Name
	s.Kind = req.Kind
	if isShare(s) && (s.UUID == "" || s.Password == "") {
		s.UUID, s.Password = newUUID(), randomHex(16)
	}
	s.SourceAll = boolToInt(req.SourceAll)
	s.InboundIDs = formatIDList(ids)
	s.SourceIDs = formatIDList(req.SourceIDs)
	opts, _ := json.Marshal(req.Options)
	s.Options = string(opts)
	s.ExpireTime = req.ExpireTime
	s.Remark = strings.TrimSpace(req.Remark)
	s.TrafficLimit = req.TrafficLimit
	if req.ResetDay != s.ResetDay && req.ResetDay > 0 {
		// Count from now: a newly set reset day must not wipe this month.
		s.TrafficResetTime = now.UnixMilli()
		_ = h.repo.MarkSubscriptionResetTime(s.ID, s.TrafficResetTime)
	}
	s.ResetDay = req.ResetDay
	if req.Enabled != nil {
		s.Enabled = boolToInt(*req.Enabled)
	}
	s.UpdatedTime = now.UnixMilli()
	s.AppliedActive = boolToInt(isShare(s) && subActive(s, now))
	if err := h.repo.SaveSubscription(s); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	push := before
	if isShare(s) {
		push = append(push, subInboundIDs(s, rows)...)
	}
	h.respondAfterSubPush(w, push, h.withUserName(h.subscriptionView(s, rows, now), nil))
}

func (h *Handler) respondAfterSubPush(w http.ResponseWriter, inboundIDs []int64, data interface{}) {
	msg := "操作成功"
	if err := h.applyKernelsForInbounds(inboundIDs); err != nil {
		msg = "已保存，但下发到节点失败: " + err.Error()
	}
	response.WriteJSON(w, response.R{Code: 0, Msg: msg, Data: data, TS: time.Now().UnixMilli()})
}

func (h *Handler) subscriptionDelete(w http.ResponseWriter, r *http.Request) {
	id := idFromBody(r, w)
	if id <= 0 {
		return
	}
	s, err := h.repo.GetSubscription(id)
	if err != nil || s == nil {
		response.WriteJSON(w, response.ErrDefault("订阅不存在"))
		return
	}
	var push []int64
	if isShare(s) {
		if rows, err := h.repo.ListNodeInbounds(); err == nil {
			push = subInboundIDs(s, rows)
		}
	}
	if err := h.repo.DeleteSubscription(id); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	h.respondAfterSubPush(w, push, nil)
}

// subscriptionReset issues a new link; a share subscription also gets new
// credentials, so a leaked link or imported config stops working.
func (h *Handler) subscriptionReset(w http.ResponseWriter, r *http.Request) {
	id := idFromBody(r, w)
	if id <= 0 {
		return
	}
	s, err := h.repo.GetSubscription(id)
	if err != nil || s == nil {
		response.WriteJSON(w, response.ErrDefault("订阅不存在"))
		return
	}
	rows, push, err := h.resetSubscriptionLink(s)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	h.respondAfterSubPush(w, push, h.withUserName(h.subscriptionView(s, rows, time.Now()), nil))
}

// resetSubscriptionLink gives a subscription a new token and credentials,
// returning the inbounds whose kernels must drop the old ones.
func (h *Handler) resetSubscriptionLink(s *model.Subscription) ([]model.NodeInbound, []int64, error) {
	s.Token = randomHex(16)
	if isShare(s) {
		s.UUID, s.Password = newUUID(), randomHex(16)
	}
	s.UpdatedTime = time.Now().UnixMilli()
	if err := h.repo.SaveSubscription(s); err != nil {
		return nil, nil, err
	}
	rows, _ := h.repo.ListNodeInbounds()
	var push []int64
	if isShare(s) {
		push = subInboundIDs(s, rows)
	}
	return rows, push, nil
}

// subscriptionResetTraffic zeroes a share subscription's traffic and puts
// it back on the nodes if the limit had cut it off.
func (h *Handler) subscriptionResetTraffic(w http.ResponseWriter, r *http.Request) {
	id := idFromBody(r, w)
	if id <= 0 {
		return
	}
	s, err := h.repo.GetSubscription(id)
	if err != nil || s == nil {
		response.WriteJSON(w, response.ErrDefault("订阅不存在"))
		return
	}
	now := time.Now()
	if err := h.repo.ResetSubscriptionTraffic(id, now.UnixMilli()); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	if h.notifier != nil {
		h.notifier.clearAlerts(fmt.Sprintf("subflow:%d:", id))
	}
	h.syncSubscriptions(now)
	s, _ = h.repo.GetSubscription(id)
	rows, _ := h.repo.ListNodeInbounds()
	response.WriteJSON(w, response.OK(h.subscriptionView(s, rows, now)))
}

type subPreviewItem struct {
	Name     string `json:"name"`
	Original string `json:"original"`
	Region   string `json:"region"`
	Protocol string `json:"protocol"`
	Line     string `json:"line"` // "direct" or "relay"
	// Chain is "landing" or "relay" when the subscription chains proxies.
	Chain string `json:"chain,omitempty"`
}

// subscriptionPreview runs an (unsaved) subscription's pipeline and lists
// the resulting nodes, plus how many the filters dropped.
func (h *Handler) subscriptionPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req subscriptionRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	if req.Name == "" {
		req.Name = "preview"
	}
	rows, err := h.repo.ListNodeInbounds()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	ids, err := req.validate(rows)
	if err != nil {
		response.WriteJSON(w, response.ErrDefault(err.Error()))
		return
	}
	draft := &model.Subscription{SourceAll: boolToInt(req.SourceAll), InboundIDs: formatIDList(ids), SourceIDs: formatIDList(req.SourceIDs)}
	source := h.subEndpoints(draft, rows)
	result := kernel.ApplySubOptions(source, req.Options.options())
	items := make([]subPreviewItem, 0, len(result))
	for _, e := range result {
		line := "relay"
		if e.Direct {
			line = "direct"
		}
		items = append(items, subPreviewItem{Name: e.Name, Original: e.Original, Region: kernel.RegionOf(e.Name),
			Protocol: kernel.EndpointProtocol(e), Line: line, Chain: e.ChainRole})
	}
	scriptError := ""
	if err := kernel.SubScriptError(source, req.Options.options()); err != nil {
		scriptError = err.Error()
	}
	// The picked templates' groups with these nodes.
	names := make([]string, len(result))
	for i, e := range result {
		names[i] = e.Name
	}
	templates := map[string]interface{}{}
	for kind, id := range req.Options.Templates {
		t, err := h.repo.GetSubscriptionTemplate(id)
		if err != nil || t == nil {
			continue
		}
		view := map[string]interface{}{"id": t.ID, "name": t.Name}
		if summary, err := kernel.CheckTemplate(t.Kind, t.Content, names); err != nil {
			view["error"] = err.Error()
		} else {
			view["groups"], view["warnings"] = summary.Groups, summary.Warnings
		}
		templates[kind] = view
	}
	response.WriteJSON(w, response.OK(map[string]interface{}{
		"items":       items,
		"total":       len(source),
		"dropped":     len(source) - len(items),
		"scriptError": scriptError,
		"templates":   templates,
	}))
}

// inboundSubInfo is the pre-3.1 single-subscription API: the default
// subscription's link; reset rotates it.
func (h *Handler) inboundSubInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		Reset bool `json:"reset"`
	}
	_ = decodeJSON(r.Body, &req)
	s, err := h.repo.DefaultSubscription(time.Now().UnixMilli())
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	if req.Reset {
		s.Token = randomHex(16)
		s.UpdatedTime = time.Now().UnixMilli()
		if err := h.repo.SaveSubscription(s); err != nil {
			response.WriteJSON(w, response.Err(-2, err.Error()))
			return
		}
	}
	response.WriteJSON(w, response.OK(map[string]interface{}{
		"token": s.Token,
		"path":  "/api/v1/open_api/sub/" + s.Token,
	}))
}
