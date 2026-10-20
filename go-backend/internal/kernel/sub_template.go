package kernel

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Subscription templates: the user's own Mihomo / sing-box / Surge profile
// (rules, policy groups, DNS) with the subscription's nodes put in. Nodes
// reach the groups the way each client already supports, so ready-made
// templates work as they are:
//
//   - Mihomo: groups with include-all (or include-all-proxies) and an
//     optional filter / exclude-filter; the client fills them.
//   - sing-box: "{all}" in a group's outbounds, narrowed by the group's
//     "filter" (the sing-box-subscribe convention); the panel expands it.
//   - Surge: include-all-proxies=1 with an optional policy-regex-filter;
//     the client fills them.
//
// Everything else in the template is kept as it is.

const (
	TemplateClash   = "clash"
	TemplateSingbox = "singbox"
	TemplateSurge   = "surge"
)

// TemplateFormats lists the template formats in display order.
var TemplateFormats = []string{TemplateClash, TemplateSingbox, TemplateSurge}

// Stash and Shadowrocket read Mihomo-format templates; the panel writes
// their auto groups' nodes out, since neither fills include-all groups.
const (
	TemplateStash        = "stash"
	TemplateShadowrocket = "shadowrocket"
)

// TemplateSlots are the clients a subscription picks templates for.
var TemplateSlots = []string{TemplateClash, TemplateSingbox, TemplateSurge, TemplateStash, TemplateShadowrocket}

// TemplateKindOf is the template format a client slot takes.
func TemplateKindOf(slot string) string {
	if slot == TemplateStash || slot == TemplateShadowrocket {
		return TemplateClash
	}
	return slot
}

// MaxTemplateBytes bounds a template's size.
const MaxTemplateBytes = 2 << 20

// templateFor returns the template slot a subscription format renders
// with, or "" for formats without templates.
func templateFor(format string) string {
	switch format {
	case FormatStash:
		return TemplateStash
	case FormatShadowrocket:
		return TemplateShadowrocket
	case FormatClash:
		return TemplateClash
	case FormatSingbox:
		return TemplateSingbox
	case FormatSurge:
		return TemplateSurge
	}
	return ""
}

// TemplateGroup is one policy group of a template, as the editor shows it.
type TemplateGroup struct {
	Name string `json:"name"`
	Type string `json:"type"`
	// Proxies are the members written in the template (other groups,
	// DIRECT, ...).
	Proxies []string `json:"proxies"`
	// Auto: the group takes nodes (include-all / {all}); Nodes are the ones
	// it gets, when known.
	Auto  bool     `json:"auto"`
	Nodes []string `json:"nodes"`
	// FilterError: the filter is not a Go regular expression (e.g. a
	// look-around); the client still applies it, the panel cannot preview.
	FilterError string `json:"filterError,omitempty"`
}

// TemplateSummary describes a template for the editor's check.
type TemplateSummary struct {
	Groups    []TemplateGroup `json:"groups"`
	Rules     int             `json:"rules"`
	Providers int             `json:"providers"`
	Warnings  []string        `json:"warnings"`
}

// AutoGroups counts the groups that take nodes.
func (s TemplateSummary) AutoGroups() int {
	n := 0
	for _, g := range s.Groups {
		if g.Auto {
			n++
		}
	}
	return n
}

// CheckTemplate parses a template and previews its groups for the given
// node names (nil for none).
func CheckTemplate(kind, content string, names []string) (TemplateSummary, error) {
	if strings.TrimSpace(content) == "" {
		return TemplateSummary{}, errors.New("模板内容是空的")
	}
	if len(content) > MaxTemplateBytes {
		return TemplateSummary{}, errors.New("模板超过 2MB")
	}
	var s TemplateSummary
	var err error
	switch kind {
	case TemplateClash:
		s, err = checkClashTemplate(content, names)
	case TemplateSingbox:
		s, err = checkSingboxTemplate(content, names)
	case TemplateSurge:
		s, err = checkSurgeTemplate(content, names)
	default:
		return s, fmt.Errorf("不支持的模板格式 %s", kind)
	}
	if err != nil {
		return s, err
	}
	if s.Groups == nil {
		s.Groups = []TemplateGroup{}
	}
	if s.Warnings == nil {
		s.Warnings = []string{}
	}
	if len(s.Groups) > 0 && s.AutoGroups() == 0 {
		s.Warnings = append(s.Warnings, "没有策略组会自动收节点（"+autoHint(kind)+"），节点只会出现在节点列表里")
	}
	return s, nil
}

