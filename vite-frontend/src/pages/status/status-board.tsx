import type { StatusNode } from "@/api";

import { useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, List } from "lucide-react";

import { RouteTag } from "@/components/route-tag";

const ALL = "全部";

function bytes(v: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function uptimeText(s: number): string {
  const d = Math.floor(s / 86400);

  if (d > 0) return `在线 ${d} 天`;
  const h = Math.floor(s / 3600);

  return h > 0 ? `在线 ${h} 小时` : "刚上线";
}

/** Green below 60%, amber below 85%, red above. */
function tone(v: number): string {
  return v >= 85 ? "bg-danger" : v >= 60 ? "bg-warning" : "bg-success";
}

function Meter({ label, value }: { label: string; value?: number }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-1 text-xs">
        <span className="sr-only">{label}</span>
        <span className="font-semibold tabular-nums">
          {value === undefined ? "—" : `${value.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-default-100">
        {value !== undefined && (
          <div
            className={`h-full rounded-full ${tone(value)}`}
            style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
          />
        )}
      </div>
    </div>
  );
}

type Point = StatusNode["latency"][number];

/** Points the board lists; the rest are counted. */
const MAX_POINTS = 4;

function msTone(p: Point): string {
  if (!p.ok || (p.ms ?? 0) >= 300 || (p.lossPct ?? 0) >= 50) {
    return "text-rose-600 dark:text-rose-400";
  }
  if ((p.ms ?? 0) >= 100 || (p.lossPct ?? 0) > 0) {
    return "text-amber-600 dark:text-amber-400";
  }

  return "text-emerald-600 dark:text-emerald-400";
}

function msText(p: Point): string {
  if (!p.ok) return "超时";

  return p.lossPct ? `${p.ms} ms · 丢${p.lossPct.toFixed(0)}%` : `${p.ms} ms`;
}

/** Latency and return route to each reference point, one line per point. */
function Latency({ n }: { n: StatusNode }) {
  if (!n.online) {
    return <span className="text-xs text-default-400">离线</span>;
  }
  if (n.latency.length === 0) {
    return <span className="text-xs text-default-400">—</span>;
  }
  const more = n.latency.length - MAX_POINTS;

  return (
    <div className="space-y-1">
      {n.latency.slice(0, MAX_POINTS).map((p) => (
        <div key={p.name} className="flex min-w-0 items-center gap-2 text-xs">
          <span className="w-14 shrink-0 truncate text-default-500">
            {p.name}
          </span>
          <span className={`shrink-0 font-medium tabular-nums ${msTone(p)}`}>
            {msText(p)}
          </span>
          <RouteTag short route={p.route} />
          {p.routeV6 && p.routeV6 !== p.route && (
            <span className="inline-flex items-center gap-0.5">
              <span className="text-[10px] text-default-400">v6</span>
              <RouteTag short route={p.routeV6} />
            </span>
          )}
        </div>
      ))}
      {more > 0 && (
        <div className="text-[11px] text-default-400">还有 {more} 个测试点</div>
      )}
    </div>
  );
}

/** Upload over download, each with its arrow. */
function Speed({ n }: { n: StatusNode }) {
  const row = (up: boolean, v: number) => (
    <div className="flex items-center gap-1.5">
      {up ? (
        <ArrowUp className="h-3 w-3 shrink-0 text-emerald-500" />
      ) : (
        <ArrowDown className="h-3 w-3 shrink-0 text-sky-500" />
      )}
      <span className="font-medium tabular-nums">
        {n.online ? `${bytes(v)}/s` : "—"}
      </span>
    </div>
  );

  return (
    <div className="space-y-1 text-xs">
      {row(true, n.netOut)}
      {row(false, n.netIn)}
    </div>
  );
}

/** This month's total, upload and download under it. */
function Month({ n }: { n: StatusNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-sm font-semibold tabular-nums">
        {bytes(n.monthIn + n.monthOut)}
      </div>
      <div className="flex flex-wrap gap-x-1.5 text-[11px] tabular-nums text-default-400">
        <span className="whitespace-nowrap">↑{bytes(n.monthOut)}</span>
        <span className="whitespace-nowrap">↓{bytes(n.monthIn)}</span>
      </div>
    </div>
  );
}

function Summary({ nodes }: { nodes: StatusNode[] }) {
  const online = nodes.filter((n) => n.online);
  const sum = (f: (n: StatusNode) => number) =>
    nodes.reduce((s, n) => s + f(n), 0);
  const up = sum((n) => n.netOut);
  const down = sum((n) => n.netIn);
  const mOut = sum((n) => n.monthOut);
  const mIn = sum((n) => n.monthIn);
  const tcp = sum((n) => n.tcp);
  const udp = sum((n) => n.udp);
  const cards: Array<[string, string, string]> = [
    ["在线节点", `${online.length} / ${nodes.length}`, ""],
    [
      "实时带宽",
      `${bytes(up + down)}/s`,
      `↑ ${bytes(up)}/s · ↓ ${bytes(down)}/s`,
    ],
    ["本月流量", bytes(mOut + mIn), `↑ ${bytes(mOut)} · ↓ ${bytes(mIn)}`],
    ["连接数", (tcp + udp).toLocaleString(), `TCP ${tcp} · UDP ${udp}`],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(([label, value, sub], i) => (
        <div
          key={label}
          className="space-y-2 rounded-2xl bg-content1 p-4 shadow-sm"
        >
          <div className="text-xs text-default-500">{label}</div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          {i === 0 ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-default-100">
              <div
                className="h-full rounded-full bg-success"
                style={{
                  width: `${nodes.length ? (online.length / nodes.length) * 100 : 0}%`,
                }}
              />
            </div>
          ) : (
            <div className="truncate text-xs text-default-500">{sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Latency tones: green under 100 ms, amber under 300, red above or down. */
function sampleTone(ms: number, loss: number): string {
  if (loss >= 100 || ms >= 300 || loss >= 50) return "bg-rose-500";
  if (ms >= 100 || loss > 0) return "bg-amber-400";

  return "bg-emerald-500";
}

function lossTone(loss: number): string {
  if (loss >= 50) return "bg-rose-500";
  if (loss > 0) return "bg-amber-400";

  return "bg-emerald-500";
}

const EMPTY_SEG = "bg-default-200/70 dark:bg-default-100";

/** A row of small blocks, one class each; missing ones on the left. */
function SegBar({ segs, total }: { segs: string[]; total: number }) {
  const shown = segs.slice(-total);
  const pad = total - shown.length;

  return (
    <div className="flex h-2 gap-[2px]">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${i < pad ? EMPTY_SEG : shown[i - pad]}`}
        />
      ))}
    </div>
  );
}

