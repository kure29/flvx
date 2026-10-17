package handler

import (
	"strconv"
	"strings"
	"testing"
	"time"

	"go-backend/internal/kernel"
	"go-backend/internal/store/model"
	"go-backend/internal/store/repo"
)

func seedChainInbound(t *testing.T, r *repo.Repository, k *model.NodeKernel, name string, in kernel.Inbound, outboundID int64) *model.NodeInbound {
	t.Helper()
	if err := kernel.Normalize(k.KernelType, &in); err != nil {
		t.Fatal(err)
	}
	row := model.NodeInbound{KernelID: k.ID, NodeID: k.NodeID, Name: name, Enabled: 1, OutboundID: outboundID,
		CreatedTime: time.Now().UnixMilli()}
	if err := applyInboundToModel(in, &row); err != nil {
		t.Fatal(err)
	}
	if err := r.CreateNodeInbound(&row); err != nil {
		t.Fatal(err)
	}
	return &row
}

func seedChainKernel(t *testing.T, r *repo.Repository, nodeID int64, kernelType string) *model.NodeKernel {
	t.Helper()
	k := &model.NodeKernel{NodeID: nodeID, KernelType: kernelType, Version: "latest", Status: "pending", Enabled: 1,
		CreatedTime: time.Now().UnixMilli()}
	if err := r.CreateNodeKernel(k); err != nil {
		t.Fatal(err)
	}
	return k
}