func autoHint(kind string) string {
	switch kind {
	case TemplateSingbox:
		return `"{all}"`
	case TemplateSurge:
		return "include-all-proxies"
	}
	return "include-all"
}

// templateGroupNames lists a template's group names; node names must not
// take them.
func templateGroupNames(kind, content string) []string {
	s, err := CheckTemplate(kind, content, nil)
	if err != nil {
		return nil
	}
	out := make([]string, len(s.Groups))
	for i, g := range s.Groups {
		out[i] = g.Name
	}
	return out
}

// nameFilter matches node names against include / exclude expressions.
type nameFilter struct {
	include []*regexp.Regexp
	exclude []*regexp.Regexp
}

func (f nameFilter) keep(name string) bool {
	if len(f.include) > 0 {
		ok := false
		for _, re := range f.include {
			if re.MatchString(name) {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	for _, re := range f.exclude {
		if re.MatchString(name) {
			return false
		}
	}
	return true
}

func (f nameFilter) apply(names []string) []string {
	out := []string{}
	for _, n := range names {
		if f.keep(n) {
			out = append(out, n)
		}
	}
	return out
}

func compileAll(exprs []string) ([]*regexp.Regexp, error) {
	var out []*regexp.Regexp
	for _, e := range exprs {
		if strings.TrimSpace(e) == "" {
			continue
		}
		re, err := regexp.Compile(e)
		if err != nil {
			return nil, fmt.Errorf("无法预览过滤条件 %q", e)
		}
		out = append(out, re)
	}
	return out, nil
}

// --- Mihomo / Clash ---

func tplMapGet(m *yaml.Node, key string) (*yaml.Node, int) {
	if m == nil || m.Kind != yaml.MappingNode {
		return nil, -1
	}
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i+1], i
		}
	}
	return nil, -1
}

func tplScalar(m *yaml.Node, key string) string {
	if v, _ := tplMapGet(m, key); v != nil && v.Kind == yaml.ScalarNode {
		return v.Value
	}
	return ""
}

func tplStrings(m *yaml.Node, key string) []string {
	v, _ := tplMapGet(m, key)
	if v == nil || v.Kind != yaml.SequenceNode {
		return nil
	}
	out := make([]string, 0, len(v.Content))
	for _, c := range v.Content {
		if c.Kind == yaml.ScalarNode {
			out = append(out, c.Value)
		}
	}
	return out
}

func parseClashTemplate(content string) (*yaml.Node, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		return nil, fmt.Errorf("YAML 格式错误：%v", err)
	}
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 || doc.Content[0].Kind != yaml.MappingNode {
		return nil, errors.New("模板应是一份 Mihomo 配置（YAML 对象）")
	}
	return &doc, nil
}

func checkClashTemplate(content string, names []string) (TemplateSummary, error) {
	doc, err := parseClashTemplate(content)
	if err != nil {
		return TemplateSummary{}, err
	}
	root := doc.Content[0]
	var s TemplateSummary
	groups, _ := tplMapGet(root, "proxy-groups")
	if groups == nil || groups.Kind != yaml.SequenceNode || len(groups.Content) == 0 {
		return s, errors.New("模板里没有 proxy-groups")
	}
	for _, g := range groups.Content {
		name := tplScalar(g, "name")
		if name == "" {
			return s, errors.New("有策略组没有 name")
		}
		tg := TemplateGroup{Name: name, Type: tplScalar(g, "type"), Proxies: tplStrings(g, "proxies")}
		if tg.Proxies == nil {
			tg.Proxies = []string{}
		}
		all := tplScalar(g, "include-all") == "true" || tplScalar(g, "include-all-proxies") == "true"
		if all {
			tg.Auto = true
			// Mihomo separates several expressions with a backtick.
			inc, err1 := compileAll(strings.Split(tplScalar(g, "filter"), "`"))
			exc, err2 := compileAll(strings.Split(tplScalar(g, "exclude-filter"), "`"))
			if err := errors.Join(err1, err2); err != nil {
				tg.FilterError = err.Error()
			} else {
				tg.Nodes = nameFilter{include: inc, exclude: exc}.apply(names)
			}
		}
		if len(tg.Proxies) == 0 && !all && len(tplStrings(g, "use")) == 0 {
			s.Warnings = append(s.Warnings, fmt.Sprintf("策略组「%s」没有成员，Mihomo 会拒绝这份配置", name))
		}
		s.Groups = append(s.Groups, tg)
	}
	if rules, _ := tplMapGet(root, "rules"); rules != nil && rules.Kind == yaml.SequenceNode {
		s.Rules = len(rules.Content)
	}
	if p, _ := tplMapGet(root, "rule-providers"); p != nil && p.Kind == yaml.MappingNode {
		s.Providers = len(p.Content) / 2
		for i := 1; i < len(p.Content); i += 2 {
			if tplScalar(p.Content[i], "format") == "mrs" {
				s.Warnings = append(s.Warnings, "规则集用了 mrs 格式，只有 Mihomo 能读；这个模板如果也给 Stash / Shadowrocket 用，请换成 yaml 或 text 格式")
				break
			}
		}
	}
	return s, nil
}

