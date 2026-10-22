import type { NodeSystemInfo } from "@/pages/node/system-info";

import {
  ArrowDown,
  ArrowUp,
  Cpu,
  MemoryStick,
  HardDrive,
  ChartPie,
} from "lucide-react";

function bytes(v: number): string {
  const units = ["B", "K", "M", "G", "T", "P"];
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

/** Live resources and traffic on the node's full-size card. */
export function NodeLiveStats({
  info,
  month,
}: {
  info: NodeSystemInfo | null;
  /** This month's [in, out] bytes. */
  month?: [number, number];
}) {
  const up = info ? (info.netOutSpeed ?? info.uploadSpeed) : undefined;
  const down = info ? (info.netInSpeed ?? info.downloadSpeed) : undefined;
  const rate = (v?: number) => (v === undefined ? "—" : `${bytes(v)}/s`);
  const total = month ? bytes(month[0] + month[1]) : "—";
  const split = month ? `↑${bytes(month[1])} ↓${bytes(month[0])}` : "";

  const items = [
    {
      label: "CPU",
      value: info?.cpuUsage,
      icon: Cpu,
      color: "var(--chart-cpu)",
    },
    {
      label: "内存",
      value: info?.memoryUsage,
      icon: MemoryStick,
      color: "var(--chart-memory)",
    },
    {
      label: "磁盘",
      value: info?.diskUsage,
      icon: HardDrive,
      color: "var(--chart-download)",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        {items.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-default-500">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
              <span className="font-mono font-medium">
                {value === undefined ? "—" : `${value.toFixed(1)}%`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-default-100">
              {value !== undefined && (
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, value))}%`,
                    backgroundColor: value >= 90 ? "var(--danger)" : color,
                  }}
                />
              )}
            </div>
          </div>
        ))}
        <div className="min-w-0 space-y-2" title={split}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex shrink-0 items-center gap-1.5 text-default-500">
              <ChartPie className="h-3.5 w-3.5" />
              本月
            </span>
            <span className="truncate font-mono font-medium">{total}</span>
          </div>
          <div className="truncate text-[10px] text-default-400">
            {split || "等待流量数据"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-0.5 text-xs tabular-nums">
        {[
          {
            label: "下行",
            icon: ArrowDown,
            value: down,
            traffic: info?.downloadTraffic,
            color: "text-success",
          },
          {
            label: "上行",
            icon: ArrowUp,
            value: up,
            traffic: info?.uploadTraffic,
            color: "text-default-500",
          },
        ].map(({ label, icon: Icon, value, traffic, color }) => (
          <div key={label} className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Icon aria-label={label} className={`h-4 w-4 ${color}`} />
              <span
                className={`truncate font-mono text-sm font-semibold ${color}`}
              >
                {rate(value)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-default-500">
              <span>开机以来</span>
              <span className="font-mono">
                {traffic === undefined ? "—" : bytes(traffic)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
