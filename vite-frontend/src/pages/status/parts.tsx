import type { StatusNode } from "@/api";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { RouteTag } from "@/components/route-tag";

export type Point = StatusNode["latency"][number];

export function bytes(v: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function uptimeText(s: number): string {
  const d = Math.floor(s / 86400);

  if (d > 0) return `在线 ${d} 天`;
  const h = Math.floor(s / 3600);

  return h > 0 ? `在线 ${h} 小时` : "刚上线";
}

/** Green below 60%, amber below 85%, red above. */
export function tone(v: number): string {
  return v >= 85 ? "bg-danger" : v >= 60 ? "bg-warning" : "bg-success";
}

/**
 * Five steps from fine to bad, so 53 ms and 91 ms, or 159 ms and 172 ms,
 * read apart at a glance; the exact value is in the number and tooltip.
 */
const STEPS = [
  ["bg-emerald-500", "text-emerald-600 dark:text-emerald-400"],
  ["bg-lime-500", "text-lime-600 dark:text-lime-400"],
  ["bg-yellow-400", "text-yellow-600 dark:text-yellow-400"],
  ["bg-orange-500", "text-orange-600 dark:text-orange-400"],
  ["bg-rose-500", "text-rose-600 dark:text-rose-400"],
] as const;

/** Up to 60 ms, 100, 160, 200, above; loss lifts it to at least step 2. */
function latencyStep(ms: number, loss: number, ok = true): number {
  if (!ok || loss >= 50) return 4;
  const step = ms <= 60 ? 0 : ms <= 100 ? 1 : ms <= 160 ? 2 : ms <= 200 ? 3 : 4;

  return loss > 0 ? Math.max(step, 2) : step;
}

function lossStep(loss: number): number {
  return loss <= 0 ? 0 : loss < 5 ? 2 : loss < 20 ? 3 : 4;
}

export const latencyText = (ms: number, loss: number, ok = true) =>
  STEPS[latencyStep(ms, loss, ok)][1];
export const lossText = (loss: number) => STEPS[lossStep(loss)][1];

const EMPTY_SEG = "bg-default-200/70 dark:bg-default-100";

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * A row of small blocks, one class each, missing ones on the left. With
 * tips, pointing at (or tapping) a block shows its line above the bar.
 */
export function SegBar({
  segs,
  total,
  tips,
}: {
  segs: string[];
  total: number;
  tips?: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<number | null>(null);
  const shown = segs.slice(-total);
  const shownTips = tips?.slice(-total);
  const pad = total - shown.length;
  const pick = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();

    if (!box || !shownTips) return;
    const i = Math.floor(((clientX - box.left) / box.width) * total);

    setAt(i >= pad && i < total ? i : null);
  };
  const tip = at !== null && shownTips ? shownTips[at - pad] : null;

  return (
    <div
      ref={ref}
      className="relative flex h-2 gap-[2px]"
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setAt(null)}
      onPointerMove={(e) => e.pointerType === "mouse" && pick(e.clientX)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${i < pad ? EMPTY_SEG : shown[i - pad]} ${at === i ? "ring-2 ring-foreground/30" : ""}`}
        />
      ))}
      {tip && (
        <span
          className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background shadow"
          role="status"
          style={{
            left: `clamp(48px, ${((at! + 0.5) / total) * 100}%, calc(100% - 48px))`,
          }}
        >
          {tip}
        </span>
      )}
    </div>
  );
}

const METER_SEGS = 16;

/** A labeled block bar; pct sets how much fills, text is the number shown. */
export function SegMeter({
  label,
  pct,
  text,
  title,
}: {
  label: string;
  pct?: number;
  text?: string;
  title?: string;
}) {
  const filled =
    pct === undefined
      ? 0
      : Math.max(
          pct > 0 ? 1 : 0,
          Math.round((Math.min(pct, 100) / 100) * METER_SEGS),
        );
  const on = pct === undefined ? EMPTY_SEG : tone(pct);

  return (
    <div className="min-w-0 space-y-1.5" title={title}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-default-500">{label}</span>
        <span className="font-semibold tabular-nums">
          {pct === undefined ? "—" : (text ?? `${Math.round(pct)}%`)}
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

/** Load as a share of the CPU count; 4 when the node doesn't report it. */
export function loadMeter(n: StatusNode) {
  const cores = n.cores && n.cores > 0 ? n.cores : 4;

  return {
    pct: n.online ? (n.load / cores) * 100 : undefined,
    text: n.load.toFixed(2),
    title: n.cores
      ? `1 分钟平均负载，${n.cores} 核`
      : "1 分钟平均负载，节点没报核数，按 4 核算",
  };
}

const HIST_SEGS = 20;

/**
 * One reference point: latency and route left, packet loss right, each
 * over the last rounds (about an hour).
 */
export function PointRow({ p }: { p: Point }) {
  const hist: Array<[number, number, number]> = p.hist?.length
    ? p.hist
    : [[p.ms ?? 0, p.ok ? (p.lossPct ?? 0) : 100, 0]];
  const loss = p.ok ? (p.lossPct ?? 0) : 100;
  const when = (t: number) => (t ? `${timeFmt.format(t)} · ` : "");
  const tips = hist.map(([ms, l, t]) =>
    l >= 100 ? `${when(t)}不通` : `${when(t)}${ms} ms · 丢包 ${l}%`,
  );

  return (
    <>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-default-600">{p.name}</span>
            <RouteTag short route={p.route} />
          </span>
          <span
            className={`shrink-0 font-semibold tabular-nums ${latencyText(p.ms ?? 0, loss, p.ok)}`}
          >
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
          segs={hist.map(([ms, l]) => STEPS[latencyStep(ms, l, l < 100)][0])}
          tips={tips}
          total={HIST_SEGS}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-default-500">丢包</span>
          <span className={`font-semibold tabular-nums ${lossText(loss)}`}>
            {loss.toFixed(loss % 1 ? 1 : 0)}
            <span className="ml-0.5 text-[10px] font-normal text-default-400">
              %
            </span>
          </span>
        </div>
        <SegBar
          segs={hist.map(([, l]) => STEPS[lossStep(l)][0])}
          tips={tips}
          total={HIST_SEGS}
        />
      </div>
    </>
  );
}

/** Points the board lists; the rest are counted. */
export const MAX_POINTS = 4;

/** Latency and return route to each reference point, one line per point. */
export function Latency({ n }: { n: StatusNode }) {
  if (!n.online) {
    return <span className="text-xs text-default-400">离线</span>;
  }
  if (n.latency.length === 0) {
    return <span className="text-xs text-default-400">—</span>;
  }
  const more = n.latency.length - MAX_POINTS;

  return (
    <div className="space-y-1">
      {n.latency.slice(0, MAX_POINTS).map((p) => {
        const loss = p.ok ? (p.lossPct ?? 0) : 100;

        return (
          <div key={p.name} className="flex min-w-0 items-center gap-2 text-xs">
            <span className="w-14 shrink-0 truncate text-default-500">
              {p.name}
            </span>
            <span
              className={`shrink-0 font-medium tabular-nums ${latencyText(p.ms ?? 0, loss, p.ok)}`}
            >
              {!p.ok
                ? "超时"
                : p.lossPct
                  ? `${p.ms} ms · 丢${p.lossPct.toFixed(0)}%`
                  : `${p.ms} ms`}
            </span>
            <RouteTag short route={p.route} />
            {p.routeV6 && p.routeV6 !== p.route && (
              <span className="inline-flex items-center gap-0.5">
                <span className="text-[10px] text-default-400">v6</span>
                <RouteTag short route={p.routeV6} />
              </span>
            )}
          </div>
        );
      })}
      {more > 0 && (
        <div className="text-[11px] text-default-400">还有 {more} 个测试点</div>
      )}
    </div>
  );
}

/** Upload over download, each with its arrow. */
export function Speed({ n }: { n: StatusNode }) {
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
export function Month({ n }: { n: StatusNode }) {
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