// yamlValue turns a generated value (yamlNode etc.) into a yaml.Node.
func tplValue(v interface{}) (*yaml.Node, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(marshalYAML(yamlNode{{"v", v}})), &doc); err != nil {
		return nil, err
	}
	val, _ := tplMapGet(doc.Content[0], "v")
	if val == nil {
		return nil, errors.New("生成节点失败")
	}
	return val, nil
}

func tplSet(m *yaml.Node, key string, val *yaml.Node, before string) {
	if _, i := tplMapGet(m, key); i >= 0 {
		m.Content[i+1] = val
		return
	}
	k := &yaml.Node{Kind: yaml.ScalarNode, Value: key}
	if _, j := tplMapGet(m, before); j >= 0 {
		m.Content = append(m.Content[:j], append([]*yaml.Node{k, val}, m.Content[j:]...)...)
		return
	}
	m.Content = append(m.Content, k, val)
}

// clashBlockEnd returns the line (0-based, exclusive) where the value of
// the root key at index i ends: before the next root key, less the blank
// and comment lines in between (they belong to the next key).
func clashBlockEnd(root *yaml.Node, i int, lines []string) int {
	end := len(lines)
	if i+2 < len(root.Content) {
		end = root.Content[i+2].Line - 1
	}
	for end > root.Content[i].Line {
		t := strings.TrimSpace(lines[end-1])
		if t != "" && !strings.HasPrefix(t, "#") {
			break
		}
		end--
	}
	return end
}

// reindent shifts generated block lines (2-space base indent) to start at
// the given column.
func reindent(block string, indent int) []string {
	var out []string
	for _, l := range strings.Split(strings.TrimRight(block, "\n"), "\n") {
		out = append(out, strings.Repeat(" ", indent)+strings.TrimPrefix(l, "  "))
	}
	return out
}

// autoKeys are how a Mihomo group takes nodes by itself.
var autoKeys = map[string]bool{"include-all": true, "include-all-proxies": true, "include-all-providers": true,
	"filter": true, "exclude-filter": true, "exclude-type": true}

// expandedGroup writes out an auto group's nodes (its own members first),
// for clients that don't fill include-all groups; nil for other groups. A
// filter Go can't read keeps every node.
func expandedGroup(g *yaml.Node, names []string) yamlNode {
	if tplScalar(g, "include-all") != "true" && tplScalar(g, "include-all-proxies") != "true" {
		return nil
	}
	picked := names
	inc, err1 := compileAll(strings.Split(tplScalar(g, "filter"), "`"))
	exc, err2 := compileAll(strings.Split(tplScalar(g, "exclude-filter"), "`"))
	if errors.Join(err1, err2) == nil {
		picked = nameFilter{include: inc, exclude: exc}.apply(names)
	}
	seen := map[string]bool{}
	list := []interface{}{}
	for _, m := range append(tplStrings(g, "proxies"), picked...) {
		if !seen[m] {
			seen[m] = true
			list = append(list, m)
		}
	}
	if len(list) == 0 {
		list = []interface{}{"DIRECT"} // an empty group is rejected
	}
	out := yamlNode{}
	placed := false
	for i := 0; i+1 < len(g.Content); i += 2 {
		k := g.Content[i].Value
		switch {
		case autoKeys[k]:
		case k == "proxies":
			out, placed = append(out, yamlField{k, list}), true
		default:
			var v interface{}
			if g.Content[i+1].Decode(&v) == nil {
				out = append(out, yamlField{k, v})
			}
		}
	}
	if !placed {
		out = append(out, yamlField{"proxies", list})
	}
	return out
}