func TestInboundChain(t *testing.T) {
	r, err := repo.Open(t.TempDir() + "/chain.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = r.Close() })
	h := New(r, "unit-test-secret")

	front := seedRelayTargetNode(t, r, "front", "198.51.100.1")
	landing := seedRelayTargetNode(t, r, "landing", "203.0.113.10")
	frontXray := seedChainKernel(t, r, front, kernel.TypeXray)
	landingBox := seedChainKernel(t, r, landing, kernel.TypeSingbox)

	target := seedChainInbound(t, r, landingBox, "landing-vless", kernel.Inbound{Protocol: kernel.ProtocolVLESS, Port: 443,
		Security: kernel.Security{Type: kernel.SecurityReality}}, 0)
	entry := seedChainInbound(t, r, frontXray, "front-vless", kernel.Inbound{Protocol: kernel.ProtocolVLESS, Port: 8443,
		Security: kernel.Security{Type: kernel.SecurityNone}}, target.ID)

	if err := h.validateChain(*entry, kernel.TypeXray); err != nil {
		t.Fatalf("valid chain rejected: %v", err)
	}
	payload, _, err := h.buildKernelApplyPayload(frontXray)
	if err != nil {
		t.Fatal(err)
	}
	cfg := payload["files"].([]kernel.File)[0].Content
	if !strings.Contains(cfg, `"tag": "via-`) || !strings.Contains(cfg, `"address": "203.0.113.10"`) {
		t.Fatalf("front kernel must dial the landing node:\n%s", cfg)
	}

	// Same node: dial locally.
	e, err := h.chainEndpoint(target, landing)
	if err != nil || e.Host != "127.0.0.1" {
		t.Fatalf("same-node chain: %q %v", e.Host, err)
	}

	loop := *target
	loop.OutboundID = entry.ID
	if err := h.validateChain(loop, kernel.TypeSingbox); err == nil || !strings.Contains(err.Error(), "循环") {
		t.Fatalf("loop not detected: %v", err)
	}
	self := *entry
	self.OutboundID = entry.ID
	if err := h.validateChain(self, kernel.TypeXray); err == nil {
		t.Fatal("chaining to itself must fail")
	}

	if msg := h.chainInUseMessage(target); !strings.Contains(msg, "front-vless") {
		t.Fatalf("delete guard: %q", msg)
	}
	if msg := h.chainInUseMessage(entry); msg != "" {
		t.Fatalf("nothing chains through the entry: %q", msg)
	}

	target.RelayWhitelist = 1
	allow := strings.Join(h.inboundAllowList(*target), ",")
	if !strings.Contains(allow, "198.51.100.1/32") {
		t.Fatalf("whitelist must admit the chained node: %s", allow)
	}

	target.AcceptProxyProtocol = 1
	if err := r.SaveNodeInbound(target); err != nil {
		t.Fatal(err)
	}
	if err := h.validateChain(*entry, kernel.TypeXray); err == nil || !strings.Contains(err.Error(), "PROXY") {
		t.Fatalf("PROXY protocol target must be refused: %v", err)
	}

	// A deleted target drops the traffic instead of leaking it out directly.
	if err := r.DeleteNodeInbound(target.ID); err != nil {
		t.Fatal(err)
	}
	payload, _, err = h.buildKernelApplyPayload(frontXray)
	if err != nil {
		t.Fatal(err)
	}
	cfg = payload["files"].([]kernel.File)[0].Content
	if !strings.Contains(cfg, `"outboundTag": "block"`) {
		t.Fatalf("missing target must be blocked:\n%s", cfg)
	}
}

func TestInboundSplitTargets(t *testing.T) {
	r, err := repo.Open(t.TempDir() + "/split.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = r.Close() })
	h := New(r, "unit-test-secret")

	front := seedRelayTargetNode(t, r, "front", "198.51.100.1")
	unlock := seedRelayTargetNode(t, r, "unlock", "203.0.113.20")
	frontBox := seedChainKernel(t, r, front, kernel.TypeSingbox)
	unlockXray := seedChainKernel(t, r, unlock, kernel.TypeXray)

	target := seedChainInbound(t, r, unlockXray, "unlock-vless", kernel.Inbound{Protocol: kernel.ProtocolVLESS, Port: 443,
		Security: kernel.Security{Type: kernel.SecurityReality}}, 0)
	entry := seedChainInbound(t, r, frontBox, "front-trojan", kernel.Inbound{Protocol: kernel.ProtocolTrojan, Port: 8443,
		Security: kernel.Security{Type: kernel.SecurityTLS, SNI: "f.example.com"}}, 0)
	entry.SplitRules = `[{"categories":["netflix"],"action":"proxy","outboundId":` + jsonID(target.ID) + `},{"categories":["bt"],"action":"block"}]`
	if err := r.SaveNodeInbound(entry); err != nil {
		t.Fatal(err)
	}

	if err := h.validateChain(*entry, kernel.TypeSingbox); err != nil {
		t.Fatalf("valid split rejected: %v", err)
	}
	payload, _, err := h.buildKernelApplyPayload(frontBox)
	if err != nil {
		t.Fatal(err)
	}
	cfg := payload["files"].([]kernel.File)[0].Content
	if !strings.Contains(cfg, `"tag": "via-`+jsonID(entry.ID)+`-s1"`) || !strings.Contains(cfg, `"server": "203.0.113.20"`) ||
		!strings.Contains(cfg, "geosite-netflix.srs") {
		t.Fatalf("front kernel must route netflix to the unlock node:\n%s", cfg)
	}

	if msg := h.chainInUseMessage(target); !strings.Contains(msg, "front-trojan") {
		t.Fatalf("a 分流 target is in use: %q", msg)
	}
	target.RelayWhitelist = 1
	if allow := strings.Join(h.inboundAllowList(*target), ","); !strings.Contains(allow, "198.51.100.1/32") {
		t.Fatalf("whitelist must admit the node routing through it: %s", allow)
	}

	// The unlock node routing back through the entry would loop.
	loop := *target
	loop.SplitRules = `[{"categories":["ads"],"action":"proxy","outboundId":` + jsonID(entry.ID) + `}]`
	if err := h.validateChain(loop, kernel.TypeXray); err == nil || !strings.Contains(err.Error(), "循环") {
		t.Fatalf("loop through a 分流 rule: %v", err)
	}
	if got := changedTargets([]int64{1, 2}, []int64{2, 3}); len(got) != 2 || got[0] != 1 || got[1] != 3 {
		t.Fatalf("changed targets: %v", got)
	}
}

func jsonID(id int64) string { return strconv.FormatInt(id, 10) }