const METER_SEGS = 16;

function SegMeter({ label, value }: { label: string; value?: number }) {
  const filled =
    value === undefined
      ? 0
      : Math.max(value > 0 ? 1 : 0, Math.round((value / 100) * METER_SEGS));
  const on = value === undefined ? EMPTY_SEG : tone(value);

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-default-500">{label}</span>
        <span className="font-semibold tabular-nums">
          {value === undefined ? "—" : `${Math.round(value)}%`}
        </span>
      </div>
      <SegBar
        segs={Array.from({ length: METER_SEGS }, (_, i) =>
          i < filled ? on : EMPTY_SEG,
        )}
        total={METER_SEGS}
      />
    </div>
  );
}

const HIST_SEGS = 20;

/** One reference point: latency and route left, packet loss right, each
 * over the last rounds (about an hour). */
function PointRow({ p }: { p: Point }) {
  const hist: Array<[number, number]> = p.hist?.length
    ? p.hist
    : [[p.ms ?? 0, p.ok ? (p.lossPct ?? 0) : 100]];
  const loss = p.ok ? (p.lossPct ?? 0) : 100;

  return (
    <>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-default-600">{p.name}</span>
            <RouteTag short route={p.route} />
          </span>
          <span className={`shrink-0 font-semibold tabular-nums ${msTone(p)}`}>
            {p.ok ? (
              <>
                {p.ms}
                <span className="ml-0.5 text-[10px] font-normal text-default-400">
                  ms
                </span>
              </>
            ) : (
              "超时"
            )}
          </span>
        </div>
        <SegBar
          segs={hist.map(([ms, l]) => sampleTone(ms, l))}
          total={HIST_SEGS}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-default-500">丢包</span>
          <span
            className={`font-semibold tabular-nums ${loss >= 50 ? "text-rose-600 dark:text-rose-400" : loss > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
          >
            {loss.toFixed(loss % 1 ? 1 : 0)}
            <span className="ml-0.5 text-[10px] font-normal text-default-400">
              %
            </span>
          </span>
        </div>
        <SegBar segs={hist.map(([, l]) => lossTone(l))} total={HIST_SEGS} />
      </div>
    </>
  );
}

/** A node as a card: the phone layout and the desktop card mode. */
function NodeCard({ n }: { n: StatusNode }) {
  return (
    <div
      className={`space-y-4 rounded-2xl bg-content1 p-4 shadow-sm ${n.online ? "" : "opacity-60"}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.online ? "bg-success" : "bg-default-400"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{n.name}</div>
          <div className="truncate text-xs text-default-500">
            {[
              n.region,
              n.online ? uptimeText(n.uptime) : "离线",
              n.online ? `负载 ${n.load.toFixed(2)}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SegMeter label="CPU" value={n.online ? n.cpu : undefined} />
        <SegMeter label="内存" value={n.online ? n.mem : undefined} />
        <SegMeter label="磁盘" value={n.online ? n.disk : undefined} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-divider rounded-xl bg-default-50 py-2.5 dark:bg-default-50/50">
        <div className="min-w-0 px-3">
          <div className="mb-1 text-[11px] text-default-400">网速</div>
          <Speed n={n} />
        </div>
        <div className="min-w-0 px-3">
          <div className="mb-1 text-[11px] text-default-400">本月流量</div>
          <Month n={n} />
        </div>
        <div className="min-w-0 px-3">
          <div className="mb-1 text-[11px] text-default-400">连接</div>
          <div className="space-y-1 text-xs tabular-nums">
            <div>
              <span className="text-default-400">TCP </span>
              <span className="font-medium">{n.online ? n.tcp : "—"}</span>
            </div>
            <div>
              <span className="text-default-400">UDP </span>
              <span className="font-medium">{n.online ? n.udp : "—"}</span>
            </div>
          </div>
        </div>
      </div>
      {n.online && n.latency.length > 0 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-divider pt-3">
          {n.latency.slice(0, MAX_POINTS).map((p) => (
            <PointRow key={p.name} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

type Layout = "list" | "card";
const LAYOUT_KEY = "flyx-status-layout";

function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "card" ? "card" : "list";
  } catch {
    return "list";
  }
}

const GRID =
  "grid grid-cols-[minmax(10rem,1.3fr)_repeat(3,minmax(4rem,0.7fr))_6.5rem_7.5rem_minmax(13rem,1.3fr)] items-center gap-5";

/**
 * Nodes' live state, read only: the public status page and the view for
 * users allowed to see monitoring. summary adds the totals on top. Phones
 * always get cards; wide screens choose between a list and cards.
 */
export function StatusBoard({
  nodes,
  summary,
}: {
  nodes: StatusNode[];
  summary?: boolean;
}) {
  const [region, setRegion] = useState(ALL);
  const [layout, setLayoutState] = useState<Layout>(savedLayout);
  const regions = [...new Set(nodes.map((n) => n.region || "其他"))];
  const shown =
    region === ALL
      ? nodes
      : nodes.filter((n) => (n.region || "其他") === region);

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      // Not saved; it still applies until the page reloads.
    }
  };

  return (
    <div className="space-y-4">
      {summary && <Summary nodes={nodes} />}
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-wrap gap-2">
          {regions.length > 1 &&
            [ALL, ...regions].map((r) => (
              <button
                key={r}
                aria-pressed={region === r}
                className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${region === r ? "border-primary bg-primary-50 font-semibold text-primary dark:bg-primary-500/20" : "border-divider bg-content1 text-default-600 hover:bg-default-100"}`}
                type="button"
                onClick={() => setRegion(r)}
              >
                {r}
                <span className="rounded-full bg-default-100 px-2 text-xs text-default-500">
                  {r === ALL
                    ? nodes.length
                    : nodes.filter((n) => (n.region || "其他") === r).length}
                </span>
              </button>
            ))}
        </div>
        <div className="hidden shrink-0 rounded-full border border-divider bg-content1 p-1 lg:flex">
          {(
            [
              ["list", "列表", List],
              ["card", "卡片", LayoutGrid],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              aria-label={label}
              aria-pressed={layout === value}
              className={`flex h-7 w-8 items-center justify-center rounded-full transition-colors ${layout === value ? "bg-primary-50 text-primary dark:bg-primary-500/20" : "text-default-500 hover:text-default-700"}`}
              title={label}
              type="button"
              onClick={() => setLayout(value)}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
      {layout === "list" && shown.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl bg-content1 shadow-sm lg:block">
          <div
            className={`bg-default-100/60 px-6 py-3 text-xs text-default-500 ${GRID}`}
          >
            <span>节点</span>
            <span>CPU</span>
            <span>内存</span>
            <span>磁盘</span>
            <span>网速</span>
            <span>本月流量</span>
            <span>延迟 · 回程</span>
          </div>
          {shown.map((n, i) => (
            <div
              key={`${n.name}-${i}`}
              className={`border-t border-divider px-6 py-4 ${GRID} ${n.online ? "" : "opacity-60"}`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.online ? "bg-success" : "bg-default-400"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{n.name}</div>
                  <div className="truncate text-xs text-default-500">
                    {[n.region, n.online ? uptimeText(n.uptime) : "离线"]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
              <Meter label="CPU" value={n.online ? n.cpu : undefined} />
              <Meter label="内存" value={n.online ? n.mem : undefined} />
              <Meter label="磁盘" value={n.online ? n.disk : undefined} />
              <Speed n={n} />
              <Month n={n} />
              <div className="min-w-0">
                <Latency n={n} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        className={`grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 ${layout === "list" ? "lg:hidden" : ""}`}
      >
        {shown.map((n, i) => (
          <NodeCard key={`${n.name}-${i}`} n={n} />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="rounded-2xl bg-content1 py-12 text-center text-sm text-default-500 shadow-sm">
          还没有节点
        </p>
      )}
    </div>
  );
}
