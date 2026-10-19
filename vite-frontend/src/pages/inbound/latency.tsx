import type { InboundProbe } from "@/api/types";

import { Loader2 } from "lucide-react";

/** Latency below GOOD shows green, below FAIR orange, anything else red. */
export const LATENCY_GOOD_MS = 100;
export const LATENCY_FAIR_MS = 300;

type Tone = "success" | "warning" | "danger" | "default";

const TONE: Record<Tone, [string, string]> = {
  success: ["bg-emerald-500/15 text-emerald-600", "bg-emerald-500"],
  warning: ["bg-amber-500/15 text-amber-600", "bg-amber-500"],
  danger: ["bg-rose-500/15 text-rose-600", "bg-rose-500"],
  default: ["bg-default-200/70 text-default-500", "bg-default-400"],
};

export function latencyTone(probe?: InboundProbe): Tone {
  if (!probe || probe.skipped) return "default";
  if (!probe.ok) return "danger";
  const ms = probe.latencyMs ?? 0;
  const loss = probe.lossPct ?? 0;

  if (ms >= LATENCY_FAIR_MS || loss >= 50) return "danger";
  if (ms >= LATENCY_GOOD_MS || loss > 0) return "warning";

  return "success";
}

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));

  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;

  return `${Math.floor(s / 3600)} 小时前`;
}

/** Where the probe was made from, e.g. "浙江移动" or "面板服务器". */
export function probeSource(probe?: InboundProbe) {
  if (!probe || probe.skipped) return "";

  return probe.from || "面板服务器";
}

function describe(probe?: InboundProbe) {
  if (!probe || probe.skipped) return "未检测，点击检测";
  const parts = [`检测点：${probeSource(probe)}`];

  if (probe.ok) {
    parts.push(`延迟 ${probe.latencyMs} ms`);
    if (probe.lossPct !== undefined) parts.push(`丢包 ${probe.lossPct}%`);
  } else {
    parts.push(probe.error || "连不上");
  }
  parts.push(ago(probe.checkedAt), "点击重新检测");

  return parts.join(" · ");
}

/**
 * The inbound's last latency as a colored pill; pressing it probes again.
 * withSource also names the probe's vantage point next to it.
 */
export function LatencyBadge({
  probe,
  probing,
  withSource,
  onProbe,
}: {
  probe?: InboundProbe;
  probing?: boolean;
  withSource?: boolean;
  onProbe: () => void;
}) {
  const tone = latencyTone(probe);
  const [pill, dot] = TONE[tone];
  const known = probe && !probe.skipped;
  const loss = known && probe.ok ? (probe.lossPct ?? 0) : 0;
  const text = !known
    ? "检测"
    : probe.ok
      ? `${probe.latencyMs} ms`
      : probe.error || "连不上";

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {withSource && known && (
        <span className="truncate text-default-400">{probeSource(probe)}</span>
      )}
      <button
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium transition-opacity hover:opacity-80 disabled:cursor-wait ${pill}`}
        disabled={probing}
        title={describe(probe)}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onProbe();
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {probing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        )}
        {text}
        {loss > 0 && <span className="opacity-80">· 丢 {loss}%</span>}
      </button>
    </span>
  );
}
