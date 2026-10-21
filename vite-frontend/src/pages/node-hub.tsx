import type { InstallRequest } from "@/pages/inbound/kernel-panel";

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AnimatedPage } from "@/components/animated-page";
import { PageHeader, PageTabs } from "@/components/page-kit";
import NodePage from "@/pages/node";
import { KernelsTab } from "@/pages/node/kernels-tab";

type NodeTab = "nodes" | "kernels";

/** Where other pages send someone to install a kernel (route state). */
export interface NodeHubState {
  tab?: NodeTab;
  install?: InstallRequest;
}

const TAB_KEY = "flvx_node_tab";

function readTab(): NodeTab {
  try {
    return localStorage.getItem(TAB_KEY) === "kernels" ? "kernels" : "nodes";
  } catch {
    return "nodes"; // remembering the tab is only a convenience
  }
}

/** Servers and the kernels installed on them. */
export default function NodeHubPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as NodeHubState;
  const [tab, setTabState] = useState<NodeTab>(
    state.install ? "kernels" : (state.tab ?? readTab()),
  );
  const [install, setInstall] = useState<InstallRequest | null>(
    state.install ?? null,
  );
  const [addNode, setAddNode] = useState(0);

  const setTab = (t: NodeTab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // ignore
    }
  };

  // The request is consumed once; a reload must not reopen the dialog.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true });
  }, [location.state, location.pathname, navigate]);

  return (
    <AnimatedPage className="px-3 py-6 lg:px-6">
      <PageHeader
        description={
          tab === "kernels"
            ? "节点上安装的 Xray / sing-box / Snell 等内核，落地的入站跑在内核上"
            : "装了 agent 的服务器，用来搭建落地和中转"
        }
        // The kernel tab has its own 安装内核 button.
        primary={
          tab === "nodes"
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
        <NodePage embedded addRequest={addNode} />
      )}
    </AnimatedPage>
  );
}
