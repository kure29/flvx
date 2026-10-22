import type { InstallRequest } from "@/pages/inbound/kernel-panel";

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { AnimatedPage } from "@/components/animated-page";
import { PageHeader, PageTabs } from "@/components/page-kit";
import NodePage from "@/pages/node";
import { KernelsTab } from "@/pages/node/kernels-tab";
import { NodeMonitorDetail } from "@/pages/monitor";

type NodeTab = "nodes" | "kernels";

/** Where other pages send someone to install a kernel (route state). */
export interface NodeHubState {
  tab?: NodeTab;
  install?: InstallRequest;
}

const TAB_KEY = "flvx_node_tab";

function readTab(): NodeTab {
  try {
    const t = localStorage.getItem(TAB_KEY);

    return t === "kernels" ? t : "nodes";
  } catch {
    return "nodes"; // remembering the tab is only a convenience
  }
}

/** Servers and the kernels installed on them. */
export default function NodeHubPage() {
  const location = useLocation();
  const pageTop = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const state = (location.state ?? {}) as NodeHubState;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedNode = Number(searchParams.get("id"));
  const monitorNode =
    Number.isSafeInteger(requestedNode) && requestedNode > 0
      ? requestedNode
      : null;
  const setMonitorNode = (id: number | null) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);

      next.delete("view");

      if (id === null) next.delete("id");
      else next.set("id", String(id));

      return next;
    });
  };
  const [tab, setTabState] = useState<NodeTab>(
    monitorNode
      ? "nodes"
      : state.install
        ? "kernels"
        : (state.tab ?? readTab()),
  );
  const [install, setInstall] = useState<InstallRequest | null>(
    state.install ?? null,
  );
  const [addNode, setAddNode] = useState(0);

  const setTab = (t: NodeTab) => {
    setTabState(t);
    setMonitorNode(null);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (monitorNode !== null) setTabState("nodes");
    pageTop.current?.closest("main")?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [monitorNode]);

  // The request is consumed once; a reload must not reopen the dialog.
  useEffect(() => {
    if (location.state)
      navigate(`${location.pathname}${location.search}`, { replace: true });
  }, [location.state, location.pathname, location.search, navigate]);

  return (
    <AnimatedPage className="px-3 py-6 lg:px-6">
      <div ref={pageTop} aria-hidden />
      <PageHeader
        description={
          tab === "kernels"
            ? "节点上安装的 Xray / sing-box / Snell 等内核，落地的入站跑在内核上"
            : "查看服务器的实时资源、网络状态与运行情况"
        }
        // The kernel tab has its own 安装内核 button.
        primary={
          tab === "nodes" && monitorNode === null
            ? {
                key: "add",
                label: "新建节点",
                onPress: () => setAddNode((n) => n + 1),
              }
            : undefined
        }
        title="节点"
      />
      <PageTabs
        tabs={[
          { key: "nodes", label: "节点" },
          { key: "kernels", label: "内核" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "kernels" ? (
        <KernelsTab
          installRequest={install}
          onInstallRequestHandled={() => setInstall(null)}
        />
      ) : (
        <>
          {monitorNode !== null && (
            <NodeMonitorDetail
              key={monitorNode}
              nodeId={monitorNode}
              onBack={() => setMonitorNode(null)}
            />
          )}
          <div className={monitorNode !== null ? "hidden" : ""}>
            <NodePage
              embedded
              addRequest={addNode}
              onOpenMonitor={setMonitorNode}
            />
          </div>
        </>
      )}
    </AnimatedPage>
  );
}
