import type { InboundProbe, InboundProbePoint } from "@/api/types";

import { Loader2, RefreshCw } from "lucide-react";

import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@/shadcn-bridge/heroui/dropdown";

/** Latency below GOOD shows green, below FAIR orange, anything else red. */
export const LATENCY_GOOD_MS = 100;
export const LATENCY_FAIR_MS = 300;

/** Cards show this many reference points; the rest are in the popover. */
const CARD_POINTS = 3;

type Tone = "success" | "warning" | "danger" | "default";

const TONE: Record<Tone, [string, string]> = {
  success: ["bg-emerald-500/15 text-emerald-600", "bg-emerald-500"],
  warning: ["bg-amber-500/15 text-amber-600", "bg-amber-500"],
  danger: ["bg-rose-500/15 text-rose-600", "bg-rose-500"],
  default: ["bg-default-200/70 text-default-500", "bg-default-400"],
};

const RANK: Record<Tone, number> = {
  default: 0,
  success: 1,
  warning: 2,
  danger: 3,
};

export function pointTone(p: InboundProbePoint): Tone {
  if (!p.ok) return "danger";
  const ms = p.latencyMs ?? 0;
  const loss = p.lossPct ?? 0;

  if (ms >= LATENCY_FAIR_MS || loss >= 50) return "danger";
  if (ms >= LATENCY_GOOD_MS || loss > 0) return "warning";

  return "success";
}

/** The probe's reference points; a single-point probe becomes one point. */
export function probePoints(probe?: InboundProbe): InboundProbePoint[] {
  if (!probe || probe.skipped) return [];
  if (probe.points?.length) return probe.points;

  return [
    {
      name: probe.from || "面板服务器",
      ok: probe.ok,
      latencyMs: probe.latencyMs,
      lossPct: probe.lossPct,
      error: probe.error,
    },
  ];
}

// Unreachable sorts above any latency of the same red tone.
const rank = (p: InboundProbePoint) => (p.ok ? RANK[pointTone(p)] : 4);

/** Positive when a looks worse than b: unreachable, worse tone, slower. */
const compare = (a: InboundProbePoint, b: InboundProbePoint) =>
  rank(a) - rank(b) || (a.latencyMs ?? 0) - (b.latencyMs ?? 0);

export function worstPoint(points: InboundProbePoint[]) {
  return points.reduce<InboundProbePoint | undefined>(
    (w, p) => (!w || compare(p, w) > 0 ? p : w),
    undefined,
  );
}

function bestPoint(points: InboundProbePoint[]) {
  return points.reduce<InboundProbePoint | undefined>(
    (b, p) => (!b || compare(p, b) < 0 ? p : b),
    undefined,
  );
}

/**
 * The points a card shows: all of them when they fit, else the ones pinned
 * in settings, then the worst and the best, then configured order; shown
 * in configured order.
 */
function cardPoints(points: InboundProbePoint[]) {
  if (points.length <= CARD_POINTS) return points;
  const keep = new Set<InboundProbePoint>();
  const candidates = [
    ...points.filter((p) => p.pinned),
    worstPoint(points)!,
    bestPoint(points)!,
    ...points,
  ];

  for (const p of candidates) {
    if (keep.size >= CARD_POINTS) break;
    keep.add(p);
  }

  return points.filter((p) => keep.has(p));
}

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));

  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;

  return `${Math.floor(s / 3600)} 小时前`;
}

function valueText(p: InboundProbePoint) {
  return p.ok ? `${p.latencyMs} ms` : p.error || "连不上";
}

