import type { MonitorNodeApiItem } from "@/api/types";
import type { StatusView } from "@/api";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { AnimatedPage } from "@/components/animated-page";
import { PageHeader, PageTabs } from "@/components/page-kit";
import { ViewModeToggle, useViewMode } from "@/components/view-mode";
import { getMonitorNodes, getMonitorStatus } from "@/api";
import { StatusBoard } from "@/pages/status/status-board";
import { isAdmin } from "@/utils/auth";
import { MonitorView } from "@/pages/node/monitor-view";
import { TunnelMonitorView } from "@/pages/node/tunnel-monitor-view";
import { useNodeRealtime } from "@/pages/node/use-node-realtime";

type MonitorNode = {
  id: number;
  name: string;
  connectionStatus: "online" | "offline";
  version?: string;
};

type MonitorTab = "nodes" | "tunnels";

const formatBytesPerSecond = (bytesPerSecond: number): string => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";

  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));

  return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/** Admins get the full monitor; other users a read-only status view. */
export default function MonitorPage() {
  return isAdmin() ? <AdminMonitorPage /> : <ReadOnlyStatus />;
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

function AdminMonitorPage() {
  const [nodes, setNodes] = useState<MonitorNodeApiItem[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MonitorTab>("nodes");
  const [viewMode, setViewMode] = useViewMode("monitor");
  const card = viewMode === "card";

  const [realtimeNodeStatus, setRealtimeNodeStatus] = useState<
    Record<number, "online" | "offline">
  >({});
  const [realtimeNodeMetrics, setRealtimeNodeMetrics] = useState<
    Record<number, any>
  >({});

  const handleRealtimeMessage = useCallback((message: any) => {
    const nodeId = Number(message?.id ?? 0);

    if (!nodeId || Number.isNaN(nodeId)) return;

    const type = String(message?.type ?? "");
    const payload = message?.data;

    if (type === "status") {
      const status = Number(payload);

      setRealtimeNodeStatus((prev) => ({
        ...prev,
        [nodeId]: status === 1 ? "online" : "offline",
      }));

      return;
    }

    if (type === "metric") {
      let raw = payload;

      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (!raw || typeof raw !== "object") return;
      const metric = raw as any;

      setRealtimeNodeMetrics((prev) => ({
        ...prev,
        [nodeId]: {
          cpuUsage: Number(metric.cpuUsage ?? metric.cpu_usage ?? 0),
          netInSpeed: Number(metric.netInSpeed ?? metric.net_in_speed ?? 0),
          netOutSpeed: Number(metric.netOutSpeed ?? metric.net_out_speed ?? 0),
          tcpConns: Number(metric.tcpConns ?? metric.tcp_conns ?? 0),
          udpConns: Number(metric.udpConns ?? metric.udp_conns ?? 0),
        },
      }));
    }
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

      if (response.code === 403) {
        setNodes([]);
        setNodesError(response.msg || "暂无监控权限，请联系管理员授权");

        return;
      }

      if (!silent) toast.error(response.msg || "加载节点失败");
    } catch {
      if (!silent) toast.error("加载节点失败");
    } finally {
      if (!silent) setNodesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  useEffect(() => {
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

  const aggregateMetrics = useMemo(() => {
    let totalCpu = 0;
    let totalConns = 0;
    let totalNetIn = 0;
    let totalNetOut = 0;
    let onlineCount = 0;

    nodeMap.forEach((node) => {
      if (node.connectionStatus === "online") {
        onlineCount++;
        const metric = realtimeNodeMetrics[node.id];

        if (metric) {
          totalCpu += metric.cpuUsage;
          totalConns += metric.tcpConns + metric.udpConns;
          totalNetIn += metric.netInSpeed;
          totalNetOut += metric.netOutSpeed;
        }
      }
    });

    const avgCpu = onlineCount > 0 ? totalCpu / onlineCount : 0;

    return {
      avgCpu,
      totalConns,
      totalBandwidth: totalNetIn + totalNetOut,
    };
  }, [nodeMap, realtimeNodeMetrics]);

  const stats = [
    {
      key: "load",
      label: "系统负载",
      value: `${aggregateMetrics.avgCpu.toFixed(1)}%`,
    },
    {
      key: "conns",
      label: "活动连接",
      value: String(aggregateMetrics.totalConns),
    },
    {
      key: "bandwidth",
      label: "带宽",
      value: formatBytesPerSecond(aggregateMetrics.totalBandwidth),
    },
  ];

  return (
    <AnimatedPage className="px-3 lg:px-6 py-6">
      <PageHeader description="节点资源与隧道质量的实时状态" title="监控" />

      <div className="mb-4 grid grid-cols-3 gap-2 sm:max-w-2xl">
        {stats.map((s) => (
          <div
            key={s.key}
            className="min-w-0 rounded-xl border border-divider bg-content1 px-3 py-2"
          >
            <div className="truncate text-xs text-default-500">{s.label}</div>
            <div className="truncate font-mono text-sm font-semibold sm:text-base">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PageTabs
            tabs={[
              { key: "nodes", label: "节点" },
              { key: "tunnels", label: "隧道" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {nodesError && activeTab === "nodes" && (
        <div className="mb-3 rounded-xl border border-divider bg-content1 px-3 py-2 text-sm text-default-600">
          {nodesError}
        </div>
      )}

      {activeTab === "nodes" ? (
        <MonitorView
          card={card}
          nodeMap={nodeMap}
          refreshing={nodesLoading}
          onRefresh={() => void loadNodes()}
        />
      ) : (
        <TunnelMonitorView card={card} />
      )}
    </AnimatedPage>
  );
}