// clashTemplateProfile renders a Mihomo-format template for Mihomo, or for
// Stash / Shadowrocket (slot), which get their auto groups written out;
// Shadowrocket also gets its own node list (chained copies, no VLESS
// Encryption or WireGuard).
func clashTemplateProfile(content string, endpoints []Endpoint, slot string) (string, error) {
	doc, err := parseClashTemplate(content)
	if err != nil {
		return "", err
	}
	root := doc.Content[0]
	var proxies []interface{}
	var names []string
	var chainGroupNodes []interface{}
	if slot == TemplateShadowrocket {
		proxies, names = shadowrocketProxies(endpoints)
	} else {
		proxies, names, chainGroupNodes = clashTemplateProxies(endpoints)
	}
	expand := slot == TemplateStash || slot == TemplateShadowrocket
	groups, gi := tplMapGet(root, "proxy-groups")
	if root.Style&yaml.FlowStyle != 0 || groups == nil || groups.Kind != yaml.SequenceNode || groups.Style&yaml.FlowStyle != 0 {
		if expand && groups != nil && groups.Kind == yaml.SequenceNode {
			for i, g := range groups.Content {
				if x := expandedGroup(g, names); x != nil {
					if n, err := tplValue(x); err == nil {
						groups.Content[i] = n
					}
				}
			}
		}
		return clashTemplateReencode(doc, proxies, chainGroupNodes)
	}

	// Splice into the text so the template comes back exactly as written.
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	type edit struct {
		from, to int
		add      []string
	}
	var edits []edit
	indent := groups.Content[0].Column - 3
	if indent < 0 {
		indent = 0
	}
	groupLines := func(nodes []interface{}) []string {
		block := marshalYAML(yamlNode{{"g", nodes}})
		return reindent(block[strings.Index(block, "\n")+1:], indent)
	}
	if expand {
		end := clashBlockEnd(root, gi, lines)
		for i, g := range groups.Content {
			x := expandedGroup(g, names)
			if x == nil {
				continue
			}
			from, to := g.Line-1, end
			if i+1 < len(groups.Content) {
				to = groups.Content[i+1].Line - 1
			}
			for to > from+1 && strings.TrimSpace(lines[to-1]) == "" {
				to--
			}
			edits = append(edits, edit{from, to, groupLines([]interface{}{x})})
		}
	}
	if len(chainGroupNodes) > 0 {
		at := clashBlockEnd(root, gi, lines)
		edits = append(edits, edit{at, at, groupLines(chainGroupNodes)})
	}
	proxyLines := []string{"proxies: []"}
	if len(proxies) > 0 {
		proxyLines = strings.Split(strings.TrimRight(marshalYAML(yamlNode{{"proxies", proxies}}), "\n"), "\n")
	}
	if _, pi := tplMapGet(root, "proxies"); pi >= 0 {
		edits = append(edits, edit{root.Content[pi].Line - 1, clashBlockEnd(root, pi, lines), proxyLines})
	} else {
		at := root.Content[gi].Line - 1
		edits = append(edits, edit{at, at, proxyLines})
	}
	// Bottom up, so earlier line numbers stay valid.
	for i := 0; i < len(edits); i++ {
		for j := i + 1; j < len(edits); j++ {
			if edits[j].from > edits[i].from {
				edits[i], edits[j] = edits[j], edits[i]
			}
		}
	}
	for _, e := range edits {
		lines = append(lines[:e.from], append(append([]string{}, e.add...), lines[e.to:]...)...)
	}
	out := strings.Join(lines, "\n")
	if !strings.HasSuffix(out, "\n") {
		out += "\n"
	}
	return out, nil
}

