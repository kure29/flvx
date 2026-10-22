import type {
  LatencyTrend,
  NodeQualityData,
  NodeQualityStats,
  NodeTrafficData,
  NodeTrafficGrain,
} from "@/api/types";

import { parseLatencyTargets } from "@/utils/latency-targets";

type Book = Record<string, { key: string; res: { data?: unknown } }[]>;

/** Demo-only analytics. Production always reads persisted measurements from the API. */
export function demoNodeAnalytics(
  path: string,
  book: Book,
  recordedAt: number,
  sourceRecordedAt: number,
): NodeQualityData | NodeTrafficData | undefined {
  const match = path.match(/^monitor\/nodes\/(\d+)\/(quality|traffic)(?:\?|$)/);

  if (!match) return undefined;
  const id = Number(match[1]);
  const params = new URLSearchParams(path.split("?")[1]);

  if (match[2] === "quality") {
    const config = book["config/list"]?.[0]?.res.data as
      | Record<string, string>
      | undefined;
    const pool = parseLatencyTargets(config?.latency_targets);
    const nodes = book["node/list"]?.[0]?.res.data as
      | { id: number; latencyTargets?: { points: string[] } | null }[]
      | undefined;
    const choice = Array.isArray(nodes)
      ? nodes.find((node) => node.id === id)?.latencyTargets
      : null;
    const own = choice
      ? pool.filter((target) => choice.points.includes(target.name))
      : [];
    const allowed = new Set(
      (choice?.points.length === 0
        ? []
        : own.length
          ? own
          : pool.filter((target) => target.enabled)
      ).map((target) => target.name),
    );
    const entry = book["node/latency/history"]
      ?.filter((e) => JSON.parse(e.key).id === id)
      .sort((a, b) => JSON.parse(b.key).hours - JSON.parse(a.key).hours)[0];
    const source = entry?.res.data as LatencyTrend | undefined;
    const since = recordedAt - Number(params.get("hours") || 24) * 3600000;
    const targets = params.getAll("target");
    const probeIntervalMs = 60000;
    const intervalMs =
      Number(params.get("interval") || 0) * 60000 ||
      Math.max(probeIntervalMs, (recordedAt - since) / 400);
    const stats = (points: LatencyTrend["points"]): NodeQualityStats => {
      const samples = points.flatMap((p) => p.samples);
      const values = samples
        .flatMap((s) => (s.ms == null ? [] : [s.ms]))
        .sort((a, b) => a - b);
      const round = (v: number) => Math.round(v * 10) / 10;
      const mean = (v: number[]) =>
        v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null;
      const jitter = points.flatMap((p) =>
        p.samples.flatMap((s, i, a) =>
          i && s.ms != null && a[i - 1].ms != null
            ? [Math.abs(s.ms - a[i - 1].ms!)]
            : [],
        ),
      );
      const percentile = (p: number) =>
        values.length ? values[Math.ceil(values.length * p) - 1] : null;
      const loss = mean(samples.map((s) => s.lossPct));

      return {
        avgMs: mean(values),
        jitterMs: mean(jitter),
        lossPct: loss,
        successPct: loss == null ? null : round(100 - loss),
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        sampleCount: samples.length,
      };
    };
    const points = (source?.points ?? [])
      .filter((point) => allowed.has(point.name))
      .map((p) => {
        const point = {
          ...p,
          samples: p.samples
            .map((s) => ({ ...s, t: s.t + recordedAt - sourceRecordedAt }))
            .filter((s) => s.t >= since && s.t <= recordedAt),
        };

        return { ...point, summary: stats([point]) };
      })
      .filter((p) => p.samples.length);
    const chosen = points.filter(
      (p) => !targets.length || targets.includes(p.name),
    );
    const samples = chosen.flatMap((p) =>
      p.samples.map((s) => ({ ...s, name: p.name })),
    );
    const slowest = samples
      .filter((s) => s.ms != null)
      .sort((a, b) => Number(b.ms) - Number(a.ms))[0];
    const lossiest = samples
      .filter((s) => s.lossPct > 0)
      .sort((a, b) => b.lossPct - a.lossPct)[0];

    return {
      since,
      until: recordedAt,
      intervalMs,
      probeIntervalMs,
      points,
      summary: stats(chosen),
      events: [
        slowest && { kind: "latency" as const, ...slowest },
        lossiest && { kind: "loss" as const, ...lossiest },
      ].filter((e): e is NonNullable<typeof e> => !!e),
    };
  }

  // Seeded sample traffic for the backend-free demo, like its live metric generator.
  const grain = (params.get("grain") || "hour") as NodeTrafficGrain;
  const offset = Number(params.get("tzOffset") || 0);
  const shifted = new Date(recordedAt + offset * 60000);
  const date = new Date(shifted);

  date.setUTCMinutes(0, 0, 0);
  if (grain !== "hour") date.setUTCHours(0);
  if (grain === "month") {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 11);
  } else if (grain === "day") date.setUTCDate(date.getUTCDate() - 30);
  else date.setUTCHours(date.getUTCHours() - 23);
  const since = date.getTime() - offset * 60000;
  const buckets: NodeTrafficData["buckets"] = [];
  const monthly = book["node/traffic/month"]?.[0]?.res.data as
    | Record<string, [number, number]>
    | undefined;
  const base = monthly?.[id] ?? [2e11, 1.8e11];

  while (date.getTime() <= shifted.getTime()) {
    const t = date.getTime() - offset * 60000;

    if (grain === "month") date.setUTCMonth(date.getUTCMonth() + 1);
    else if (grain === "day") date.setUTCDate(date.getUTCDate() + 1);
    else date.setUTCHours(date.getUTCHours() + 1);
    const end = date.getTime() - offset * 60000;
    const current = end > recordedAt;
    const hours = Math.ceil((Math.min(end, recordedAt) - t) / 3600000);
    const weight =
      0.6 +
      0.4 * Math.sin((t / 86400000) * 2 + id) +
      0.2 * Math.cos(t / 3600000 / 7);
    const missing = grain === "hour" && buckets.length === 3;

    buckets.push({
      t,
      end,
      inBytes: missing ? null : Math.round((base[0] / 720) * weight * hours),
      outBytes: missing
        ? null
        : Math.round((base[1] / 720) * (weight * 0.85 + 0.15) * hours),
      hours: missing ? 0 : hours,
      partial: missing,
      current,
    });
  }

  return { since, until: recordedAt, grain, tzOffset: offset, buckets };
}
