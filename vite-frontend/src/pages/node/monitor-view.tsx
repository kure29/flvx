import type {
  NodeMetricApiItem,
  ServiceMonitorApiItem,
  ServiceMonitorResultApiItem,
  ServiceMonitorMutationPayload,
  ServiceMonitorLimitsApiData,
} from "@/api/types";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  Activity,
  Clock,
  Play,
  ArrowLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";

import { EmptyHint } from "@/components/page-kit";
import {
  getNodeMetrics,
  getServiceMonitorList,
  getServiceMonitorLimits,
  getServiceMonitorResults,
  getServiceMonitorLatestResults,
  createServiceMonitor,
  updateServiceMonitor,
  deleteServiceMonitor,
  runServiceMonitor,
} from "@/api";
import { Button } from "@/shadcn-bridge/heroui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Switch } from "@/shadcn-bridge/heroui/switch";
import { Select, SelectItem } from "@/shadcn-bridge/heroui/select";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@/shadcn-bridge/heroui/dropdown";
import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";
import { Progress } from "@/shadcn-bridge/heroui/progress";
import {
  DistroIcon,
  getDistroColor,
  parseDistroFromVersion,
} from "@/components/distro-icon";
import { NodeDetailOverview } from "@/pages/node/detail-overview";
import { NodeNetworkQuality } from "@/pages/node/network-quality";
import { NodeTrafficStatistics } from "@/pages/node/traffic-statistics";
import { uptimeLabel } from "@/pages/node/status-card";
import { useNodeRealtime } from "@/pages/node/use-node-realtime";

interface MonitorViewProps {
  nodeMap: Map<
    number,
    { id: number; name: string; connectionStatus: string; version?: string }
  >;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Opens straight into this node's detail, without the overview. */
  focusNodeId?: number | null;
  /** With focusNodeId: the back button leaves the view. */
  onBack?: () => void;
}

type RealtimeNodeMetric = {
  receivedAt: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  netInBytes: number;
  netOutBytes: number;
  netInSpeed: number;
  netOutSpeed: number;
  load1: number;
  load5: number;
  load15: number;
  tcpConns: number;
  udpConns: number;
  uptime: number;
};

const isSupportedMonitorType = (t: string): t is "tcp" | "icmp" =>
  t === "tcp" || t === "icmp";

const formatTimestamp = (ts: number, rangeMs?: number): string => {
  const date = new Date(ts);
  const includeDate = (rangeMs ?? 0) >= 24 * 60 * 60 * 1000;

  if (includeDate) {
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTime = (ts: number): string => {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatBytesPerSecond = (bytesPerSecond: number): string => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";

  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));

  return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatUptime = (seconds: number) => {
  if (!seconds) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);

  if (days > 0) return `${days} 天 ${hours} 小时`;

  return `${hours} 小时`;
};

const getColorByUsage = (usage?: number) => {
  if (usage === undefined || usage === null) return "default";
  if (usage >= 90) return "danger";
  if (usage >= 75) return "warning";
  if (usage >= 50) return "primary";

  return "success";
};

