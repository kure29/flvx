import {
  Area,
  AreaChart,
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
} from "lucide-react";

import { Card } from "@/shadcn-bridge/heroui/card";
import { formatTraffic } from "@/utils/traffic";

interface ResourceMetric {
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
}

export function NodeDetailOverview({
  metric,
  history,
}: {
  metric: ResourceMetric | null;
  history: Array<Record<string, unknown>>;
}) {
  const resources = [
    {
      label: "处理器",
      short: "CPU",
      key: "cpu",
      icon: Cpu,
      value: metric?.cpuUsage,
      color: "var(--chart-cpu)",
      note: metric
        ? `Load ${metric.load1.toFixed(2)} / ${metric.load5.toFixed(2)} / ${metric.load15.toFixed(2)}`
        : "等待资源数据",
    },
    {
      label: "内存",
      short: "RAM",
      key: "memory",
      icon: MemoryStick,
      value: metric?.memoryUsage,
      color: "var(--chart-memory)",
      note: metric
        ? `可用 ${(100 - metric.memoryUsage).toFixed(1)}%`
        : "等待资源数据",
    },
    {
      label: "硬盘",
      short: "DISK",
      key: "disk",
      icon: HardDrive,
      value: metric?.diskUsage,
      color: "var(--chart-disk)",
      note: metric
        ? `剩余 ${(100 - metric.diskUsage).toFixed(1)}%`
        : "等待资源数据",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {resources.map(
        ({ label, short, key, icon: Icon, value, color, note }) => (
          <Card key={key} className="min-w-0 gap-5 p-5">
            <h3 className="flex items-center gap-2.5 text-sm font-semibold">
              <span className="rounded-lg bg-default-100 p-2" style={{ color }}>
                <Icon className="h-4 w-4" />
              </span>
              {label}
              <span className="ml-auto text-[11px] font-normal text-default-500">
                使用率
              </span>
            </h3>
            <div className="flex min-h-24 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-3xl font-semibold">
                  {value === undefined ? "—" : value.toFixed(1)}
                  {value !== undefined && (
                    <span className="ml-1 text-sm text-default-500">%</span>
                  )}
                </div>
                <div
                  className="mt-2 truncate text-[11px] text-default-500"
                  title={note}
                >
                  {note}
                </div>
              </div>
              <div
                aria-label={`${label}使用率 ${value === undefined ? "暂无数据" : `${value.toFixed(1)}%`}`}
                className="relative h-24 w-24 shrink-0"
              >
                <ResponsiveContainer
                  height="100%"
                  initialDimension={{ width: 96, height: 96 }}
                  minWidth={0}
                  width="100%"
                >
                  <RadialBarChart
                    barSize={7}
                    data={[
                      {
                        value: Math.min(100, Math.max(0, value ?? 0)),
                        fill: color,
                      },
                    ]}
                    endAngle={-270}
                    innerRadius="78%"
                    outerRadius="100%"
                    startAngle={90}
                  >
                    <PolarAngleAxis
                      domain={[0, 100]}
                      tick={false}
                      type="number"
                    />
                    <RadialBar
                      background={{ fill: "var(--default-100)" }}
                      cornerRadius={8}
                      dataKey="value"
                      isAnimationActive={false}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-default-500">
                  {short}
                </span>
              </div>
            </div>
            <div className="space-y-3 border-t border-divider pt-3">
              <div className="text-[11px] text-default-500">所选时段趋势</div>
              <div aria-label={`${label}使用率趋势`} className="h-7">
                {history.length ? (
                  <ResponsiveContainer
                    height="100%"
                    initialDimension={{ width: 200, height: 28 }}
                    minWidth={0}
                    width="100%"
                  >
                    <AreaChart data={history}>
                      <Area
                        dataKey={key}
                        fill={color}
                        fillOpacity={0.07}
                        isAnimationActive={false}
                        stroke={color}
                        strokeWidth={1.5}
                        type="monotone"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-default-400">暂无历史数据</p>
                )}
              </div>
            </div>
          </Card>
        ),
      )}
      <Card className="min-w-0 gap-5 p-5">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="rounded-lg bg-success/10 p-2 text-success">
            <Network className="h-4 w-4" />
          </span>
          网络流量
        </h3>
        <div className="space-y-2">
          {[
            {
              label: "下行",
              icon: ArrowDown,
              value: metric?.netInSpeed,
              color: "text-success",
              bg: "bg-success/10",
            },
            {
              label: "上行",
              icon: ArrowUp,
              value: metric?.netOutSpeed,
              color: "text-default-500",
              bg: "bg-default-100",
            },
          ].map(({ label, icon: Icon, value, color, bg }) => (
            <div
              key={label}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${bg}`}
            >
              <span className={`flex items-center gap-1.5 text-xs ${color}`}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
              <span className="font-mono text-sm font-semibold">
                {value === undefined ? "—" : `${formatTraffic(value)}/s`}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-auto space-y-2 border-t border-divider pt-3 text-[11px] text-default-500">
          <div className="flex flex-col gap-1">
            <span>开机以来接收 / 发送</span>
            <span className="font-mono text-foreground">
              {metric
                ? `${formatTraffic(metric.netInBytes)} / ${formatTraffic(metric.netOutBytes)}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>连接数量</span>
            <span className="font-mono text-foreground">
              TCP {metric?.tcpConns ?? "—"} · UDP {metric?.udpConns ?? "—"}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
