import type { StatusDetail, StatusNode } from "@/api";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { bytes } from "./parts";
import { NodeCard } from "./status-board";

import { RouteTag } from "@/components/route-tag";

const apiBase = import.meta.env.VITE_API_BASE ?? "";
const POLL_MS = 30000;
const HOURS = [1, 6, 24] as const;
const POINT_COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#db2777",
];

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type Row = Record<string, number | null>;

interface Series {
  key: string;
  name: string;
  color: string;
  area?: boolean;
}

/** 1.7M, 640K: a rate short enough for the axis. */
function shortRate(v: number): string {
  const units = ["B", "K", "M", "G", "T"];
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

const tick = { fill: "currentColor", opacity: 0.55, fontSize: 11 };

/** One history chart; fmt formats the axis and the tooltip values. */
function HistoryChart({
  title,
  rows,
  series,
  fmt,
  axisFmt = fmt,
  max,
  note,
}: {
  title: string;
  rows: Row[];
  series: Series[];
  fmt: (v: number) => string;
  /** Shorter labels for the axis; defaults to fmt. */
  axisFmt?: (v: number) => string;
  max?: number;
  note?: (row: Row) => string | null;
}) {
  return (
    <section className="status-surface space-y-3 rounded-2xl bg-content1 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {series.length > 1 &&
          series.map((s) => (
            <span
              key={s.key}
              className="flex items-center gap-1 text-xs text-default-500"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </span>
          ))}
      </div>
      <div className="relative h-48 w-full">
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
          >
            <XAxis
              axisLine={false}
              dataKey="t"
              domain={["dataMin", "dataMax"]}
              interval="preserveStartEnd"
              minTickGap={32}
              scale="time"
              tick={tick}
              tickFormatter={(t: number) => timeFmt.format(t)}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              domain={[0, max ?? "auto"]}
              tick={tick}
              tickFormatter={axisFmt}
              tickLine={false}
              width={48}
            />
            <Tooltip
              content={({
                active,
                payload,
              }: {
                active?: boolean;
                payload?: Array<{ payload?: Row }>;
              }) => {
                const row = payload?.[0]?.payload;

                if (!active || !row) return null;
                const extra = note?.(row);

                return (
                  <div className="rounded-xl border border-divider bg-content1 px-3 py-2 text-xs shadow-lg">
                    <p className="font-medium">
                      {timeFmt.format(row.t as number)}
                    </p>
                    {series.map((s) => (
                      <p key={s.key} style={{ color: s.color }}>
                        {s.name}{" "}
                        {row[s.key] == null ? "不通" : fmt(row[s.key]!)}
                      </p>
                    ))}
                    {extra && <p className="text-default-500">{extra}</p>}
                  </div>
                );
              }}
              cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
            />
            {series.map((s) =>
              s.area ? (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  fill={s.color}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  type="monotone"
                />
              ) : (
                <Line
                  key={s.key}
                  connectNulls={false}
                  dataKey={s.key}
                  dot={false}
                  isAnimationActive={false}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  type="monotone"
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {rows.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-default-400">
            这段时间没有数据
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * One public node: its live card, then resource, speed, load and latency
 * history over the last 1, 6 or 24 hours.
 */
export default function NodeDetail({
  slug,
  node,
  onBack,
}: {
  slug: string;
  node: StatusNode;
  onBack: () => void;
}) {
  const [hours, setHours] = useState<(typeof HOURS)[number]>(1);
  const [detail, setDetail] = useState<StatusDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">(
    "loading",
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.scrollTo?.(0, 0);
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const load = async () => {
      let wait = POLL_MS;

      try {
        const res = await fetch(
          `${apiBase}/api/v1/open_api/status/${encodeURIComponent(slug)}/node/${encodeURIComponent(node.key ?? "")}?hours=${hours}`,
          { cache: "no-store" },
        );

        if (!active) return;
        if (res.status === 404) {
          setState("gone");

          return;
        }
        if (res.status === 429) wait = 60000;
        else if (res.ok) {
          const body = (await res.json()) as { data?: StatusDetail };

          if (body.data) {
            setDetail(body.data);
            setState("ok");
          }
        } else setState((s) => (s === "ok" ? s : "error"));
      } catch {
        if (active) setState((s) => (s === "ok" ? s : "error"));
      }
      if (active) timer = window.setTimeout(load, wait);
    };

    setState("loading");
    void load();

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [slug, node.key, hours]);

  const metrics = useMemo(
    () =>
      (detail?.metrics ?? []).map(
        ([t, cpu, mem, disk, load, netIn, netOut]) => ({
          t,
          cpu,
          mem,
          disk,
          load,
          netIn,
          netOut,
        }),
      ),
    [detail],
  );

  const latency = useMemo(() => {
    const byTime = new Map<number, Row>();
    const loss = new Map<number, string[]>();

    (detail?.latency ?? []).forEach((p, i) => {
      for (const [t, ms, l] of p.samples) {
        const row = byTime.get(t) ?? { t };

        row[`p${i}`] = l >= 100 ? null : ms;
        byTime.set(t, row);
        if (l > 0 && l < 100) {
          loss.set(t, [...(loss.get(t) ?? []), `${p.name} 丢包 ${l}%`]);
        }
      }
    });

    return {
      rows: [...byTime.values()].sort(
        (a, b) => (a.t as number) - (b.t as number),
      ),
      loss,
    };
  }, [detail]);

  const cores = detail?.cores || node.cores || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="status-surface flex h-9 items-center gap-1 rounded-full border border-divider bg-content1 pl-2 pr-3.5 text-sm text-default-600 hover:bg-default-100"
          type="button"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
          全部节点
        </button>
        <span className="flex-1" />
        <div className="status-surface flex rounded-full border border-divider bg-content1 p-1">
          {HOURS.map((h) => (
            <button
              key={h}
              aria-pressed={hours === h}
              className={`h-7 rounded-full px-3 text-xs transition-colors ${hours === h ? "bg-primary-50 font-semibold text-primary dark:bg-primary-500/20" : "text-default-500 hover:text-default-700"}`}
              type="button"
              onClick={() => setHours(h)}
            >
              {h} 小时
            </button>
          ))}
        </div>
      </div>

      <NodeCard n={node} />

      {state === "gone" ? (
        <p className="py-12 text-center text-sm text-default-500">
          这个节点已不在状态页上
        </p>
      ) : state === "error" && !detail ? (
        <p className="py-12 text-center text-sm text-danger">
          暂时连不上，稍后自动重试
        </p>
      ) : !detail ? (
        <p className="py-12 text-center text-sm text-default-500">正在加载…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <HistoryChart
            fmt={(v) => `${Math.round(v)}%`}
            max={100}
            rows={metrics}
            series={[
              { key: "cpu", name: "CPU", color: "#2563eb" },
              { key: "mem", name: "内存", color: "#9333ea" },
              { key: "disk", name: "磁盘", color: "#ea580c" },
            ]}
            title="资源"
          />
          <HistoryChart
            axisFmt={shortRate}
            fmt={(v) => `${bytes(v)}/s`}
            rows={metrics}
            series={[
              { key: "netIn", name: "下行", color: "#0284c7", area: true },
              { key: "netOut", name: "上行", color: "#16a34a" },
            ]}
            title="网速"
          />
          <HistoryChart
            fmt={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            rows={metrics}
            series={[{ key: "load", name: "负载", color: "#db2777" }]}
            title={cores ? `负载（${cores} 核）` : "负载"}
          />
          <HistoryChart
            axisFmt={(v) => `${Math.round(v)}ms`}
            fmt={(v) => `${Math.round(v)} ms`}
            note={(row) =>
              latency.loss.get(row.t as number)?.join("，") ?? null
            }
            rows={latency.rows}
            series={(detail.latency ?? []).map((p, i) => ({
              key: `p${i}`,
              name: p.name,
              color: POINT_COLORS[i % POINT_COLORS.length],
            }))}
            title="延迟"
          />
          {detail.latency.some((p) => p.route) && (
            <div className="status-surface flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-content1 px-4 py-3 text-xs shadow-sm lg:col-span-2">
              <span className="text-default-500">回程</span>
              {detail.latency.map((p) => (
                <span key={p.name} className="flex items-center gap-1.5">
                  {p.name}
                  <RouteTag route={p.route} />
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
