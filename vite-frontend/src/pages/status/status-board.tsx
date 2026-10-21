import type { StatusNode } from "@/api";

import { useState } from "react";

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
        <span className="text-default-500 md:hidden">{label}</span>
        <span className="font-mono font-semibold">
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

/** The node's first reachable reference point, toned by latency and loss. */
function Latency({ n }: { n: StatusNode }) {
  if (!n.online) {
    return (
      <span className="rounded-full bg-default-100 px-2.5 py-1 text-xs text-default-500">
        离线
      </span>
    );
  }
  const p = n.latency.find((x) => x.ok);

  if (!p) {
    return n.latency.length ? (
      <span className="rounded-full bg-default-100 px-2.5 py-1 text-xs text-default-500">
        无响应
      </span>
    ) : null;
  }
  const bad = (p.lossPct ?? 0) > 0 || (p.ms ?? 0) > 150;

  return (
    <span
      className={`truncate rounded-full px-2.5 py-1 text-xs ${bad ? "bg-warning-100 text-warning-800 dark:bg-warning-500/20 dark:text-warning-300" : "bg-success-100 text-success-800 dark:bg-success-500/20 dark:text-success-300"}`}
      title={n.latency
        .map((x) => `${x.name} ${x.ok ? `${x.ms} ms` : "超时"}`)
        .join("\n")}
    >
      {p.name} {p.ms} ms
      {p.lossPct ? ` · 丢 ${p.lossPct.toFixed(0)}%` : ""}
    </span>
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

const GRID =
  "md:grid md:grid-cols-[minmax(12rem,1.6fr)_repeat(3,minmax(0,1fr))_8rem_8rem_minmax(8rem,10rem)] md:items-center md:gap-5";

/**
 * Nodes' live state, read only: the public status page and the view for
 * users allowed to see monitoring. summary adds the totals on top.
 */
export function StatusBoard({
  nodes,
  summary,
}: {
  nodes: StatusNode[];
  summary?: boolean;
}) {
  const [region, setRegion] = useState(ALL);
  const regions = [...new Set(nodes.map((n) => n.region || "其他"))];
  const shown =
    region === ALL
      ? nodes
      : nodes.filter((n) => (n.region || "其他") === region);

  return (
    <div className="space-y-4">
      {summary && <Summary nodes={nodes} />}
      {regions.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[ALL, ...regions].map((r) => (
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
      )}
      <div className="space-y-3 md:space-y-0 md:overflow-hidden md:rounded-2xl md:bg-content1 md:shadow-sm">
        <div
          className={`hidden bg-default-100/60 px-6 py-3 text-xs text-default-500 ${GRID}`}
        >
          <span>节点</span>
          <span>CPU</span>
          <span>内存</span>
          <span>磁盘</span>
          <span>网速</span>
          <span>本月流量</span>
          <span>延迟</span>
        </div>
        {shown.map((n, i) => (
          <div
            key={`${n.name}-${i}`}
            className={`space-y-3 rounded-2xl bg-content1 p-4 shadow-sm md:space-y-0 md:rounded-none md:border-t md:border-divider md:px-6 md:py-4 md:shadow-none ${GRID} ${n.online ? "" : "opacity-60"}`}
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
              <span className="md:hidden">
                <Latency n={n} />
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 md:contents">
              <Meter label="CPU" value={n.online ? n.cpu : undefined} />
              <Meter label="内存" value={n.online ? n.mem : undefined} />
              <Meter label="磁盘" value={n.online ? n.disk : undefined} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs md:contents">
              <div className="flex gap-3 md:flex-col md:gap-0.5">
                <span className="text-warning-700 dark:text-warning-400">
                  ↑ {n.online ? `${bytes(n.netOut)}/s` : "—"}
                </span>
                <span className="text-primary">
                  ↓ {n.online ? `${bytes(n.netIn)}/s` : "—"}
                </span>
              </div>
              <div className="flex gap-3 text-default-600 md:flex-col md:gap-0.5">
                <span>
                  <span className="md:hidden">本月 </span>↑ {bytes(n.monthOut)}
                </span>
                <span>↓ {bytes(n.monthIn)}</span>
              </div>
            </div>
            <div className="hidden min-w-0 md:block">
              <Latency n={n} />
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="py-12 text-center text-sm text-default-500">
            还没有节点
          </p>
        )}
      </div>
    </div>
  );
}
