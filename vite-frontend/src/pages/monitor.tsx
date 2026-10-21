import type { MonitorNodeApiItem } from "@/api/types";
import type { StatusView } from "@/api";

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";

import { AnimatedPage } from "@/components/animated-page";
import { PageHeader } from "@/components/page-kit";
import { getMonitorNodes, getMonitorStatus } from "@/api";
import { StatusBoard } from "@/pages/status/status-board";
import { isAdmin } from "@/utils/auth";
import { MonitorView } from "@/pages/node/monitor-view";

type MonitorNode = {
  id: number;
  name: string;
  connectionStatus: "online" | "offline";
  version?: string;
};

/**
 * 监控 for users allowed to see it: a read-only status view. Admins have it
 * all under 节点 (each node's 监控) and 中转 (质量).
 */
export default function MonitorPage() {
  return isAdmin() ? <Navigate replace to="/node" /> : <ReadOnlyStatus />;
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
 * One node's monitoring, opened from the node list: live figures, history
 * charts and its service monitors.
 */
export function NodeMonitorDetail({
  nodeId,
  onBack,
}: {
  nodeId: number;
  onBack: () => void;
}) {
  const [nodes, setNodes] = useState<MonitorNodeApiItem[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await getMonitorNodes();

        if (!active) return;
        if (res.code === 0 && Array.isArray(res.data)) setNodes(res.data);
        else toast.error(res.msg || "加载节点失败");
      } catch {
        if (active) toast.error("加载节点失败");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const nodeMap = useMemo(
    () =>
      new Map<number, MonitorNode>(
        nodes
          .filter((n) => Number(n.id) > 0)
          .map((n) => [
            Number(n.id),
            {
              id: Number(n.id),
              name: String(n.name ?? ""),
              connectionStatus: n.status === 1 ? "online" : "offline",
              version: n.version,
            },
          ]),
      ),
    [nodes],
  );

  return <MonitorView focusNodeId={nodeId} nodeMap={nodeMap} onBack={onBack} />;
}
