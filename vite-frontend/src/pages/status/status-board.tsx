import type { StatusNode } from "@/api";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";

import {
  Latency,
  MAX_POINTS,
  Month,
  PointRow,
  SegMeter,
  Speed,
  bytes,
  loadMeter,
  tone,
  uptimeText,
} from "./parts";

const ALL = "全部";

function Meter({
  label,
  value,
  text,
  title,
}: {
  label: string;
  value?: number;
  text?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5" title={title}>
      <div className="flex items-baseline justify-between gap-1 text-xs">
        <span className="sr-only">{label}</span>
        <span className="font-semibold tabular-nums">
          {value === undefined ? "—" : (text ?? `${value.toFixed(0)}%`)}
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
          className="status-surface space-y-2 rounded-2xl bg-content1 p-4 shadow-sm"
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

/** A node as a card: the phone layout and the desktop card mode. */
export function NodeCard({
  n,
  onSelect,
}: {
  n: StatusNode;
  onSelect?: (n: StatusNode) => void;
}) {
  const load = loadMeter(n);

  return (
    <div
      className={`status-surface space-y-4 rounded-2xl bg-content1 p-4 shadow-sm ${n.online ? "" : "opacity-60"}`}
    >
      <button
        className="flex w-full min-w-0 items-center gap-2.5 text-left disabled:cursor-default"
        disabled={!onSelect}
        type="button"
        onClick={() => onSelect?.(n)}
      >
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
        {onSelect && (
          <span className="shrink-0 text-xs text-primary">详情 ›</span>
        )}
      </button>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <SegMeter label="CPU" pct={n.online ? n.cpu : undefined} />
        <SegMeter label="内存" pct={n.online ? n.mem : undefined} />
        <SegMeter label="磁盘" pct={n.online ? n.disk : undefined} />
        <SegMeter label="负载" {...load} />
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
type Sort = "default" | "name" | "speed" | "traffic" | "latency";

const SORTS: Array<[Sort, string]> = [
  ["default", "默认排序"],
  ["name", "按名称"],
  ["speed", "按实时网速"],
  ["traffic", "按本月流量"],
  ["latency", "按延迟"],
];

const LAYOUT_KEY = "flyx-status-layout";
const SORT_KEY = "flyx-status-sort";

function saved<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;

    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved; it still applies until the page reloads.
  }
}

/** Best reachable point's latency; offline and unmeasured nodes last. */
function bestMs(n: StatusNode): number {
  const ok = n.latency.filter((p) => p.ok).map((p) => p.ms ?? 0);

  return n.online && ok.length ? Math.min(...ok) : Infinity;
}

function sorted(nodes: StatusNode[], by: Sort): StatusNode[] {
  if (by === "default") return nodes;
  const list = [...nodes];

  if (by === "name") list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  if (by === "speed") {
    list.sort((a, b) => b.netIn + b.netOut - (a.netIn + a.netOut));
  }
  if (by === "traffic") {
    list.sort((a, b) => b.monthIn + b.monthOut - (a.monthIn + a.monthOut));
  }
  if (by === "latency") list.sort((a, b) => bestMs(a) - bestMs(b));

  return list;
}

const GRID =
  "grid grid-cols-[minmax(10rem,1.3fr)_repeat(4,minmax(3.5rem,0.6fr))_6.5rem_7.5rem_minmax(13rem,1.3fr)] items-center gap-5";

/**
 * Nodes' live state, read only: the public status page and the view for
 * users allowed to see monitoring. summary adds the totals on top. Phones
 * always get cards; wide screens choose between a list and cards. With
 * onSelect, a node opens its details.
 */
export function StatusBoard({
  nodes,
  summary,
  onSelect,
}: {
  nodes: StatusNode[];
  summary?: boolean;
  onSelect?: (n: StatusNode) => void;
}) {
  const [region, setRegion] = useState(ALL);
  const [layout, setLayoutState] = useState<Layout>(() =>
    saved<Layout>(LAYOUT_KEY, ["list", "card"], "list"),
  );
  const [sort, setSortState] = useState<Sort>(() =>
    saved<Sort>(
      SORT_KEY,
      SORTS.map(([s]) => s),
      "default",
    ),
  );
  const regions = [...new Set(nodes.map((n) => n.region || "其他"))];
  const shown = sorted(
    region === ALL
      ? nodes
      : nodes.filter((n) => (n.region || "其他") === region),
    sort,
  );

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    remember(LAYOUT_KEY, l);
  };
  const setSort = (s: Sort) => {
    setSortState(s);
    remember(SORT_KEY, s);
  };

  return (
    <div className="space-y-4">
      {summary && <Summary nodes={nodes} />}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-1 flex-wrap gap-2">
          {regions.length > 1 &&
            [ALL, ...regions].map((r) => (
              <button
                key={r}
                aria-pressed={region === r}
                className={`status-surface flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${region === r ? "border-primary bg-primary-50 font-semibold text-primary dark:bg-primary-500/20" : "border-divider bg-content1 text-default-600 hover:bg-default-100"}`}
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
        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label="排序"
            className="status-surface h-9 rounded-full border border-divider bg-content1 px-3 text-sm text-default-600 outline-none focus-visible:ring-2 focus-visible:ring-primary"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="status-surface hidden rounded-full border border-divider bg-content1 p-1 lg:flex">
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
      </div>
      {layout === "list" && shown.length > 0 && (
        <div className="status-surface hidden overflow-hidden rounded-2xl bg-content1 shadow-sm lg:block">
          <div
            className={`bg-default-100/60 px-6 py-3 text-xs text-default-500 ${GRID}`}
          >
            <span>节点</span>
            <span>CPU</span>
            <span>内存</span>
            <span>磁盘</span>
            <span>负载</span>
            <span>网速</span>
            <span>本月流量</span>
            <span>延迟 · 回程</span>
          </div>
          {shown.map((n, i) => {
            const load = loadMeter(n);

            return (
              <div
                key={`${n.name}-${i}`}
                className={`border-t border-divider px-6 py-4 ${GRID} ${n.online ? "" : "opacity-60"} ${onSelect ? "cursor-pointer transition-colors hover:bg-default-50" : ""}`}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={() => onSelect?.(n)}
                onKeyDown={(e) => {
                  if (onSelect && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect(n);
                  }
                }}
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
                <Meter
                  label="负载"
                  text={load.text}
                  title={load.title}
                  value={load.pct}
                />
                <Speed n={n} />
                <Month n={n} />
                <div className="min-w-0">
                  <Latency n={n} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div
        className={`grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 ${layout === "list" ? "lg:hidden" : ""}`}
      >
        {shown.map((n, i) => (
          <NodeCard key={`${n.name}-${i}`} n={n} onSelect={onSelect} />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="status-surface rounded-2xl bg-content1 py-12 text-center text-sm text-default-500 shadow-sm">
          还没有节点
        </p>
      )}
    </div>
  );
}