/** A node's live resource card. */
function ServerCard({
  node,
  metric,
  onPress,
}: {
  node: any;
  metric: RealtimeNodeMetric | null;
  onPress?: () => void;
}) {
  const isOnline = node.connectionStatus === "online";
  const distro = parseDistroFromVersion(node.version);
  const distroColor = getDistroColor(distro);

  return (
    <Card
      className="group relative hover:border-default-300 transition-all duration-300 h-full flex flex-col cursor-pointer"
      onClick={onPress}
    >
      {/* Dynamic top gradient bar based on status */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${isOnline ? "bg-success" : "bg-danger"}`}
      />

      {/* Decorative background glow */}
      <div
        className={`absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl opacity-10 transition-opacity group-hover:opacity-20 ${isOnline ? "bg-success" : "bg-danger"}`}
      />

      <CardHeader className="pb-2 pt-5 px-5 flex flex-row justify-between items-start gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-default-100 dark:bg-default-50/10 flex items-center justify-center border border-divider">
              <DistroIcon
                className="w-5 h-5"
                distro={distro}
                style={{ color: isOnline ? distroColor : undefined }}
              />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${isOnline ? "bg-success" : "bg-danger"}`}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="font-semibold text-foreground text-sm truncate">
              {node.name}
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] text-default-500 mt-0.5">
              <span className="font-mono">{isOnline ? "在线" : "离线"}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardBody className="py-3 px-5 flex-1 flex flex-col justify-end gap-4 z-10 w-full overflow-hidden">
        <div className="grid grid-cols-2 gap-5 w-full">
          <div className="space-y-1.5 min-w-0">
            <div className="flex justify-between items-center text-xs">
              <span className="text-default-500">CPU</span>
              <span className="font-mono font-medium">
                {isOnline && metric ? `${metric.cpuUsage.toFixed(1)}%` : "-"}
              </span>
            </div>
            <Progress
              className="h-1"
              color={getColorByUsage(metric?.cpuUsage)}
              value={isOnline && metric ? metric.cpuUsage : 0}
            />
          </div>
          <div className="space-y-1.5 min-w-0">
            <div className="flex justify-between items-center text-xs">
              <span className="text-default-500">内存</span>
              <span className="font-mono font-medium">
                {isOnline && metric ? `${metric.memoryUsage.toFixed(1)}%` : "-"}
              </span>
            </div>
            <Progress
              className="h-1"
              color={getColorByUsage(metric?.memoryUsage)}
              size="sm"
              value={isOnline && metric ? metric.memoryUsage : 0}
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-lg bg-default-50 dark:bg-default-100/30 border border-divider mt-1 w-full">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] text-default-500">
              <span className="text-primary-500 inline-block font-bold">↑</span>
              <span>上传</span>
            </div>
            <span className="font-mono text-xs font-semibold truncate">
              {isOnline && metric
                ? formatBytesPerSecond(metric.netOutSpeed)
                : "-"}
            </span>
          </div>
          <div className="w-px h-6 bg-divider mx-2" />
          <div className="flex flex-col gap-0.5 items-end min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] text-default-500">
              <span>下载</span>
              <span className="text-success-500 inline-block font-bold">↓</span>
            </div>
            <span className="font-mono text-xs font-semibold truncate">
              {isOnline && metric
                ? formatBytesPerSecond(metric.netInSpeed)
                : "-"}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center mt-1 pt-3 border-t border-divider/50 w-full overflow-hidden">
          <div className="flex items-center gap-1.5 text-[11px] text-default-500 min-w-0">
            <Clock className="w-3.5 h-3.5 text-default-400 shrink-0" />
            <span className="font-mono truncate">
              {metric ? formatUptime(metric.uptime) : "-"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-default-500 shrink-0 ml-2">
            <Activity className="w-3.5 h-3.5 text-default-400" />
            <span className="font-mono">
              Load: {metric ? metric.load1.toFixed(2) : "-"}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

type MetricType =
  | "resources"
  | "cpu"
  | "memory"
  | "disk"
  | "network"
  | "load"
  | "connections";

const METRICS_MAX_ROWS = 5000;

/* ─── Memoized Node Metrics Chart sub-component ─────────────────── */

interface NodeMetricsChartCardProps {
  title?: string;
  showMetricSelector?: boolean;
  rangeMs: number;
  onRangeChange: (v: number) => void;
  activeMetricType: MetricType;
  onMetricTypeChange: (t: MetricType) => void;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  maxRows: number;
  data: Array<Record<string, unknown>>;
  nodeId: number | null;
  onRefresh: (id: number) => void;
}

const METRIC_TYPE_BUTTONS: { key: MetricType; label: string }[] = [
  { key: "resources", label: "资源" },
  { key: "cpu", label: "CPU" },
  { key: "memory", label: "内存" },
  { key: "disk", label: "磁盘" },
  { key: "network", label: "网络" },
  { key: "load", label: "负载" },
  { key: "connections", label: "连接" },
];

const NodeMetricsChartCard = React.memo(function NodeMetricsChartCard({
  title = "负载详情",
  showMetricSelector = true,
  rangeMs,
  onRangeChange,
  activeMetricType,
  onMetricTypeChange,
  loading,
  error,
  truncated,
  maxRows,
  data,
  nodeId,
  onRefresh,
}: NodeMetricsChartCardProps) {
  const chartConfig = (() => {
    switch (activeMetricType) {
      case "resources":
        return {
          lines: [
            { dataKey: "cpu", color: "var(--chart-cpu)", name: "CPU %" },
            { dataKey: "memory", color: "var(--chart-memory)", name: "内存 %" },
            { dataKey: "disk", color: "var(--chart-disk)", name: "磁盘 %" },
          ],
          yAxisLabel: "使用率 (%)",
        };
      case "cpu":
        return {
          lines: [{ dataKey: "cpu", color: "var(--chart-cpu)", name: "CPU %" }],
          yAxisLabel: "使用率 (%)",
        };
      case "memory":
        return {
          lines: [
            { dataKey: "memory", color: "var(--chart-memory)", name: "内存 %" },
          ],
          yAxisLabel: "使用率 (%)",
        };
      case "disk":
        return {
          lines: [
            { dataKey: "disk", color: "var(--chart-disk)", name: "磁盘 %" },
          ],
          yAxisLabel: "使用率 (%)",
        };
      case "network":
        return {
          lines: [
            {
              dataKey: "netIn",
              color: "var(--chart-download)",
              name: "接收速度",
            },
            {
              dataKey: "netOut",
              color: "var(--chart-upload)",
              name: "发送速度",
            },
          ],
          yAxisLabel: "速度 (bytes/s)",
        };
      case "load":
        return {
          lines: [
            { dataKey: "load1", color: "var(--chart-cpu)", name: "负载 1m" },
            { dataKey: "load5", color: "var(--chart-memory)", name: "负载 5m" },
            { dataKey: "load15", color: "var(--chart-disk)", name: "负载 15m" },
          ],
          yAxisLabel: "负载值",
        };
      case "connections":
        return {
          lines: [
            { dataKey: "tcp", color: "var(--chart-cpu)", name: "TCP 连接" },
            {
              dataKey: "udp",
              color: "var(--chart-download)",
              name: "UDP 连接",
            },
          ],
          yAxisLabel: "连接数",
        };
    }
  })();

  const yAxisTickFormatter = (value: unknown) => {
    const n = Number(value);

    if (!Number.isFinite(n)) return "";
    switch (activeMetricType) {
      case "network":
        return (n / (1024 * 1024)).toFixed(1);
      case "resources":
      case "cpu":
      case "memory":
      case "disk":
        return `${n.toFixed(0)}%`;
      case "load":
        return n.toFixed(1);
      case "connections":
        return String(Math.round(n));
    }
  };

  const tooltipFormatter = (value: unknown) => {
    const n = Number(value);

    if (!Number.isFinite(n)) return "-";
    switch (activeMetricType) {
      case "network":
        return formatBytesPerSecond(n);
      case "resources":
      case "cpu":
      case "memory":
      case "disk":
        return `${n.toFixed(1)}%`;
      case "load":
        return n.toFixed(2);
      case "connections":
        return String(Math.round(n));
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-divider !p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <Select
            className="w-28"
            selectedKeys={[String(rangeMs)]}
            onSelectionChange={(keys) => {
              const v = Number(Array.from(keys)[0]);

              if (v > 0) onRangeChange(v);
            }}
          >
            <SelectItem key={String(15 * 60 * 1000)}>15分钟</SelectItem>
            <SelectItem key={String(60 * 60 * 1000)}>1小时</SelectItem>
            <SelectItem key={String(6 * 60 * 60 * 1000)}>6小时</SelectItem>
            <SelectItem key={String(24 * 60 * 60 * 1000)}>24小时</SelectItem>
          </Select>
          <Button
            isLoading={loading}
            size="sm"
            variant="flat"
            onPress={() => nodeId && onRefresh(nodeId)}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardBody className="flex flex-1 flex-col gap-4">
        {showMetricSelector && (
          <div className="flex flex-wrap gap-1.5">
            {METRIC_TYPE_BUTTONS.map((item) => (
              <Button
                key={item.key}
                color={activeMetricType === item.key ? "primary" : "default"}
                size="sm"
                variant={activeMetricType === item.key ? "solid" : "flat"}
                onPress={() => onMetricTypeChange(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-danger text-sm">{error}</div>
        ) : data.length > 0 ? (
          <>
            <div className="mt-auto h-64">
              <ResponsiveContainer
                height="100%"
                initialDimension={{ width: 400, height: 256 }}
                minWidth={0}
                width="100%"
              >
                <LineChart data={data}>
                  <Legend
                    height={28}
                    iconSize={8}
                    iconType="circle"
                    verticalAlign="top"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <CartesianGrid stroke="var(--divider)" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="time"
                    fontSize={10}
                    minTickGap={30}
                    stroke="var(--default-500)"
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    fontSize={10}
                    label={
                      activeMetricType === "network"
                        ? {
                            value: "MB/s",
                            position: "insideTopLeft",
                            offset: 0,
                            dy: -15,
                            fill: "var(--default-500)",
                            fontSize: 10,
                          }
                        : undefined
                    }
                    stroke="var(--default-500)"
                    tickFormatter={yAxisTickFormatter}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--content1)",
                      border: "1px solid var(--divider)",
                      color: "var(--foreground)",
                      borderRadius: "8px",
                    }}
                    formatter={tooltipFormatter}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  {chartConfig.lines.map((line) => (
                    <Line
                      key={line.dataKey}
                      dataKey={line.dataKey}
                      dot={false}
                      name={line.name}
                      stroke={line.color}
                      strokeWidth={2}
                      type="monotone"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {truncated && (
              <div className="text-xs text-default-500">
                数据点过多，已截断为最近 {maxRows} 条，建议缩小时间范围。
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-default-500">暂无指标数据</div>
        )}
      </CardBody>
    </Card>
  );
});

const DEFAULT_SERVICE_MONITOR_LIMITS: ServiceMonitorLimitsApiData = {
  checkerScanIntervalSec: 1,
  minIntervalSec: 1,
  defaultIntervalSec: 1,
  minTimeoutSec: 1,
  defaultTimeoutSec: 5,
  maxTimeoutSec: 60,
};

export function MonitorView({
  nodeMap,
  onRefresh,
  refreshing,
  focusNodeId = null,
  onBack,
}: MonitorViewProps) {
  const [detailNodeId, setDetailNodeId] = useState<number | null>(focusNodeId);
  const [detailParams, setDetailParams] = useSearchParams();
  const detailTab =
    detailParams.get("view") === "quality" ? "quality" : "overview";
  const setDetailTab = (value: "overview" | "quality") =>
    setDetailParams(
      (previous) => {
        const next = new URLSearchParams(previous);

        if (value === "quality") next.set("view", "quality");
        else next.delete("view");

        return next;
      },
      { replace: true },
    );
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(
    focusNodeId,
  );
  const [metrics, setMetrics] = useState<NodeMetricApiItem[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsTruncated, setMetricsTruncated] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [activeMetricType, setActiveMetricType] =
    useState<MetricType>("resources");

  const [metricsRangeMs, setMetricsRangeMs] = useState(60 * 60 * 1000);

  const [serviceMonitors, setServiceMonitors] = useState<
    ServiceMonitorApiItem[]
  >([]);
  const [monitorsLoading, setMonitorsLoading] = useState(false);
  const [, setMonitorsError] = useState<string | null>(null);
  const [, setLatestResultsError] = useState<string | null>(null);
  const [monitorResults, setMonitorResults] = useState<
    Record<number, ServiceMonitorResultApiItem[]>
  >({});

  const [serviceMonitorLimits, setServiceMonitorLimits] =
    useState<ServiceMonitorLimitsApiData | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] =
    useState<ServiceMonitorApiItem | null>(null);
  const [monitorForm, setMonitorForm] = useState({
    name: "",
    type: "tcp" as "tcp" | "icmp",
    target: "",
    intervalSec: DEFAULT_SERVICE_MONITOR_LIMITS.defaultIntervalSec,
    timeoutSec: DEFAULT_SERVICE_MONITOR_LIMITS.defaultTimeoutSec,
    nodeId: 0,
    enabled: true,
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [activeServiceMonitorId, setActiveServiceMonitorId] = useState<
    number | null
  >(null);
  const [serviceMonitorRangeMs, setServiceMonitorRangeMs] = useState(
    60 * 60 * 1000,
  );

  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [resultsMonitorId, setResultsMonitorId] = useState<number | null>(null);
  const [resultsLimit, setResultsLimit] = useState(50);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [realtimeNodeStatus, setRealtimeNodeStatus] = useState<
    Record<number, "online" | "offline">
  >({});
  const [realtimeNodeMetrics, setRealtimeNodeMetrics] = useState<
    Record<number, RealtimeNodeMetric>
  >({});

  const nodes = useMemo(() => {
    return Array.from(nodeMap.values()).map((n) => {
      const status = realtimeNodeStatus[n.id];

      if (!status) {
        return n;
      }

      return {
        ...n,
        connectionStatus: status,
      };
    });
  }, [nodeMap, realtimeNodeStatus]);

  const onlineNodes = nodes.filter((n) => n.connectionStatus === "online");
  const preferredNodeId = onlineNodes[0]?.id ?? nodes[0]?.id ?? 0;

  const resolvedServiceMonitorLimits =
    serviceMonitorLimits ?? DEFAULT_SERVICE_MONITOR_LIMITS;

  const handleRealtimeMessage = useCallback((message: any) => {
    const nodeId = Number(message?.id ?? 0);

    if (!nodeId || Number.isNaN(nodeId)) {
      return;
    }

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
      if (!raw || typeof raw !== "object") {
        return;
      }

      const metric = raw as Record<string, unknown>;
      const receivedAt = Date.now();
      const incomingUptime = Number(metric.uptime ?? 0);

      setRealtimeNodeMetrics((prev) => {
        const normalized: RealtimeNodeMetric = {
          receivedAt,
          cpuUsage: Number(metric.cpuUsage ?? metric.cpu_usage ?? 0),
          memoryUsage: Number(metric.memoryUsage ?? metric.memory_usage ?? 0),
          diskUsage: Number(metric.diskUsage ?? metric.disk_usage ?? 0),
          netInBytes: Number(metric.netInBytes ?? metric.bytes_received ?? 0),
          netOutBytes: Number(
            metric.netOutBytes ?? metric.bytes_transmitted ?? 0,
          ),
          netInSpeed: Number(metric.netInSpeed ?? metric.net_in_speed ?? 0),
          netOutSpeed: Number(metric.netOutSpeed ?? metric.net_out_speed ?? 0),
          load1: Number(metric.load1 ?? 0),
          load5: Number(metric.load5 ?? 0),
          load15: Number(metric.load15 ?? 0),
          tcpConns: Number(metric.tcpConns ?? metric.tcp_conns ?? 0),
          udpConns: Number(metric.udpConns ?? metric.udp_conns ?? 0),
          uptime: incomingUptime || prev[nodeId]?.uptime || 0,
        };

        return {
          ...prev,
          [nodeId]: normalized,
        };
      });
      setRealtimeNodeStatus((prev) => ({
        ...prev,
        [nodeId]: "online",
      }));

      return;
    }

    if (type === "info") {
      setRealtimeNodeStatus((prev) => ({
        ...prev,
        [nodeId]: "online",
      }));
    }
  }, []);

  const { wsConnected, wsConnecting } = useNodeRealtime({
    onMessage: handleRealtimeMessage,
    enabled: !accessDenied,
  });

  useEffect(() => {
    if (!selectedNodeId && preferredNodeId > 0) {
      setSelectedNodeId(preferredNodeId);
    }
  }, [preferredNodeId, selectedNodeId]);

  const loadMetrics = useCallback(
    async (nodeId: number, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (!silent) setMetricsLoading(true);
      try {
        const end = Date.now();
        const start = end - metricsRangeMs;
        const response = await getNodeMetrics(nodeId, start, end);

        if (response.code === 0 && Array.isArray(response.data)) {
          setAccessDenied(null);
          setMetricsError(null);
          setMetricsTruncated(response.data.length >= METRICS_MAX_ROWS);
          const ordered = [...response.data].sort(
            (a, b) => a.timestamp - b.timestamp,
          );

          setMetrics(ordered);

          return;
        }
        if (response.code === 403) {
          setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
          setMetricsTruncated(false);
          setMetricsError(null);

          return;
        }
        setMetricsTruncated(false);
        const msg = response.msg || "加载指标失败";
        const isTimeout = msg.toLowerCase().includes("timeout");
        const friendlyMsg = isTimeout
          ? "加载指标超时，请缩小时间范围后重试"
          : msg;

        setMetricsError(friendlyMsg);
        if (!silent) toast.error(friendlyMsg);
      } catch {
        setMetricsTruncated(false);
        if (!silent) setMetricsError("加载指标失败");
      } finally {
        if (!silent) setMetricsLoading(false);
      }
    },
    [metricsRangeMs],
  );

  const loadServiceMonitors = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (!silent) setMonitorsLoading(true);
      try {
        const response = await getServiceMonitorList();

        if (response.code === 0 && response.data) {
          setAccessDenied(null);
          setMonitorsError(null);
          setServiceMonitors(response.data);

          return;
        }
        if (response.code === 403) {
          setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
          setMonitorsError(null);

          return;
        }
        setMonitorsError(response.msg || "加载服务监控失败");
        if (!silent) toast.error(response.msg || "加载服务监控失败");
      } catch {
        if (!silent) setMonitorsError("加载服务监控失败");
      } finally {
        if (!silent) setMonitorsLoading(false);
      }
    },
    [],
  );

  const loadServiceMonitorLimits = useCallback(async () => {
    try {
      const response = await getServiceMonitorLimits();

      if (response.code === 0 && response.data) {
        setAccessDenied(null);
        setServiceMonitorLimits(response.data);

        return;
      }
      if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");

        return;
      }
    } catch {
      toast.error("加载服务监控限制失败，已使用默认值");
    }
  }, []);

  const loadMonitorResults = useCallback(
    async (
      monitorId: number,
      options?: { rangeMs?: number; limit?: number },
    ) => {
      try {
        const apiOptions =
          options?.rangeMs != null
            ? { start: Date.now() - options.rangeMs, end: Date.now() }
            : { limit: options?.limit ?? 100 };
        const response = await getServiceMonitorResults(monitorId, apiOptions);

        if (response.code === 0 && response.data) {
          setMonitorResults((prev) => ({
            ...prev,
            [monitorId]: response.data,
          }));

          return;
        }
        if (response.code === 403) {
          setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
        }
      } catch {
        toast.error("加载监控记录失败");
      }
    },
    [],
  );

  const loadLatestMonitorResults = useCallback(async () => {
    try {
      const response = await getServiceMonitorLatestResults();

      if (response.code === 0 && Array.isArray(response.data)) {
        setAccessDenied(null);
        setLatestResultsError(null);
        setMonitorResults((prev) => {
          const next: Record<number, ServiceMonitorResultApiItem[]> = {
            ...prev,
          };

          response.data.forEach((r) => {
            const monitorId = Number(r?.monitorId ?? 0);

            if (monitorId <= 0) return;

            const existing = next[monitorId];

            if (existing && existing.length > 1) {
              const rest = existing.filter((x) => x.id !== r.id);

              next[monitorId] = [r, ...rest];

              return;
            }

            next[monitorId] = [r];
          });

          return next;
        });

        return;
      }
      if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
        setLatestResultsError(null);

        return;
      }

      setLatestResultsError(response.msg || "加载最新监控结果失败");
    } catch {
      setLatestResultsError("加载最新监控结果失败");
    }
  }, []);

  const loadResultsForModal = useCallback(async () => {
    if (!resultsMonitorId) return;
    setResultsLoading(true);
    try {
      await loadMonitorResults(resultsMonitorId, { limit: resultsLimit });
    } finally {
      setResultsLoading(false);
    }
  }, [loadMonitorResults, resultsLimit, resultsMonitorId]);

  useEffect(() => {
    void loadServiceMonitors();
    void loadServiceMonitorLimits();
    void loadLatestMonitorResults();
  }, [loadLatestMonitorResults, loadServiceMonitorLimits, loadServiceMonitors]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadServiceMonitors({ silent: true });
      void loadLatestMonitorResults();
    }, 5_000);

    return () => window.clearInterval(timer);
  }, [loadLatestMonitorResults, loadServiceMonitors]);

  useEffect(() => {
    if (selectedNodeId) {
      loadMetrics(selectedNodeId);
    }
  }, [selectedNodeId, loadMetrics]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const timer = window.setInterval(() => {
      void loadMetrics(selectedNodeId, { silent: true });
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [selectedNodeId, loadMetrics]);

  useEffect(() => {
    if (!resultsModalOpen || !resultsMonitorId) return;
    void loadResultsForModal();
  }, [resultsModalOpen, resultsMonitorId, resultsLimit, loadResultsForModal]);

  // Auto-load results for the resolved default monitor when entering detail view
  useEffect(() => {
    if (!detailNodeId) return;
    if (activeServiceMonitorId) return; // user already selected one
    // Find the first monitor belonging to this node (or panel-level)
    const firstMonitor = serviceMonitors.find(
      (m) => m.nodeId === detailNodeId || m.nodeId === 0,
    );

    if (
      firstMonitor &&
      (!monitorResults[firstMonitor.id] ||
        monitorResults[firstMonitor.id].length <= 1)
    ) {
      void loadMonitorResults(firstMonitor.id, {
        rangeMs: serviceMonitorRangeMs,
      });
    }
  }, [detailNodeId, serviceMonitors]);

  // Reload results for the active service monitor chart when time range changes
  useEffect(() => {
    if (!activeServiceMonitorId) return;
    void loadMonitorResults(activeServiceMonitorId, {
      rangeMs: serviceMonitorRangeMs,
    });
  }, [activeServiceMonitorId, serviceMonitorRangeMs, loadMonitorResults]);

  const chartData = useMemo(
    () =>
      metrics.map((m) => ({
        time: formatTimestamp(m.timestamp, metricsRangeMs),
        cpu: m.cpuUsage,
        memory: m.memoryUsage,
        disk: m.diskUsage,
        netIn: m.netInSpeed,
        netOut: m.netOutSpeed,
        load1: m.load1,
        load5: m.load5,
        load15: m.load15,
        tcp: m.tcpConns,
        udp: m.udpConns,
      })),
    [metrics, metricsRangeMs],
  );

  const handleOpenEditModal = (monitor?: ServiceMonitorApiItem) => {
    if (monitor) {
      if (!isSupportedMonitorType(monitor.type)) {
        toast.error("该监控类型已不支持，仅支持删除");

        return;
      }
      setEditingMonitor(monitor);
      setMonitorForm({
        name: monitor.name,
        type: monitor.type as "tcp" | "icmp",
        target: monitor.target,
        intervalSec: monitor.intervalSec,
        timeoutSec: monitor.timeoutSec,
        nodeId: monitor.nodeId,
        enabled: monitor.enabled === 1,
      });
    } else {
      setEditingMonitor(null);
      setMonitorForm({
        name: "",
        type: "tcp",
        target: "",
        intervalSec: resolvedServiceMonitorLimits.defaultIntervalSec,
        timeoutSec: resolvedServiceMonitorLimits.defaultTimeoutSec,
        nodeId: 0,
        enabled: true,
      });
    }
    setEditModalOpen(true);
  };

  const handleSubmitMonitor = async () => {
    if (!monitorForm.name || !monitorForm.target) {
      toast.error("请填写完整信息");

      return;
    }

    if (
      monitorForm.type === "icmp" &&
      (!monitorForm.nodeId || monitorForm.nodeId <= 0)
    ) {
      toast.error("ICMP 监控必须选择执行节点");

      return;
    }

    if (monitorForm.intervalSec < resolvedServiceMonitorLimits.minIntervalSec) {
      toast.error(
        `检查间隔不能小于 ${resolvedServiceMonitorLimits.minIntervalSec}s`,
      );

      return;
    }

    if (
      monitorForm.timeoutSec < resolvedServiceMonitorLimits.minTimeoutSec ||
      monitorForm.timeoutSec > resolvedServiceMonitorLimits.maxTimeoutSec
    ) {
      toast.error(
        `超时时间需在 ${resolvedServiceMonitorLimits.minTimeoutSec}-${resolvedServiceMonitorLimits.maxTimeoutSec}s 范围内`,
      );

      return;
    }

    setSubmitLoading(true);
    try {
      const payload: ServiceMonitorMutationPayload = {
        name: monitorForm.name,
        type: monitorForm.type,
        target: monitorForm.target,
        intervalSec: monitorForm.intervalSec,
        timeoutSec: monitorForm.timeoutSec,
        nodeId: monitorForm.nodeId,
        enabled: monitorForm.enabled ? 1 : 0,
      };

      if (editingMonitor) {
        const response = await updateServiceMonitor({
          ...payload,
          id: editingMonitor.id,
        });

        if (response.code === 0) {
          toast.success("更新成功");
        } else {
          toast.error(response.msg || "更新失败");
        }
      } else {
        const response = await createServiceMonitor(payload);

        if (response.code === 0) {
          toast.success("创建成功");
        } else {
          toast.error(response.msg || "创建失败");
        }
      }

      setEditModalOpen(false);
      void loadServiceMonitors();
      void loadLatestMonitorResults();
    } catch {
      toast.error("操作失败");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteMonitor = async (id: number) => {
    if (!confirm("确定删除该监控项?")) return;
    try {
      const response = await deleteServiceMonitor(id);

      if (response.code === 0) {
        toast.success("删除成功");
        void loadServiceMonitors();
        void loadLatestMonitorResults();
      } else {
        toast.error(response.msg || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    }
  };

  const handleRunMonitor = async (id: number) => {
    try {
      const response = await runServiceMonitor(id);

      if (response.code === 0) {
        const ok = response.data?.success === 1;

        if (ok) {
          toast.success("检查成功");
        } else {
          toast.error(response.data?.errorMessage || "检查失败");
        }

        if (response.data) {
          const latest = response.data;

          setMonitorResults((prev) => {
            const next = { ...prev };
            const existing = next[id];

            if (existing && existing.length > 1) {
              next[id] = [
                latest,
                ...existing.filter((x) => x.id !== latest.id),
              ];
            } else {
              next[id] = [latest];
            }

            return next;
          });
        }

        void loadLatestMonitorResults();
        if (resultsMonitorId === id && resultsModalOpen) {
          void loadResultsForModal();
        }
      } else if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
      } else {
        toast.error(response.msg || "执行失败");
      }
    } catch {
      toast.error("执行失败");
    }
  };

  const openResultsModal = (monitorId: number) => {
    setResultsMonitorId(monitorId);
    setResultsModalOpen(true);
  };

  const getLatestResult = (
    monitorId: number,
  ): ServiceMonitorResultApiItem | null => {
    const results = monitorResults[monitorId];

    return results && results.length > 0 ? results[0] : null;
  };

  const resultsMonitor =
    resultsMonitorId != null
      ? serviceMonitors.find((m) => m.id === resultsMonitorId) || null
      : null;
  const modalResults =
    resultsMonitorId != null ? monitorResults[resultsMonitorId] || [] : [];

  const resolveMonitorIntervalSec = useCallback(
    (monitor: ServiceMonitorApiItem) => {
      let interval = Number(monitor.intervalSec ?? 0);

      if (!interval || interval <= 0) {
        interval = resolvedServiceMonitorLimits.defaultIntervalSec;
      }

      return Math.max(interval, resolvedServiceMonitorLimits.minIntervalSec);
    },
    [
      resolvedServiceMonitorLimits.defaultIntervalSec,
      resolvedServiceMonitorLimits.minIntervalSec,
    ],
  );

  // Backend batches DB writes every 30s, but latest API reads from in-memory cache.
  // The cache timestamp reflects the real check time (every ~1s), so stale detection
  // should still allow for the batch report interval + scan jitter.
  const SERVICE_MONITOR_REPORT_INTERVAL_MS = 30_000; // matches backend serviceMonitorReportInterval

  const isResultStale = useCallback(
    (
      monitor: ServiceMonitorApiItem,
      latestResult: ServiceMonitorResultApiItem | null,
    ) => {
      if (monitor.enabled !== 1) {
        return false;
      }
      if (!latestResult || !latestResult.timestamp) {
        return false;
      }

      const intervalMs = resolveMonitorIntervalSec(monitor) * 1000;
      // Budget = batch report interval + one check interval + scan jitter + grace
      const budgetMs =
        SERVICE_MONITOR_REPORT_INTERVAL_MS +
        intervalMs +
        resolvedServiceMonitorLimits.checkerScanIntervalSec * 1000 +
        5000;

      return Date.now() - latestResult.timestamp > budgetMs;
    },
    [
      resolveMonitorIntervalSec,
      resolvedServiceMonitorLimits.checkerScanIntervalSec,
    ],
  );

  const monitorSummary = useMemo(() => {
    let disabled = 0;
    let ok = 0;
    let fail = 0;
    let unknown = 0;
    let stale = 0;

    serviceMonitors.forEach((m) => {
      if (m.enabled !== 1) {
        disabled += 1;

        return;
      }

      const latest = getLatestResult(m.id);

      if (!latest) {
        unknown += 1;

        return;
      }

      if (isResultStale(m, latest)) {
        stale += 1;
      }
      if (latest.success === 1) {
        ok += 1;
      } else {
        fail += 1;
      }
    });

    return { disabled, ok, fail, unknown, stale };
  }, [getLatestResult, isResultStale, serviceMonitors]);

  const detailNode =
    detailNodeId != null ? nodes.find((n) => n.id === detailNodeId) : null;
  const detailRealtimeMetric =
    detailNodeId != null ? realtimeNodeMetrics[detailNodeId] || null : null;

  // Service monitors filtered for the detail node (0 = panel-executed, show all in that case)
  const detailServiceMonitors =
    detailNodeId != null
      ? serviceMonitors.filter(
          (m) => m.nodeId === detailNodeId || m.nodeId === 0,
        )
      : serviceMonitors;

  return (
    <div className="space-y-4">
      {accessDenied && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-semibold">监控权限</h3>
          </CardHeader>
          <CardBody>
            <div className="text-sm text-default-600">{accessDenied}</div>
            <div className="text-xs text-default-500 mt-2">
              如需使用监控功能，请联系管理员在用户页面授予监控权限。
            </div>
          </CardBody>
        </Card>
      )}

      {/* ====== NODE CARDS ====== */}
      {!accessDenied && !detailNodeId && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-500">
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${wsConnected ? "bg-success" : wsConnecting ? "bg-warning" : "bg-default-300"}`}
                />
                {wsConnected
                  ? "实时已连接"
                  : wsConnecting
                    ? "实时连接中"
                    : "实时未连接"}
              </span>
              <span>
                在线 {onlineNodes.length}/{nodes.length}
              </span>
              <span>
                服务监控 成功 {monitorSummary.ok} · 失败 {monitorSummary.fail}
              </span>
              {monitorSummary.stale > 0 && (
                <span className="text-warning">
                  陈旧 {monitorSummary.stale}
                </span>
              )}
            </div>
            {onRefresh && (
              <Button
                className="shrink-0 gap-1"
                isLoading={refreshing}
                size="sm"
                startContent={
                  refreshing ? undefined : <RefreshCw className="h-4 w-4" />
                }
                variant="flat"
                onPress={onRefresh}
              >
                刷新
              </Button>
            )}
          </div>

          {nodes.length === 0 ? (
            <EmptyHint text="暂无节点" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {nodes.map((node) => (
                <ServerCard
                  key={node.id}
                  metric={realtimeNodeMetrics[node.id] || null}
                  node={node}
                  onPress={() => {
                    setDetailNodeId(node.id);
                    setSelectedNodeId(node.id);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ====== DETAIL VIEW ====== */}
      {!accessDenied && detailNodeId && (
        <>
          {/* Header */}
          <div className="flex flex-col gap-4 rounded-2xl border border-divider bg-content1 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                className="shrink-0"
                size="sm"
                variant="flat"
                onPress={() => (onBack ? onBack() : setDetailNodeId(null))}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {onBack ? "返回节点" : "返回总览"}
              </Button>
              <span className="shrink-0 rounded-xl bg-default-100 p-2.5">
                <DistroIcon
                  className="h-6 w-6"
                  distro={parseDistroFromVersion(detailNode?.version)}
                  style={{
                    color: getDistroColor(
                      parseDistroFromVersion(detailNode?.version),
                    ),
                  }}
                />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h3
                    className="min-w-0 truncate text-lg font-semibold"
                    title={detailNode?.name}
                  >
                    {detailNode?.name || `节点 #${detailNodeId}`}
                  </h3>
                  <Chip
                    className="shrink-0"
                    color={
                      detailNode?.connectionStatus === "online"
                        ? "success"
                        : "danger"
                    }
                    size="sm"
                    variant="flat"
                  >
                    {detailNode?.connectionStatus === "online"
                      ? "在线"
                      : "离线"}
                  </Chip>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-500">
                  <span>{detailNode?.version || "等待节点信息"}</span>
                  {detailRealtimeMetric && (
                    <span>运行 {uptimeLabel(detailRealtimeMetric.uptime)}</span>
                  )}
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${wsConnected ? "bg-success" : wsConnecting ? "bg-warning" : "bg-default-300"}`}
                    />
                    {wsConnected
                      ? "实时已连接"
                      : wsConnecting
                        ? "实时连接中"
                        : "实时未连接"}
                  </span>
                </div>
              </div>
            </div>

            <div
              aria-label="节点详情分类"
              className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-default-100 p-1 sm:ml-auto sm:flex"
              role="tablist"
            >
              {(
                [
                  ["overview", "概况"],
                  ["quality", "网络质量"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-controls={`node-detail-${value}`}
                  aria-selected={detailTab === value}
                  className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${detailTab === value ? "bg-content1 text-foreground shadow-sm" : "text-default-500 hover:text-foreground"}`}
                  id={`node-tab-${value}`}
                  role="tab"
                  tabIndex={detailTab === value ? 0 : -1}
                  type="button"
                  onClick={() => setDetailTab(value)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "overview"
                        : event.key === "End"
                          ? "quality"
                          : value === "overview"
                            ? "quality"
                            : "overview";

                    setDetailTab(next);
                    document.getElementById(`node-tab-${next}`)?.focus();
                  }}
                >
                  <Activity className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {detailTab === "quality" ? (
            <div
              aria-labelledby="node-tab-quality"
              id="node-detail-quality"
              role="tabpanel"
            >
              <NodeNetworkQuality
                key={detailNodeId}
                nodeId={detailNodeId}
                nodeName={detailNode?.name || `节点${detailNodeId}`}
              />
            </div>
          ) : (
            <div
              aria-labelledby="node-tab-overview"
              className="space-y-4"
              id="node-detail-overview"
              role="tabpanel"
            >
              <NodeDetailOverview
                history={chartData}
                metric={
                  detailNode?.connectionStatus === "online"
                    ? detailRealtimeMetric
                    : null
                }
              />

              <div className="grid items-start gap-4 xl:grid-cols-2">
                <NodeMetricsChartCard
                  activeMetricType={activeMetricType}
                  data={chartData}
                  error={metricsError}
                  loading={metricsLoading}
                  maxRows={METRICS_MAX_ROWS}
                  nodeId={selectedNodeId}
                  rangeMs={metricsRangeMs}
                  truncated={metricsTruncated}
                  onMetricTypeChange={setActiveMetricType}
                  onRangeChange={setMetricsRangeMs}
                  onRefresh={loadMetrics}
                />
                <NodeMetricsChartCard
                  activeMetricType="network"
                  data={chartData}
                  error={metricsError}
                  loading={metricsLoading}
                  maxRows={METRICS_MAX_ROWS}
                  nodeId={selectedNodeId}
                  rangeMs={metricsRangeMs}
                  showMetricSelector={false}
                  title="带宽监控"
                  truncated={metricsTruncated}
                  onMetricTypeChange={setActiveMetricType}
                  onRangeChange={setMetricsRangeMs}
                  onRefresh={loadMetrics}
                />
              </div>

              <NodeTrafficStatistics key={detailNodeId} nodeId={detailNodeId} />

              {/* Service monitors chart – same style as node metrics */}
              {(() => {
                // Resolve which monitor is active
                const resolvedActiveMonitor =
                  detailServiceMonitors.find(
                    (m) => m.id === activeServiceMonitorId,
                  ) ||
                  detailServiceMonitors[0] ||
                  null;
                const resolvedActiveMonitorId =
                  resolvedActiveMonitor?.id ?? null;
                const activeLatestResult =
                  resolvedActiveMonitorId != null
                    ? getLatestResult(resolvedActiveMonitorId)
                    : null;
                const activeStale = resolvedActiveMonitor
                  ? isResultStale(resolvedActiveMonitor, activeLatestResult)
                  : false;
                const activeResults =
                  resolvedActiveMonitorId != null
                    ? monitorResults[resolvedActiveMonitorId] || []
                    : [];
                const activeLatencyData = [...activeResults].map((r) => ({
                  time: formatTimestamp(r.timestamp, serviceMonitorRangeMs),
                  latency: r.success === 1 ? r.latencyMs : null,
                  success: r.success,
                }));

                return (
                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold">服务监控图表</h3>
                      <div className="flex items-center gap-2">
                        <Select
                          className="w-28"
                          selectedKeys={[String(serviceMonitorRangeMs)]}
                          onSelectionChange={(keys) => {
                            const v = Number(Array.from(keys)[0]);

                            if (v > 0) setServiceMonitorRangeMs(v);
                          }}
                        >
                          <SelectItem key={String(60 * 60 * 1000)}>
                            1小时
                          </SelectItem>
                          <SelectItem key={String(6 * 60 * 60 * 1000)}>
                            6小时
                          </SelectItem>
                          <SelectItem key={String(24 * 60 * 60 * 1000)}>
                            24小时
                          </SelectItem>
                        </Select>
                        {resolvedActiveMonitorId != null && (
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => {
                              void loadMonitorResults(resolvedActiveMonitorId, {
                                rangeMs: serviceMonitorRangeMs,
                              });
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            刷新
                          </Button>
                        )}
                        <Button
                          color="primary"
                          size="sm"
                          variant="flat"
                          onPress={() => handleOpenEditModal()}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          添加监控
                        </Button>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      {monitorsLoading ? (
                        <div className="flex justify-center py-8">
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                      ) : detailServiceMonitors.length > 0 ? (
                        <>
                          {/* Monitor switcher buttons – like metric type tabs */}
                          <div className="flex flex-wrap gap-2">
                            {detailServiceMonitors.map((monitor) => {
                              const lr = getLatestResult(monitor.id);
                              const isActive =
                                monitor.id === resolvedActiveMonitorId;

                              return (
                                <Button
                                  key={monitor.id}
                                  color={isActive ? "primary" : "default"}
                                  size="sm"
                                  variant={isActive ? "solid" : "flat"}
                                  onPress={() => {
                                    setActiveServiceMonitorId(monitor.id);
                                    // Load results for this monitor if not loaded
                                    if (
                                      !monitorResults[monitor.id] ||
                                      monitorResults[monitor.id].length <= 1
                                    ) {
                                      void loadMonitorResults(monitor.id, {
                                        rangeMs: serviceMonitorRangeMs,
                                      });
                                    }
                                  }}
                                >
                                  <div
                                    className={`w-2 h-2 rounded-full shrink-0 mr-1 ${
                                      monitor.enabled !== 1
                                        ? "bg-default-300"
                                        : !lr
                                          ? "bg-default-400"
                                          : lr.success === 1
                                            ? isActive
                                              ? "bg-white"
                                              : "bg-success"
                                            : isActive
                                              ? "bg-white"
                                              : "bg-danger"
                                    }`}
                                  />
                                  {monitor.name}
                                </Button>
                              );
                            })}
                          </div>

                          {/* Active monitor info bar */}
                          {resolvedActiveMonitor && (
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-default-50 px-3 py-2">
                              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                                <Chip color="primary" size="sm" variant="flat">
                                  {resolvedActiveMonitor.type.toUpperCase()}
                                </Chip>
                                <span className="font-mono text-xs text-default-500">
                                  {resolvedActiveMonitor.target}
                                </span>
                                <span className="text-xs text-default-500">
                                  每秒测试，30秒上报
                                </span>
                                {activeLatestResult &&
                                Number.isFinite(
                                  activeLatestResult.latencyMs,
                                ) ? (
                                  <span className="font-mono text-xs font-semibold text-success">
                                    {activeLatestResult.latencyMs.toFixed(0)}ms
                                  </span>
                                ) : null}
                                {activeStale ? (
                                  <Chip
                                    color="warning"
                                    size="sm"
                                    variant="flat"
                                  >
                                    陈旧
                                  </Chip>
                                ) : null}
                                {resolvedActiveMonitor.enabled !== 1 ? (
                                  <Chip
                                    color="default"
                                    size="sm"
                                    variant="flat"
                                  >
                                    已禁用
                                  </Chip>
                                ) : null}
                              </div>
                              <Dropdown>
                                <DropdownTrigger>
                                  <Button
                                    className="shrink-0"
                                    size="sm"
                                    startContent={
                                      <MoreHorizontal className="h-4 w-4" />
                                    }
                                    variant="flat"
                                  >
                                    操作
                                  </Button>
                                </DropdownTrigger>
                                <DropdownMenu>
                                  <DropdownItem
                                    startContent={<Play className="w-4 h-4" />}
                                    onPress={() =>
                                      resolvedActiveMonitorId != null &&
                                      handleRunMonitor(resolvedActiveMonitorId)
                                    }
                                  >
                                    立即检查
                                  </DropdownItem>
                                  <DropdownItem
                                    startContent={
                                      <Activity className="w-4 h-4" />
                                    }
                                    onPress={() =>
                                      resolvedActiveMonitorId != null &&
                                      openResultsModal(resolvedActiveMonitorId)
                                    }
                                  >
                                    查看记录
                                  </DropdownItem>
                                  <DropdownItem
                                    startContent={<Edit className="w-4 h-4" />}
                                    onPress={() =>
                                      resolvedActiveMonitor &&
                                      handleOpenEditModal(resolvedActiveMonitor)
                                    }
                                  >
                                    编辑
                                  </DropdownItem>
                                  <DropdownItem
                                    className="text-danger"
                                    color="danger"
                                    startContent={
                                      <Trash2 className="w-4 h-4" />
                                    }
                                    onPress={() =>
                                      resolvedActiveMonitorId != null &&
                                      handleDeleteMonitor(
                                        resolvedActiveMonitorId,
                                      )
                                    }
                                  >
                                    删除
                                  </DropdownItem>
                                </DropdownMenu>
                              </Dropdown>
                            </div>
                          )}

                          {/* Chart area – same h-64 as node metrics */}
                          {activeLatencyData.length > 0 ? (
                            <div className="h-64">
                              <ResponsiveContainer
                                height="100%"
                                initialDimension={{ width: 400, height: 256 }}
                                minWidth={0}
                                width="100%"
                              >
                                <LineChart data={activeLatencyData}>
                                  <CartesianGrid
                                    stroke="var(--divider)"
                                    vertical={false}
                                  />
                                  <XAxis
                                    axisLine={false}
                                    dataKey="time"
                                    fontSize={10}
                                    minTickGap={30}
                                    stroke="var(--default-500)"
                                    tickLine={false}
                                  />
                                  <YAxis
                                    fontSize={12}
                                    tickFormatter={(v: number) =>
                                      `${Math.round(v)}ms`
                                    }
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: "rgba(0,0,0,0.8)",
                                      border: "none",
                                      borderRadius: "8px",
                                    }}
                                    formatter={(value: unknown) => [
                                      `${Number(value).toFixed(0)}ms`,
                                      "延迟",
                                    ]}
                                    labelStyle={{ color: "var(--foreground)" }}
                                  />
                                  <Line
                                    connectNulls={false}
                                    dataKey="latency"
                                    dot={false}
                                    name="延迟"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    type="monotone"
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-default-500">
                              暂无检查记录
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-8 text-default-500">
                          暂无服务监控，点击&quot;添加监控&quot;创建
                        </div>
                      )}
                    </CardBody>
                  </Card>
                );
              })()}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={resultsModalOpen}
        scrollBehavior="inside"
        size="xl"
        onClose={() => {
          setResultsModalOpen(false);
          setResultsMonitorId(null);
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">
                监控记录
                {resultsMonitor?.name ? ` - ${resultsMonitor.name}` : ""}
              </div>
              {resultsMonitor?.nodeId && resultsMonitor.nodeId > 0 ? (
                <div className="text-xs text-default-500 truncate">
                  节点:{" "}
                  {nodeMap.get(resultsMonitor.nodeId)?.name ||
                    resultsMonitor.nodeId}
                </div>
              ) : (
                <div className="text-xs text-default-500 truncate">
                  面板执行
                </div>
              )}

              {modalResults.length > 0 ? (
                <div className="text-xs text-default-500 truncate">
                  最新检查:{" "}
                  <span className="font-mono">
                    {formatDateTime(modalResults[0].timestamp)}
                  </span>
                </div>
              ) : null}
            </div>
            {resultsMonitorId != null ? (
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  className="w-28"
                  selectedKeys={[String(resultsLimit)]}
                  onSelectionChange={(keys) => {
                    const v = Number(Array.from(keys)[0]);

                    if (v > 0) setResultsLimit(v);
                  }}
                >
                  <SelectItem key="20">20条</SelectItem>
                  <SelectItem key="50">50条</SelectItem>
                  <SelectItem key="100">100条</SelectItem>
                  <SelectItem key="200">200条</SelectItem>
                </Select>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() =>
                    resultsMonitorId != null &&
                    handleRunMonitor(resultsMonitorId)
                  }
                >
                  <Play className="w-4 h-4 mr-1" />
                  检查
                </Button>
                <Button
                  isLoading={resultsLoading}
                  size="sm"
                  variant="flat"
                  onPress={() => void loadResultsForModal()}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  刷新
                </Button>
              </div>
            ) : null}
          </ModalHeader>
          <ModalBody>
            {resultsLoading ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            ) : modalResults.length > 0 ? (
              <div className="divide-y divide-divider">
                {modalResults.map((r) => (
                  <div key={r.id} className="py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${r.success === 1 ? "bg-success" : "bg-danger"}`}
                        title={r.success === 1 ? "成功" : "失败"}
                      />
                      <span className="font-mono text-xs text-default-600">
                        {formatDateTime(r.timestamp)}
                      </span>
                      <span className="ml-auto font-mono text-xs">
                        {Number.isFinite(r.latencyMs)
                          ? `${r.latencyMs.toFixed(0)}ms`
                          : "-"}
                      </span>
                      <span
                        className={`w-8 text-right text-xs ${r.success === 1 ? "text-default-500" : "text-danger"}`}
                      >
                        {r.success === 1 ? "成功" : "失败"}
                      </span>
                    </div>
                    {r.errorMessage && (
                      <div className="mt-0.5 break-all pl-4 text-xs text-danger">
                        {r.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-default-500">
                暂无监控记录
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => {
                setResultsModalOpen(false);
                setResultsMonitorId(null);
              }}
            >
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)}>
        <ModalContent>
          <ModalHeader>{editingMonitor ? "编辑监控" : "添加监控"}</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="名称"
              placeholder="例如: Google DNS"
              value={monitorForm.name}
              onChange={(e) =>
                setMonitorForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <Select
              label="类型"
              selectedKeys={[monitorForm.type]}
              onSelectionChange={(keys) => {
                const nextType = Array.from(keys)[0] as "tcp" | "icmp";

                setMonitorForm((f) => {
                  let nextNodeId = f.nodeId;

                  if (nextType === "icmp" && (!nextNodeId || nextNodeId <= 0)) {
                    nextNodeId = onlineNodes.length > 0 ? onlineNodes[0].id : 0;
                  }

                  return {
                    ...f,
                    type: nextType,
                    nodeId: nextNodeId,
                  };
                });
              }}
            >
              <SelectItem key="tcp">TCP</SelectItem>
              <SelectItem key="icmp">ICMP Ping</SelectItem>
            </Select>
            <Input
              label="目标"
              placeholder={
                monitorForm.type === "icmp"
                  ? "例如: 8.8.8.8 或 1.1.1.1"
                  : "例如: 8.8.8.8:53"
              }
              value={monitorForm.target}
              onChange={(e) =>
                setMonitorForm((f) => ({ ...f, target: e.target.value }))
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                description={`最小 ${resolvedServiceMonitorLimits.minIntervalSec}s（扫描周期 ${resolvedServiceMonitorLimits.checkerScanIntervalSec}s）`}
                errorMessage={
                  monitorForm.intervalSec <
                  resolvedServiceMonitorLimits.minIntervalSec
                    ? `不能小于 ${resolvedServiceMonitorLimits.minIntervalSec}s`
                    : undefined
                }
                isInvalid={
                  monitorForm.intervalSec <
                  resolvedServiceMonitorLimits.minIntervalSec
                }
                label="检查间隔(秒)"
                type="number"
                value={String(monitorForm.intervalSec)}
                onChange={(e) =>
                  setMonitorForm((f) => ({
                    ...f,
                    intervalSec:
                      Number(e.target.value) ||
                      resolvedServiceMonitorLimits.defaultIntervalSec,
                  }))
                }
              />
              <Input
                description={`范围 ${resolvedServiceMonitorLimits.minTimeoutSec}-${resolvedServiceMonitorLimits.maxTimeoutSec}s`}
                errorMessage={
                  monitorForm.timeoutSec <
                    resolvedServiceMonitorLimits.minTimeoutSec ||
                  monitorForm.timeoutSec >
                    resolvedServiceMonitorLimits.maxTimeoutSec
                    ? `需在 ${resolvedServiceMonitorLimits.minTimeoutSec}-${resolvedServiceMonitorLimits.maxTimeoutSec}s 范围内`
                    : undefined
                }
                isInvalid={
                  monitorForm.timeoutSec <
                    resolvedServiceMonitorLimits.minTimeoutSec ||
                  monitorForm.timeoutSec >
                    resolvedServiceMonitorLimits.maxTimeoutSec
                }
                label="超时时间(秒)"
                type="number"
                value={String(monitorForm.timeoutSec)}
                onChange={(e) =>
                  setMonitorForm((f) => ({
                    ...f,
                    timeoutSec:
                      Number(e.target.value) ||
                      resolvedServiceMonitorLimits.defaultTimeoutSec,
                  }))
                }
              />
            </div>
            <Select
              label="执行节点"
              selectedKeys={
                monitorForm.type === "icmp"
                  ? monitorForm.nodeId
                    ? [String(monitorForm.nodeId)]
                    : []
                  : monitorForm.nodeId
                    ? [String(monitorForm.nodeId)]
                    : ["0"]
              }
              onSelectionChange={(keys) =>
                setMonitorForm((f) => ({
                  ...f,
                  nodeId: Number(Array.from(keys)[0]),
                }))
              }
            >
              {monitorForm.type !== "icmp" && (
                <SelectItem key="0">面板执行</SelectItem>
              )}
              {onlineNodes.map((node) => (
                <SelectItem key={String(node.id)}>{node.name}</SelectItem>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                isSelected={monitorForm.enabled}
                onValueChange={(v) =>
                  setMonitorForm((f) => ({ ...f, enabled: v }))
                }
              />
              <span className="text-sm">启用</span>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditModalOpen(false)}>
              取消
            </Button>
            <Button
              color="primary"
              isLoading={submitLoading}
              onPress={handleSubmitMonitor}
            >
              {editingMonitor ? "更新" : "创建"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
