package handler

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/kernel"
	"go-backend/internal/store/model"
)

// Subscription templates (kernel/sub_template.go): the user's own Mihomo /
// sing-box / Surge profiles, pasted or downloaded from a URL once a day.

const templateRefreshInterval = 24 * time.Hour

type subTemplateView struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Content     string `json:"content"`
	SourceURL   string `json:"sourceUrl"`
	LastFetch   int64  `json:"lastFetch"`
	LastError   string `json:"lastError"`
	UpdatedTime int64  `json:"updatedTime"`
	// UsedBy counts the subscriptions using it.
	UsedBy     int `json:"usedBy"`
	Groups     int `json:"groups"`
	AutoGroups int `json:"autoGroups"`
	Rules      int `json:"rules"`
}

func templateView(t *model.SubscriptionTemplate, usedBy int) subTemplateView {
	v := subTemplateView{ID: t.ID, Name: t.Name, Kind: t.Kind, Content: t.Content, SourceURL: t.SourceURL,
		LastFetch: t.LastFetch, LastError: t.LastError, UpdatedTime: t.UpdatedTime, UsedBy: usedBy}
	if s, err := kernel.CheckTemplate(t.Kind, t.Content, nil); err == nil {
		v.Groups, v.AutoGroups, v.Rules = len(s.Groups), s.AutoGroups(), s.Rules
	}
	return v
}

func validTemplateKind(kind string) bool {
	for _, k := range kernel.TemplateFormats {
		if k == kind {
			return true
		}
	}
	return false
}

// templateUsage counts, per template id, the subscriptions using it.
func (h *Handler) templateUsage() map[int64]int {
	out := map[int64]int{}
	subs, err := h.repo.ListSubscriptions()
	if err != nil {
		return out
	}
	for _, s := range subs {
		for _, id := range parsePipeline(s.Options).Templates {
			out[id]++
		}
	}
	return out
}

// subOptions is the pipeline's options with its templates loaded.
func (h *Handler) subOptions(p subPipeline) kernel.SubOptions {
	opts := p.options()
	for kind, id := range p.Templates {
		if t, err := h.repo.GetSubscriptionTemplate(id); err == nil && t != nil && t.Kind == kind {
			if opts.Templates == nil {
				opts.Templates = map[string]string{}
			}
			opts.Templates[kind] = t.Content
		}
	}
	return opts
}

// checkPipelineTemplates rejects templates that are missing or of another
// kind than the slot they are picked for.
func (h *Handler) checkPipelineTemplates(p subPipeline) error {
	for kind, id := range p.Templates {
		t, err := h.repo.GetSubscriptionTemplate(id)
		if err != nil || t == nil {
			return errText("所选模板不存在")
		}
		if t.Kind != kind {
			return errText("模板「" + t.Name + "」的格式和所选客户端不符")
		}
	}
	return nil
}

// fetchTemplate downloads a template's content.
func fetchTemplate(ctx context.Context, url string) (string, error) {
	body, _, err := fetchSubscriptionInfo(ctx, url)
	if err != nil {
		return "", errText("下载模板失败：" + err.Error())
	}
	return body, nil
}

// refreshTemplate downloads a URL template again; a failure keeps the
// last good content and records the error.
func (h *Handler) refreshTemplate(ctx context.Context, t *model.SubscriptionTemplate) error {
	now := time.Now().UnixMilli()
	t.LastFetch = now
	body, err := fetchTemplate(ctx, t.SourceURL)
	if err == nil {
		_, err = kernel.CheckTemplate(t.Kind, body, nil)
	}
	if err != nil {
		t.LastError = truncate(err.Error(), 500)
	} else {
		t.Content, t.LastError, t.UpdatedTime = body, "", now
	}
	if saveErr := h.repo.SaveSubscriptionTemplate(t); saveErr != nil {
		return saveErr
	}
	return err
}

func (h *Handler) refreshDueTemplates(ctx context.Context, now time.Time) {
	templates, err := h.repo.ListSubscriptionTemplates()
	if err != nil {
		return
	}
	for i := range templates {
		t := &templates[i]
		if t.SourceURL == "" || now.Sub(time.UnixMilli(t.LastFetch)) < templateRefreshInterval {
			continue
		}
		if err := h.refreshTemplate(ctx, t); err != nil {
			log.Printf("subscription template %d refresh failed: %v", t.ID, err)
		}
	}
}

func (h *Handler) subscriptionTemplateList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	templates, err := h.repo.ListSubscriptionTemplates()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	usage := h.templateUsage()
	out := make([]subTemplateView, 0, len(templates))
	for i := range templates {
		out = append(out, templateView(&templates[i], usage[templates[i].ID]))
	}
	response.WriteJSON(w, response.OK(out))
}