// clashTemplateProxies renders Mihomo / Stash proxies, with the chain
// groups when the chain applies.
func clashTemplateProxies(endpoints []Endpoint) (proxies []interface{}, names []string, chainNodes []interface{}) {
	var rendered []Endpoint
	var nodes []yamlNode
	for _, e := range endpoints {
		if p, ok := ClashProxy(e); ok {
			rendered = append(rendered, e)
			nodes = append(nodes, p)
		}
	}
	landing, relay, chain := chainGroups(rendered)
	proxies = []interface{}{}
	for i, e := range rendered {
		p := nodes[i]
		if chain && e.ChainRole == ChainRoleLanding {
			p = append(p, yamlField{"dialer-proxy", ChainRelayGroup})
		}
		proxies = append(proxies, p)
		names = append(names, e.Name)
	}
	if chain {
		chainNodes = []interface{}{
			yamlNode{{"name", ChainLandingGroup}, {"type", "select"}, {"proxies", toInterfaces(landing)}},
			yamlNode{{"name", ChainRelayGroup}, {"type", "select"}, {"proxies", toInterfaces(relay)}},
		}
	}
	return proxies, names, chainNodes
}

// clashTemplateReencode handles flow-style templates ({...} documents):
// they are rewritten through the YAML encoder.
func clashTemplateReencode(doc *yaml.Node, proxies, chainGroupNodes []interface{}) (string, error) {
	root := doc.Content[0]
	list, err := tplValue(proxies)
	if err != nil {
		return "", err
	}
	tplSet(root, "proxies", list, "proxy-groups")
	if len(chainGroupNodes) > 0 {
		extra, err := tplValue(chainGroupNodes)
		if err != nil {
			return "", err
		}
		if groups, _ := tplMapGet(root, "proxy-groups"); groups != nil && groups.Kind == yaml.SequenceNode {
			groups.Content = append(groups.Content, extra.Content...)
		} else {
			tplSet(root, "proxy-groups", extra, "rules")
		}
	}
	var b bytes.Buffer
	enc := yaml.NewEncoder(&b)
	enc.SetIndent(2)
	if err := enc.Encode(doc); err != nil {
		return "", err
	}
	_ = enc.Close()
	return b.String(), nil
}

// --- sing-box ---

const singboxAll = "{all}"

func parseSingboxTemplate(content string) (map[string]interface{}, error) {
	dec := json.NewDecoder(strings.NewReader(content))
	dec.UseNumber()
	var cfg map[string]interface{}
	if err := dec.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("JSON 格式错误：%v", err)
	}
	if cfg == nil {
		return nil, errors.New("模板应是一份 sing-box 配置（JSON 对象）")
	}
	if _, ok := cfg["outbounds"].([]interface{}); !ok {
		return nil, errors.New("模板里没有 outbounds")
	}
	return cfg, nil
}

