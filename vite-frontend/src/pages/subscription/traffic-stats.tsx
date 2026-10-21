import type { SubTraffic, SubTrafficRange } from "@/api";

import { useEffect, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getMySubscriptionTraffic, getSubscriptionTraffic } from "@/api";
import { Segmented } from "@/pages/subscription/controls";

const DOWN = "#2563eb";
const UP = "#ea580c";

const RANGES: Array<[SubTrafficRange, string]> = [
  ["hour", "小时"],
  ["day", "日"],
  ["month", "月"],
];

const RANGE_HINT: Record<SubTrafficRange, string> = {
  hour: "近 24 小时",
  day: "近 30 天",
  month: "近 12 个月",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** A bucket's axis, list row and tooltip labels. */
function bucketLabel(
  range: SubTrafficRange,
  ms: number,
): [string, string, string] {
  const d = new Date(ms);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const hm = `${pad(d.getHours())}:00`;

  if (range === "hour") return [hm, `${md} ${hm}`, `${md} ${hm}`];
  if (range === "day") return [md, md, `${d.getFullYear()}/${md}`];

  return [
    d.getMonth() === 0 ? `${d.getFullYear()}/1月` : `${d.getMonth() + 1}月`,
    `${d.getFullYear()}/${d.getMonth() + 1}`,
    `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`,
  ];
}

/** Compact sizes that fit a tile: 3.3 GB, 267 MB. */
function bytes(v: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Short axis numbers: 1.2G, 340M. */
function axisBytes(v: number): string {
  if (!v) return "0";
  const units = ["B", "K", "M", "G", "T"];
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

/**
 * A subscription's traffic by hour, day or month: totals, an up / down
 * line chart and the per-bucket list. mine reads one of the logged-in
 * user's own subscriptions.
 */
export function SubTrafficStats({ id, mine }: { id: number; mine?: boolean }) {
  const [range, setRange] = useState<SubTrafficRange>("hour");
  const [data, setData] = useState<SubTraffic | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    let active = true;

    setError("");
    (mine ? getMySubscriptionTraffic : getSubscriptionTraffic)(id, range)
      .then((res) => {
        if (!active) return;
        if (res.code === 0 && res.data) setData(res.data);
        else setError(res.msg || "加载失败");
      })
      .catch(() => active && setError("加载失败"));

    return () => {
      active = false;
    };
  }, [id, range, mine]);

  const shown = data?.range === range ? data : null;
  const points = (shown?.points ?? []).map((p) => {
    const [label, row, long] = bucketLabel(range, p.time);

    return { ...p, label, row, long };
  });
  const empty = shown !== null && shown.up + shown.down === 0;
  const rows = [...points].reverse();
  const maxTotal = Math.max(1, ...points.map((p) => p.up + p.down));

  return (
    <div className="space-y-3">
      <Segmented
        options={RANGES}
        value={range}
        onChange={(r) => {
          setRange(r);
          setAll(false);
        }}
      />
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["下载", shown?.down, DOWN],
            ["上传", shown?.up, UP],
            ["合计", shown ? shown.up + shown.down : undefined, ""],
          ] as Array<[string, number | undefined, string]>
        ).map(([label, value, color]) => (
          <div key={label} className="rounded-xl bg-default-100 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-default-500">
              {color && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: color }}
                />
              )}
              {label}
            </div>
            <div className="mt-0.5 truncate font-mono text-sm font-semibold">
              {value === undefined ? "…" : bytes(value)}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-danger">{error}</p>
      ) : !shown ? (
        <p className="py-8 text-center text-sm text-default-400">正在加载…</p>
      ) : (
        <>
          <div className="relative h-52 w-full sm:h-64">
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart
                data={points}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tick={{ fill: "currentColor", opacity: 0.55, fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: "currentColor", opacity: 0.55, fontSize: 11 }}
                  tickFormatter={(v: number) => axisBytes(v)}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  content={({
                    active,
                    payload,
                  }: {
                    active?: boolean;
                    payload?: Array<{ payload?: (typeof points)[number] }>;
                  }) => {
                    const p = payload?.[0]?.payload;

                    if (!active || !p) return null;

                    return (
                      <div className="rounded-xl border border-divider bg-content1 px-3 py-2 text-xs shadow-lg">
                        <p className="font-medium">{p.long}</p>
                        <p className="mt-1" style={{ color: DOWN }}>
                          下载 {bytes(p.down)}
                        </p>
                        <p style={{ color: UP }}>上传 {bytes(p.up)}</p>
                      </div>
                    );
                  }}
                  cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
                />
                <Area
                  dataKey="down"
                  fill={DOWN}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  name="下载"
                  stroke={DOWN}
                  strokeWidth={2}
                  type="monotone"
                />
                <Line
                  dataKey="up"
                  dot={false}
                  isAnimationActive={false}
                  name="上传"
                  stroke={UP}
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
            {empty && (
              <p className="absolute inset-0 flex items-center justify-center text-center text-xs text-default-400">
                {RANGE_HINT[range]}还没有流量
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-default-500">
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2" style={{ borderColor: DOWN }} />
              下载
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-4 border-t-2 border-dashed"
                style={{ borderColor: UP }}
              />
              上传
            </span>
            <span className="ml-auto">{RANGE_HINT[range]}</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-divider">
            <div className="grid grid-cols-[4.75rem_minmax(0,1fr)_4.5rem] gap-2 bg-default-100/60 px-3 py-1.5 text-xs text-default-500">
              <span>时间</span>
              <span>下载 / 上传</span>
              <span className="text-right">合计</span>
            </div>
            {(all ? rows : rows.slice(0, 7)).map((p) => (
              <div
                key={p.time}
                className="grid grid-cols-[4.75rem_minmax(0,1fr)_4.5rem] items-center gap-2 border-t border-divider px-3 py-2"
              >
                <span className="truncate text-xs">{p.row}</span>
                <div className="min-w-0 space-y-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-default-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: DOWN,
                        width: `${((p.up + p.down) / maxTotal) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="truncate font-mono text-[11px] text-default-500">
                    {bytes(p.down)} / {bytes(p.up)}
                  </div>
                </div>
                <span className="text-right font-mono text-xs font-semibold">
                  {bytes(p.up + p.down)}
                </span>
              </div>
            ))}
            {rows.length > 7 && (
              <button
                className="w-full border-t border-divider py-2 text-xs text-primary"
                type="button"
                onClick={() => setAll(!all)}
              >
                {all ? "收起" : `查看全部 ${rows.length} 条`}
              </button>
            )}
          </div>
          <p className="text-xs text-default-400">
            统计自建节点上按用户区分的协议（VLESS、Trojan、Hysteria2
            等）；导入的节点、Shadowsocks、Snell 不计入。从本功能更新后开始记录
          </p>
        </>
      )}
    </div>
  );
}