type subTemplateRequest struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Content   string `json:"content"`
	SourceURL string `json:"sourceUrl"`
	// SubscriptionID previews the groups with that subscription's nodes
	// (check only).
	SubscriptionID int64 `json:"subscriptionId"`
}

// content returns the request's template text, downloading it for a URL
// template.
func (req *subTemplateRequest) content(ctx context.Context) (string, error) {
	req.SourceURL = strings.TrimSpace(req.SourceURL)
	if req.SourceURL == "" {
		return strings.ReplaceAll(req.Content, "\r\n", "\n"), nil
	}
	if !isSubscriptionURL(req.SourceURL) {
		return "", errText("请填写 http(s) 模板地址")
	}
	return fetchTemplate(ctx, req.SourceURL)
}

// subscriptionTemplateCheck parses a template and previews its groups with
// a subscription's nodes (every node when none is given).
func (h *Handler) subscriptionTemplateCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req subTemplateRequest
	if err := decodeJSON(r.Body, &req); err != nil || !validTemplateKind(req.Kind) {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	content, err := req.content(r.Context())
	if err != nil {
		response.WriteJSON(w, response.ErrDefault(err.Error()))
		return
	}
	rows, err := h.repo.ListNodeInbounds()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	sub := &model.Subscription{SourceAll: 1}
	var opts kernel.SubOptions
	sample := "全部节点"
	if req.SubscriptionID > 0 {
		if s, err := h.repo.GetSubscription(req.SubscriptionID); err == nil && s != nil {
			sub, opts, sample = s, parsePipeline(s.Options).options(), s.Name
		}
	}
	var names []string
	for _, e := range kernel.ApplySubOptions(h.subEndpoints(sub, rows), opts) {
		names = append(names, e.Name)
	}
	summary, err := kernel.CheckTemplate(req.Kind, content, names)
	if err != nil {
		response.WriteJSON(w, response.ErrDefault(err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(map[string]interface{}{
		"summary": summary, "autoGroups": summary.AutoGroups(), "sample": sample, "nodes": len(names), "content": content,
	}))
}

func (h *Handler) subscriptionTemplateSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req subTemplateRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len([]rune(req.Name)) > 100 {
		response.WriteJSON(w, response.ErrDefault("请填写名称（最多 100 个字）"))
		return
	}
	if !validTemplateKind(req.Kind) {
		response.WriteJSON(w, response.ErrDefault("请选择模板格式"))
		return
	}
	now := time.Now().UnixMilli()
	t := &model.SubscriptionTemplate{CreatedTime: now}
	if req.ID > 0 {
		var err error
		if t, err = h.repo.GetSubscriptionTemplate(req.ID); err != nil || t == nil {
			response.WriteJSON(w, response.ErrDefault("模板不存在"))
			return
		}
		if t.Kind != req.Kind && h.templateUsage()[t.ID] > 0 {
			response.WriteJSON(w, response.ErrDefault("有订阅在用这个模板，不能改格式"))
			return
		}
	}
	content, err := req.content(r.Context())
	if err != nil {
		response.WriteJSON(w, response.ErrDefault(err.Error()))
		return
	}
	if _, err := kernel.CheckTemplate(req.Kind, content, nil); err != nil {
		response.WriteJSON(w, response.ErrDefault(err.Error()))
		return
	}
	t.Name, t.Kind, t.Content, t.SourceURL, t.UpdatedTime = req.Name, req.Kind, content, req.SourceURL, now
	t.LastError = ""
	if t.SourceURL != "" {
		t.LastFetch = now
	}
	if err := h.repo.SaveSubscriptionTemplate(t); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(templateView(t, h.templateUsage()[t.ID])))
}

func (h *Handler) subscriptionTemplateRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		ID int64 `json:"id"`
	}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	t, err := h.repo.GetSubscriptionTemplate(req.ID)
	if err != nil || t == nil || t.SourceURL == "" {
		response.WriteJSON(w, response.ErrDefault("模板不存在或不是网址模板"))
		return
	}
	if err := h.refreshTemplate(r.Context(), t); err != nil {
		response.WriteJSON(w, response.ErrDefault(err.Error()))
		return
	}
	response.WriteJSON(w, response.OK(templateView(t, h.templateUsage()[t.ID])))
}

func (h *Handler) subscriptionTemplateDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}
	var req struct {
		ID int64 `json:"id"`
	}
	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}
	if n := h.templateUsage()[req.ID]; n > 0 {
		response.WriteJSON(w, response.ErrDefault("有 "+strconv.Itoa(n)+" 个订阅在用这个模板，先在订阅里换掉"))
		return
	}
	if err := h.repo.DeleteSubscriptionTemplate(req.ID); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}
	response.WriteJSON(w, response.OKEmpty())
}