func asStrings(v interface{}) []string {
	list, _ := v.([]interface{})
	out := make([]string, 0, len(list))
	for _, x := range list {
		if s, ok := x.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// singboxFilter applies a group's "filter": a list of
// {"action": "include"|"exclude", "keywords": [regex, ...]} steps.
func singboxFilter(raw interface{}, names []string) ([]string, error) {
	steps, _ := raw.([]interface{})
	out := names
	for _, st := range steps {
		m, _ := st.(map[string]interface{})
		res, err := compileAll(asStrings(m["keywords"]))
		if err != nil {
			return nil, err
		}
		if len(res) == 0 {
			continue
		}
		f := nameFilter{include: res}
		if a, _ := m["action"].(string); a == "exclude" {
			f = nameFilter{exclude: res}
		}
		out = f.apply(out)
	}
	return out, nil
}

func singboxGroups(cfg map[string]interface{}) []map[string]interface{} {
	var out []map[string]interface{}
	for _, o := range cfg["outbounds"].([]interface{}) {
		m, ok := o.(map[string]interface{})
		if !ok {
			continue
		}
		if _, has := m["outbounds"]; has {
			out = append(out, m)
		}
	}
	return out
}

func checkSingboxTemplate(content string, names []string) (TemplateSummary, error) {
	cfg, err := parseSingboxTemplate(content)
	if err != nil {
		return TemplateSummary{}, err
	}
	var s TemplateSummary
	for _, g := range singboxGroups(cfg) {
		tag, _ := g["tag"].(string)
		typ, _ := g["type"].(string)
		tg := TemplateGroup{Name: tag, Type: typ, Proxies: []string{}}
		for _, m := range asStrings(g["outbounds"]) {
			if m == singboxAll {
				tg.Auto = true
				continue
			}
			tg.Proxies = append(tg.Proxies, m)
		}
		if tg.Auto {
			nodes, err := singboxFilter(g["filter"], names)
			if err != nil {
				tg.FilterError = err.Error()
			} else {
				tg.Nodes = nodes
			}
		}
		s.Groups = append(s.Groups, tg)
	}
	if route, ok := cfg["route"].(map[string]interface{}); ok {
		s.Rules = len(asSlice(route["rules"]))
		s.Providers = len(asSlice(route["rule_set"]))
	}
	return s, nil
}

func asSlice(v interface{}) []interface{} {
	list, _ := v.([]interface{})
	return list
}

func singboxTemplateProfile(content string, endpoints []Endpoint, snell bool) (string, error) {
	cfg, err := parseSingboxTemplate(content)
	if err != nil {
		return "", err
	}
	var rendered []Endpoint
	var obsList [][]map[string]interface{}
	for _, e := range endpoints {
		if obs, ok := singboxOutbounds(e, snell); ok {
			rendered = append(rendered, e)
			obsList = append(obsList, obs)
		}
	}
	landing, relay, chain := chainGroups(rendered)
	var nodeOutbounds, wgEndpoints []interface{}
	names := make([]string, 0, len(rendered))
	for i, e := range rendered {
		for _, o := range obsList[i] {
			if _, detour := o["detour"]; chain && e.ChainRole == ChainRoleLanding && !detour {
				o["detour"] = ChainRelayGroup
			}
			if o["type"] == "wireguard" {
				wgEndpoints = append(wgEndpoints, o)
				continue
			}
			nodeOutbounds = append(nodeOutbounds, o)
		}
		names = append(names, e.Name)
	}
	direct := ""
	for _, o := range cfg["outbounds"].([]interface{}) {
		if m, ok := o.(map[string]interface{}); ok && m["type"] == "direct" && direct == "" {
			direct, _ = m["tag"].(string)
		}
	}
	for _, g := range singboxGroups(cfg) {
		members := asSlice(g["outbounds"])
		hasAll := false
		for _, m := range members {
			if m == singboxAll {
				hasAll = true
			}
		}
		if !hasAll {
			continue
		}
		picked, err := singboxFilter(g["filter"], names)
		if err != nil {
			return "", err
		}
		var out []interface{}
		for _, m := range members {
			if m == singboxAll {
				for _, n := range picked {
					out = append(out, n)
				}
				continue
			}
			out = append(out, m)
		}
		// sing-box rejects a group without members.
		if len(out) == 0 && direct != "" {
			out = []interface{}{direct}
		}
		if out == nil {
			out = []interface{}{}
		}
		g["outbounds"] = out
		delete(g, "filter")
	}
	outbounds := cfg["outbounds"].([]interface{})
	if chain {
		outbounds = append(outbounds,
			map[string]interface{}{"type": "selector", "tag": ChainLandingGroup, "outbounds": landing},
			map[string]interface{}{"type": "selector", "tag": ChainRelayGroup, "outbounds": relay})
	}
	cfg["outbounds"] = append(outbounds, nodeOutbounds...)
	if len(wgEndpoints) > 0 {
		cfg["endpoints"] = append(asSlice(cfg["endpoints"]), wgEndpoints...)
	}
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b) + "\n", nil
}

// --- Surge ---

var surgeSection = regexp.MustCompile(`^\s*\[([^\]]+)\]\s*$`)

// surgeSections splits a profile into lines and finds each section's
// header line index (lower-cased name).
func surgeSections(lines []string) map[string]int {
	out := map[string]int{}
	for i, l := range lines {
		if m := surgeSection.FindStringSubmatch(l); m != nil {
			name := strings.ToLower(strings.TrimSpace(m[1]))
			if _, seen := out[name]; !seen {
				out[name] = i
			}
		}
	}
	return out
}

// surgeSectionEnd returns the index after the last line of the section
// starting at header (the next header, or the end).
func surgeSectionEnd(lines []string, header int) int {
	for i := header + 1; i < len(lines); i++ {
		if surgeSection.MatchString(lines[i]) {
			return i
		}
	}
	return len(lines)
}

func surgeComment(l string) bool {
	t := strings.TrimSpace(l)
	return t == "" || strings.HasPrefix(t, "#") || strings.HasPrefix(t, ";") || strings.HasPrefix(t, "//")
}

func checkSurgeTemplate(content string, names []string) (TemplateSummary, error) {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	secs := surgeSections(lines)
	var s TemplateSummary
	start, ok := secs["proxy group"]
	if !ok {
		return s, errors.New("模板里没有 [Proxy Group]")
	}
	for _, l := range lines[start+1 : surgeSectionEnd(lines, start)] {
		if surgeComment(l) {
			continue
		}
		name, rest, found := strings.Cut(l, "=")
		if !found {
			continue
		}
		tg := TemplateGroup{Name: strings.TrimSpace(name), Proxies: []string{}}
		var filter string
		for i, f := range splitSurgeFields(rest) {
			f = strings.TrimSpace(f)
			if i == 0 {
				tg.Type = f
				continue
			}
			k, v, kv := strings.Cut(f, "=")
			if !kv {
				tg.Proxies = append(tg.Proxies, f)
				continue
			}
			switch strings.TrimSpace(k) {
			case "include-all-proxies":
				v = strings.TrimSpace(v)
				tg.Auto = v == "1" || v == "true"
			case "policy-regex-filter":
				filter = strings.TrimSpace(v)
			}
		}
		if tg.Auto {
			inc, err := compileAll([]string{filter})
			if err != nil {
				tg.FilterError = err.Error()
			} else {
				tg.Nodes = nameFilter{include: inc}.apply(names)
			}
		}
		s.Groups = append(s.Groups, tg)
	}
	if r, ok := secs["rule"]; ok {
		for _, l := range lines[r+1 : surgeSectionEnd(lines, r)] {
			if !surgeComment(l) {
				s.Rules++
			}
		}
	}
	return s, nil
}

func surgeTemplateProfile(content string, endpoints []Endpoint) (string, error) {
	if _, err := checkSurgeTemplate(content, nil); err != nil {
		return "", err
	}
	var rendered []Endpoint
	var proxyLines []string
	for _, e := range endpoints {
		if line, ok := SurgeLine(e); ok {
			e.Name = strings.SplitN(line, " = ", 2)[0]
			rendered = append(rendered, e)
			proxyLines = append(proxyLines, line)
		}
	}
	landing, relay, chain := chainGroups(rendered)
	for i := range proxyLines {
		if chain && rendered[i].ChainRole == ChainRoleLanding {
			proxyLines[i] += ", underlying-proxy=" + ChainRelayGroup
		}
	}
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	insert := func(at int, add []string) {
		lines = append(lines[:at], append(append([]string{}, add...), lines[at:]...)...)
	}
	if chain {
		g := surgeSections(lines)["proxy group"]
		insert(surgeSectionEnd(lines, g), []string{
			ChainLandingGroup + " = select, " + strings.Join(landing, ", "),
			ChainRelayGroup + " = select, " + strings.Join(relay, ", "),
		})
	}
	secs := surgeSections(lines)
	if p, ok := secs["proxy"]; ok {
		end := surgeSectionEnd(lines, p)
		// Before the blank lines that separate it from the next section.
		for end > p+1 && strings.TrimSpace(lines[end-1]) == "" {
			end--
		}
		insert(end, proxyLines)
	} else {
		insert(secs["proxy group"], append(append([]string{"[Proxy]"}, proxyLines...), ""))
	}
	out := strings.Join(lines, "\n")
	if !strings.HasSuffix(out, "\n") {
		out += "\n"
	}
	return out, nil
}

// templateProfile renders endpoints into a template for a client slot.
func templateProfile(slot, content string, endpoints []Endpoint, opts SubOptions) (string, error) {
	switch slot {
	case TemplateClash, TemplateStash, TemplateShadowrocket:
		return clashTemplateProfile(content, endpoints, slot)
	case TemplateSingbox:
		return singboxTemplateProfile(content, endpoints, opts.SingboxSnell)
	case TemplateSurge:
		return surgeTemplateProfile(content, endpoints)
	}
	return "", fmt.Errorf("不支持的模板格式 %s", slot)
}
