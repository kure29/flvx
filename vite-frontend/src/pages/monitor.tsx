import type { MonitorNodeApiItem } from "@/api/types";
import type { StatusView } from "@/api";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";

import { AnimatedPage } from "@/components/animated-page";
import { PageHeader } from "@/components/page-kit";
import { ViewModeToggle, useViewMode } from "@/components/view-mode";
import { getMonitorNodes, getMonitorStatus } from "@/api";
import { StatusBoard } from "@/pages/status/status-board";
import { isAdmin } from "@/utils/auth";
import { MonitorView } from "@/pages/node/monitor-view";
import { useNodeRealtime } from "@/pages/node/use-node-realtime";

type MonitorNode = {
  id: number;
  name: string;
  connectionStatus: "online" | "offline";
  version?: string;
};

/**
 * 监控 for users allowed to see it: a read-only status view. Admins have it
 * all under 节点 (list and 监控 tab) and 中转 (质量).
 */
export default function MonitorPage() {
  return isAdmin() ? (
    <Navigate replace state={{ tab: "monitor" }} to="/node" />
  ) : (
    <ReadOnlyStatus />
  );
}

const STATUS_POLL_MS = 5000;

function ReadOnlyStatus() {
  const [view, setView] = useState<StatusView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timer = 0;
    const load = async () => {
      const res = await getMonitorStatus();

      if (!active) return;
      if (res.code === 0 && res.data) {
        setView(res.data);
        setError("");
      } else setError(res.msg || "加载失败");
      timer = window.setTimeout(load, STATUS_POLL_MS);
    };

    void load();

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatedPage className="space-y-4 px-3 py-6 lg:px-6">
      <PageHeader description="节点的实时状态，只读" title="节点状态" />
      {error && !view ? (
        <p className="py-16 text-center text-sm text-danger">{error}</p>
      ) : !view ? (
        <p className="py-16 text-center text-sm text-default-500">正在加载…</p>
      ) : (
        <StatusBoard nodes={view.nodes} />
      )}
    </AnimatedPage>
  );
}

/**
 * 节点 → 监控: each node's history charts and the service monitors (admins).
 * Live resources are on the node list; totals on the public status page.
 */
export function NodeMonitorTab() {
  const [nodes, setNodes] = useState<MonitorNodeApiItem[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useViewMode("monitor");
  const [realtimeNodeStatus, setRealtimeNodeStatus] = useState<
    Record<number, "online" | "offline">
  >({});

  const handleRealtimeMessage = useCallback((message: any) => {
    const nodeId = Number(message?.id ?? 0);

    if (!nodeId || Number.isNaN(nodeId)) return;
    if (String(message?.type ?? "") !== "status") return;
    const status = Number(message?.data);

    setRealtimeNodeStatus((prev) => ({
      ...prev,
      [nodeId]: status === 1 ? "online" : "offline",
    }));
  }, []);

  useNodeRealtime({
    onMessage: handleRealtimeMessage,
    enabled: true,
  });

  const loadNodes = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!silent) setNodesLoading(true);
    try {
      const response = await getMonitorNodes();

      if (response.code === 0 && Array.isArray(response.data)) {
        setNodesError(null);
        setNodes(response.data);

        return;
      }
      if (!silent) {
        setNodesError(response.msg || "加载节点失败");
        toast.error(response.msg || "加载节点失败");
      }
    } catch {
      if (!silent) toast.error("加载节点失败");
    } finally {
      if (!silent) setNodesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNodes();
    const timer = window.setInterval(() => {
      void loadNodes({ silent: true });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [loadNodes]);

  const nodeMap = useMemo(() => {
    const list: MonitorNode[] = nodes
      .filter((n) => Number(n.id) > 0)
      .map((n) => ({
        id: Number(n.id),
        name: String(n.name ?? ""),
        connectionStatus:
          realtimeNodeStatus[Number(n.id)] ||
          (n.status === 1 ? "online" : "offline"),
        version: n.version,
      }));

    return new Map<number, MonitorNode>(list.map((n) => [n.id, n]));
  }, [nodes, realtimeNodeStatus]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>
      {nodesError && (
        <div className="rounded-xl border border-divider bg-content1 px-3 py-2 text-sm text-default-600">
          {nodesError}
        </div>
      )}
      <MonitorView
        card={viewMode === "card"}
        nodeMap={nodeMap}
        refreshing={nodesLoading}
        onRefresh={() => void loadNodes()}
      />
    </div>
  );
}