function Pill({
  point,
  label,
  spinning,
}: {
  point: InboundProbePoint;
  /** Name the point; hidden on phones, where rows are narrow. */
  label?: boolean;
  spinning?: boolean;
}) {
  const [pill, dot] = TONE[pointTone(point)];
  const loss = point.ok ? (point.lossPct ?? 0) : 0;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${pill}`}
    >
      {spinning ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      )}
      {label && (
        <span className="hidden font-sans opacity-80 sm:inline">
          {point.name}
        </span>
      )}
      <span className="font-mono">{valueText(point)}</span>
      {loss > 0 && <span className="font-mono opacity-80">丢{loss}%</span>}
    </span>
  );
}

/** A card's reference point: its name over the colored latency. */
function Tile({
  point,
  spinning,
}: {
  point: InboundProbePoint;
  spinning?: boolean;
}) {
  const [pill, dot] = TONE[pointTone(point)];
  const loss = point.ok ? (point.lossPct ?? 0) : 0;

  return (
    <span
      className={`flex min-w-0 flex-col items-start rounded-lg px-2 py-1 text-left ${pill}`}
    >
      <span className="flex w-full min-w-0 items-center gap-1 text-[11px] opacity-80">
        {spinning ? (
          <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" />
        ) : (
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        )}
        <span className="truncate">{point.name}</span>
      </span>
      <span className="flex w-full items-baseline gap-1 whitespace-nowrap font-mono text-sm font-semibold">
        {valueText(point)}
        {loss > 0 && (
          <span className="text-[10px] font-normal opacity-80">丢{loss}%</span>
        )}
      </span>
    </span>
  );
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * The inbound's latency to each reference point. Cards show up to three
 * points side by side, list rows the worst one with a dot per other point;
 * pressing either opens every point's result and a re-probe button.
 */
export function LatencyCell({
  probe,
  probing,
  variant,
  onProbe,
}: {
  probe?: InboundProbe;
  probing?: boolean;
  variant: "card" | "list";
  onProbe: () => void;
}) {
  const points = probePoints(probe);

  if (points.length === 0) {
    return (
      <button
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE.default[0]}`}
        disabled={probing}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onProbe();
        }}
      >
        {probing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        检测
      </button>
    );
  }

  const worst = worstPoint(points)!;
  const shown = cardPoints(points);
  const more = points.length - shown.length;
  // Red points the card leaves out, so a hidden outage still shows.
  const hiddenBad = points.filter(
    (p) => !shown.includes(p) && pointTone(p) === "danger",
  ).length;
  const others = points.filter((p) => p !== worst);

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        {variant === "card" ? (
          <button
            className="w-full rounded-lg text-left transition-opacity hover:opacity-80"
            type="button"
            onClick={stop}
            onKeyDown={stop}
          >
            <span className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-default-600">延迟</span>
              <span className="text-xs text-default-400">
                {more > 0 ? `共 ${points.length} 个 · ` : ""}
                {hiddenBad > 0 && (
                  <span className="text-rose-600">{hiddenBad} 个异常 · </span>
                )}
                {probe ? ago(probe.checkedAt) : ""}
              </span>
            </span>
            <span
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))`,
              }}
            >
              {shown.map((p, i) => (
                <Tile key={p.name} point={p} spinning={probing && i === 0} />
              ))}
            </span>
          </button>
        ) : (
          <button
            className="inline-flex max-w-full items-center justify-end gap-1 rounded-lg transition-opacity hover:opacity-80"
            type="button"
            onClick={stop}
            onKeyDown={stop}
          >
            <Pill label={points.length > 1} point={worst} spinning={probing} />
            {others.length > 0 && (
              <span className="flex items-center gap-0.5">
                {others.map((p) => (
                  <span
                    key={p.name}
                    className={`h-1.5 w-1.5 rounded-full ${TONE[pointTone(p)][1]}`}
                  />
                ))}
              </span>
            )}
          </button>
        )}
      </DropdownTrigger>
      <DropdownMenu aria-label="延迟详情" className="w-64">
        <div role="presentation" onClick={stop} onPointerDown={stop}>
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1 text-xs text-default-500">
            <span>到各测试点的延迟</span>
            {probe && <span>{ago(probe.checkedAt)}</span>}
          </div>
          <div className="space-y-1 px-2 pb-2">
            {points.map((p) => {
              const [, dot] = TONE[pointTone(p)];

              return (
                <div
                  key={p.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs">
                    <span className={TONE[pointTone(p)][0].split(" ")[1]}>
                      {valueText(p)}
                    </span>
                    {p.ok && (
                      <span className="ml-2 text-default-400">
                        丢包 {p.lossPct ?? 0}%
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <DropdownItem
            className="justify-center border-t border-divider text-primary"
            startContent={
              probing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
            onPress={onProbe}
          >
            {probing ? "检测中…" : "重新检测"}
          </DropdownItem>
        </div>
      </DropdownMenu>
    </Dropdown>
  );
}
