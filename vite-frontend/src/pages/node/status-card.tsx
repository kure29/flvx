import type { ReactNode } from "react";
import type { Node, RemoteUsageNode } from "./types";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarClock,
  Clock3,
  Cpu,
  Database,
  Globe2,
  MoreHorizontal,
  Network,
  Server,
} from "lucide-react";

import { getNodeExpiryMeta } from "./helpers";
import { formatNodeRenewalTime } from "./renewal";
import { NodeLiveStats } from "./node-live-stats";
import { getRemoteSyncErrorMessage } from "./display";

import { Card } from "@/shadcn-bridge/heroui/card";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/shadcn-bridge/heroui/dropdown";
import {
  DistroIcon,
  getDistroColor,
  parseDistroFromVersion,
} from "@/components/distro-icon";
import { formatTraffic } from "@/utils/traffic";

export interface NodeCardAction {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function uptimeLabel(seconds?: number) {
  if (seconds === undefined) return "—";
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}天`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}小时`;

  return `${Math.floor(seconds / 60)}分钟`;
}

export function NodeStatusCard({
  node,
  month,
  usage,
  latency,
  actions,
  dragHandle,
  selectMode,
  selected,
  onSelect,
  onOpen,
  progress,
}: {
  node: Node;
  month?: [number, number];
  usage?: RemoteUsageNode;
  latency?: ReactNode;
  actions: NodeCardAction[];
  dragHandle: ReactNode;
  selectMode: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  progress?: ReactNode;
}) {
  const online = node.connectionStatus === "online";
  const remote = node.isRemote === 1;
  const info = online ? (node.systemInfo ?? null) : null;
  const distro = parseDistroFromVersion(node.version);
  const expiry = getNodeExpiryMeta(node.expiryTime, node.renewalCycle);
  const expiryAlert = !node.expiryReminderDismissed && expiry.isHighlighted;
  const dual = Boolean(node.serverIpV4?.trim() && node.serverIpV6?.trim());

  return (
    <Card
      className={`group h-full overflow-hidden hover:border-default-300 ${selected ? "ring-2 ring-primary" : ""} ${expiryAlert ? (expiry.tone === "danger" ? "border-danger/50" : "border-warning/50") : ""}`}
      data-node-card="true"
    >
      <div className="flex items-center gap-2 border-b border-divider px-4 py-3.5">
        {selectMode ? (
          <Checkbox
            aria-label={`选择 ${node.name}`}
            isSelected={selected}
            onValueChange={onSelect}
          />
        ) : remote ? (
          <Globe2 className="h-4 w-4 shrink-0 text-default-400" />
        ) : (
          <DistroIcon
            className="h-5 w-5 shrink-0"
            distro={distro}
            style={{ color: getDistroColor(distro) }}
          />
        )}
        <button
          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={`查看 ${node.name} 详情`}
          type="button"
          onClick={selectMode ? onSelect : onOpen}
        >
          <span className="truncate">{node.name}</span>
          <ArrowUpRight className="h-3 w-3 shrink-0 text-default-400" />
        </button>
        {!remote && (
          <span
            className={`shrink-0 rounded border px-1 text-[10px] leading-4 ${dual ? "border-secondary/30 bg-secondary/10 text-secondary" : "border-primary/30 bg-primary/10 text-primary"}`}
          >
            {dual
              ? "双栈"
              : node.serverIpV6?.trim()
                ? "IPv6"
                : node.serverIpV4?.trim() || /^[\d.]+$/.test(node.serverIp)
                  ? "IPv4"
                  : "主机"}
          </span>
        )}
        <span
          aria-label={online ? "在线" : "离线"}
          className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-success" : "bg-danger"}`}
          title={online ? "在线" : "离线"}
        />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {dragHandle}
          {!selectMode && (
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Button
                  isIconOnly
                  aria-label={`${node.name} 操作`}
                  className="h-7 w-7 min-w-7 text-default-400"
                  size="sm"
                  variant="light"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="节点操作" className="w-48">
                <DropdownMenuLabel className="truncate text-xs text-default-500">
                  {node.name}
                </DropdownMenuLabel>
                {actions.map((action) => (
                  <div key={action.key}>
                    {action.danger && <DropdownMenuSeparator />}
                    <DropdownItem
                      closeOnSelect
                      color={action.danger ? "danger" : "default"}
                      isDisabled={action.disabled}
                      startContent={action.icon}
                      onPress={action.onPress}
                    >
                      {action.label}
                    </DropdownItem>
                  </div>
                ))}
              </DropdownMenu>
            </Dropdown>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {remote ? (
          <>
            {node.syncError && (
              <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning">
                {getRemoteSyncErrorMessage(node.syncError)}
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 text-xs">
              {[
                ["已用流量", usage ? formatTraffic(usage.currentFlow) : "—"],
                [
                  "流量额度",
                  usage
                    ? usage.maxBandwidth > 0
                      ? formatTraffic(usage.maxBandwidth)
                      : "不限"
                    : "—",
                ],
                [
                  "占用端口",
                  usage
                    ? `${usage.usedPorts.length} / ${Math.max(0, usage.portRangeEnd - usage.portRangeStart + 1)}`
                    : "—",
                ],
                ["绑定数量", usage ? `${usage.activeBindingNum} 条` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="space-y-1.5">
                  <div className="text-default-500">{label}</div>
                  <div className="font-mono text-base font-semibold">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <p className="break-all text-xs text-default-500">
              {usage?.remoteUrl || node.remoteUrl || node.serverIp}
            </p>
          </>
        ) : (
          <>
            <NodeLiveStats info={info} month={month} />
            <div className="flex items-center justify-between gap-2 border-t border-divider pt-3 text-[11px] text-default-500">
              <span
                className="truncate font-mono"
                title={[node.serverIpV4, node.serverIpV6]
                  .filter(Boolean)
                  .join(" / ")}
              >
                {node.serverIpV4 ||
                  node.serverIpV6 ||
                  node.serverIp ||
                  "等待连接"}
              </span>
              <span className="shrink-0">
                {node.forwardMode === "nftables" ? "nftables" : "agent"} ·{" "}
                {node.version?.split(" ")[0] || "未安装"}
              </span>
            </div>
            {progress}
            {latency && (
              <div className="border-t border-divider pt-3">{latency}</div>
            )}
          </>
        )}
        <div className="mt-auto space-y-3">
          <div className="flex items-center justify-between gap-2 border-t border-divider pt-3 text-xs text-default-500">
            <span
              className="flex min-w-0 items-center gap-1.5"
              title={formatNodeRenewalTime(expiry.nextDueTime)}
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span>续费</span>
              <span
                className={`truncate font-medium ${expiryAlert ? (expiry.tone === "danger" ? "text-danger" : "text-warning") : "text-foreground"}`}
              >
                {expiry.nextDueTime ? expiry.label : "未设置"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {online ? `在线 ${uptimeLabel(info?.uptime)}` : "离线"}
            </span>
          </div>
          {node.remark?.trim() && (
            <p
              className="truncate border-t border-dashed border-divider pt-2.5 text-xs text-default-500"
              title={node.remark.trim()}
            >
              {node.remark.trim()}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function NodeOverview({
  nodes,
  monthTraffic,
}: {
  nodes: Node[];
  monthTraffic: Record<string, [number, number]>;
}) {
  const online = nodes.filter((node) => node.connectionStatus === "online");
  const metrics = online.flatMap((node) =>
    node.systemInfo ? [node.systemInfo] : [],
  );
  const average = (key: "cpuUsage" | "memoryUsage") =>
    metrics.length
      ? `${(metrics.reduce((sum, info) => sum + info[key], 0) / metrics.length).toFixed(1)}%`
      : "—";
  const speed = (key: "netInSpeed" | "netOutSpeed") =>
    metrics.length
      ? `${formatTraffic(metrics.reduce((sum, info) => sum + (info[key] ?? (key === "netInSpeed" ? info.downloadSpeed : info.uploadSpeed)), 0))}/s`
      : "—";
  const traffic = nodes.reduce((sum, node) => {
    const month = monthTraffic[String(node.id)];

    return sum + (month ? month[0] + month[1] : 0);
  }, 0);

  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-2">
      <Card className="gap-4 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Server className="h-4 w-4 text-default-400" />
          节点情况
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-normal text-default-500">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            自动更新
          </span>
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["总节点", nodes.length, "text-foreground"],
            ["在线节点", online.length, "text-success"],
            ["离线节点", nodes.length - online.length, "text-danger"],
          ].map(([label, value, tone]) => (
            <div
              key={label}
              className="rounded-lg bg-default-50 py-3 text-center"
            >
              <div className={`font-mono text-2xl font-semibold ${tone}`}>
                {value}
              </div>
              <div className="mt-1 text-xs text-default-500">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-divider pt-3 text-xs text-default-500">
          <Cpu className="h-3.5 w-3.5" />
          平均负载
          <span className="text-foreground">CPU {average("cpuUsage")}</span>
          <span>·</span>
          <span className="text-foreground">内存 {average("memoryUsage")}</span>
        </div>
      </Card>
      <Card className="gap-4 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Network className="h-4 w-4 text-default-400" />
          网络情况
        </h2>
        <div className="grid flex-1 grid-cols-2 gap-3">
          {[
            ["下行速度", speed("netInSpeed"), ArrowDown, "text-success"],
            ["上行速度", speed("netOutSpeed"), ArrowUp, "text-default-500"],
          ].map(([label, value, Icon, tone]) => {
            const RateIcon = Icon as typeof ArrowDown;

            return (
              <div
                key={String(label)}
                className="flex flex-col justify-center gap-2 rounded-lg bg-default-50 px-4 py-3"
              >
                <div className="flex items-center gap-2 text-xs text-default-500">
                  <RateIcon className={`h-4 w-4 ${tone}`} />
                  {String(label)}
                </div>
                <div className="font-mono text-xl font-semibold tabular-nums">
                  {String(value)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-divider pt-3 text-xs text-default-500">
          <Database className="h-3.5 w-3.5" />
          本月累计流量
          <span className="font-mono font-semibold text-foreground">
            {Object.keys(monthTraffic).length ? formatTraffic(traffic) : "—"}
          </span>
          <span className="ml-auto">上行 + 下行</span>
        </div>
      </Card>
    </div>
  );
}
