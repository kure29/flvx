import type { NodeQualityData, NodeQualityStats } from "@/api/types";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowDownUp,
  ArrowLeftRight,
  CheckCircle2,
  ChartLine,
  Clock3,
  Download,
  Link2,
  RefreshCw,
  RotateCcw,
  Search,
  Signal,
  TriangleAlert,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";

import { getNodeQuality } from "@/api";
import { cn } from "@/lib/utils";
import { latencyChartScale } from "@/pages/node/latency-chart-scale";
import {
  analyticsButton,
  analyticsDate,
  AnalyticsState,
  saveChartImage,
} from "@/pages/node/analytics-chart";

const colors = [
  "#a78bfa",
  "#f87171",
  "#84cc16",
  "#60a5fa",
  "#fbbf24",
  "#22d3ee",
  "#fb923c",
  "#e879f9",
  "#34d399",
  "#818cf8",
  "#f472b6",
  "#a3a3a3",
];
const ranges = [
  [1, "1h"],
  [6, "6h"],
  [24, "24h"],
  [168, "7d"],
  [720, "30d"],
] as const;
const numberLabel = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(n);
const statLabel = (
  s: NodeQualityStats | undefined,
  key: keyof NodeQualityStats,
) => numberLabel(s?.[key]);

function QualityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: {
    dataKey: string;
    name: string;
    hide?: boolean;
    value: number | null;
    color: string;
    payload: Record<string, number | null>;
  }[];
  label?: number;
}) {
  // Keep missing samples while excluding hidden lines, independently of filterNull.
  const visiblePayload = payload?.filter((point) => point.hide !== true);

  if (!active || !visiblePayload?.length || label == null) return null;

  return (
    <div className="min-w-48 max-w-[calc(100vw-4rem)] rounded-xl border border-divider bg-content1 p-3 text-xs shadow-xl">
      <p className="mb-2 text-default-500">{analyticsDate(label)}</p>
      {visiblePayload.map((p) => {
        const loss = p.payload[`${p.dataKey}loss`];

        return (
          <div
            key={p.dataKey}
            className="mt-1.5 flex items-center justify-between gap-3"
          >
            <span className="flex min-w-0 items-center gap-1.5 break-words">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              {p.name}
            </span>
            <span className="shrink-0 font-mono">
              {p.value == null
                ? loss == null
                  ? "未采集"
                  : "无响应"
                : `${numberLabel(p.value)} ms`}
              <span className="ml-2 text-default-500">
                {loss == null
                  ? "缺少采样"
                  : loss > 0
                    ? `丢包 ${loss}%`
                    : "良好"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function NodeNetworkQuality({
  nodeId,
  nodeName,
  variant = "detail",
}: {
  nodeId: number;
  nodeName: string;
  /** The modal shares the trend and anomaly analysis without the page overview. */
  variant?: "detail" | "trend";
}) {
  const trendOnly = variant === "trend";
  const [hours, setHours] = useState(24);
  const [interval, setIntervalMinutes] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [hiddenLines, setHiddenLines] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [worst, setWorst] = useState(false);
  const [connect, setConnect] = useState(true);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<NodeQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltipPortal, setTooltipPortal] = useState<HTMLDivElement | null>(
    null,
  );
  const [compactChart, setCompactChart] = useState(
    () => window.matchMedia("(max-width: 639px)").matches,
  );
  const chart = useRef<HTMLDivElement>(null);
  const chartViewport = useRef<HTMLDivElement>(null);
  const chartScrollLeft = useRef<number | null>(null);
  const chartPan = useRef<{
    pointerId: number;
    x: number;
    left: number;
  } | null>(null);
  const chartScrollHint = useId();
  const drag = useRef<number | null>(null);
  const graph = useRef<HTMLDivElement>(null);
  const worstNames = useMemo(
    () =>
      [...(data?.points ?? [])]
        .sort(
          (a, b) =>
            (b.summary.lossPct ?? -1) - (a.summary.lossPct ?? -1) ||
            b.avgMs - a.avgMs,
        )
        .slice(0, 10)
        .map((p) => p.name),
    [data],
  );
  const targets = selected.length ? selected : worst ? worstNames : [];
  const targetsKey = JSON.stringify(targets);

  useEffect(() => setHiddenLines([]), [nodeId]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setCompactChart(query.matches);

    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    void getNodeQuality(
      nodeId,
      hours,
      interval,
      JSON.parse(targetsKey) as string[],
    )
      .then((res) => {
        if (cancelled) return;
        if (res.code !== 0 || !res.data || !Array.isArray(res.data.points))
          throw new Error(res.msg || "加载网络质量失败");
        setData(res.data);
        const available = new Set(res.data.points.map((point) => point.name));

        setSelected((current) =>
          current.every((name) => available.has(name))
            ? current
            : current.filter((name) => available.has(name)),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "加载网络质量失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nodeId, hours, interval, targetsKey, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => setRevision((v) => v + 1), 60000);

    return () => window.clearInterval(timer);
  }, []);

  // Refreshing replaces the chart while loading; keep the user's position.
  // A new range starts at the latest samples on narrow screens.
  useLayoutEffect(() => {
    const viewport = chartViewport.current;

    if (viewport) {
      viewport.scrollLeft = chartScrollLeft.current ?? viewport.scrollWidth;
    }
  }, [data, loading, compactChart, zoom]);

  const shown = (data?.points ?? []).flatMap((point, index) =>
    !targets.length || targets.includes(point.name)
      ? [{ point, index, color: colors[index % colors.length] }]
      : [],
  );
  const visible = shown.filter(
    ({ point }) => !hiddenLines.includes(point.name),
  );
  const targetList = worst
    ? (data?.points ?? [])
        .filter((p) => worstNames.includes(p.name))
        .sort((a, b) => worstNames.indexOf(a.name) - worstNames.indexOf(b.name))
    : (data?.points ?? []);
  const chartRows = useMemo(() => {
    if (!data) return [];
    const rows = new Map<number, Record<string, number | null>>();
    const expected = Math.max(data.intervalMs, data.probeIntervalMs);

    data.points.forEach((point, index) => {
      let previous: number | null = null;

      point.samples.forEach((sample) => {
        if (previous != null && sample.t - previous > expected * 1.6) {
          const t = previous + expected;

          rows.set(t, rows.get(t) ?? { t });
        }
        const row = rows.get(sample.t) ?? { t: sample.t };

        row[`s${index}`] = sample.ms;
        row[`s${index}loss`] = sample.lossPct;
        rows.set(sample.t, row);
        previous = sample.t;
      });
    });

    return [...rows.values()].sort((a, b) => Number(a.t) - Number(b.t));
  }, [data]);
  const plotted = zoom
    ? chartRows.filter(
        (row) => Number(row.t) >= zoom[0] && Number(row.t) <= zoom[1],
      )
    : chartRows;
  const yAxis = latencyChartScale(
    plotted.flatMap((row) => visible.map(({ index }) => row[`s${index}`])),
  );
  const yAxisProps = {
    allowDataOverflow: true,
    axisLine: false,
    domain: [0, yAxis.max],
    interval: 0,
    stroke: "var(--default-500)",
    tick: { fontSize: 11 },
    tickFormatter: (value: number) => `${value} ms`,
    tickLine: false,
    ticks: yAxis.ticks,
    width: 64,
  };
  const summary = data?.summary;
  const rangeLabel = ranges.find(([h]) => h === hours)?.[1];
  const refresh = () => setRevision((v) => v + 1);
  const toggleLine = (name: string) => {
    setHiddenLines((current) =>
      current.includes(name)
        ? current.filter((line) => line !== name)
        : [...current, name],
    );
  };
  const resetZoom = () => {
    chartScrollLeft.current = null;
    setZoom(null);
    setFocus(null);
    setSelection(null);
    drag.current = null;
  };
  const centerChartViewport = () => {
    const viewport = chartViewport.current;

    if (viewport)
      chartScrollLeft.current =
        (viewport.scrollWidth - viewport.clientWidth) / 2;
  };
  const chooseTarget = (name: string) => {
    setSelected((current) =>
      compare || trendOnly
        ? current.includes(name)
          ? current.filter((n) => n !== name)
          : [...current, name]
        : current.length === 1 && current[0] === name
          ? []
          : [name],
    );
    resetZoom();
  };
  const finishZoom = () => {
    if (
      selection &&
      Math.abs(selection[1] - selection[0]) >= (data?.intervalMs ?? 1)
    ) {
      centerChartViewport();
      setZoom([Math.min(...selection), Math.max(...selection)]);
      setFocus(null);
    }
    setSelection(null);
    drag.current = null;
  };

  return (
    <div aria-busy={loading} className="space-y-4">
      {!trendOnly && (
        <>
          <section className="flex items-center gap-3 rounded-2xl border border-divider bg-content1 px-4 py-4">
            <span className="p-1 text-default-500">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">网络质量</h2>
              <p className="mt-1 text-xs text-default-500">
                单节点网络质量分析：延迟、抖动、丢包与成功率
              </p>
            </div>
          </section>

          <section
            aria-label="网络质量概览"
            className="overflow-hidden rounded-2xl border border-divider bg-content1"
          >
            <div className="flex items-center justify-between border-b border-divider px-5 py-3.5">
              <h3 className="text-sm font-semibold">
                概览{" "}
                <span className="ml-1 font-normal text-default-500">
                  {rangeLabel}
                </span>
              </h3>
              <button
                aria-label="刷新网络质量"
                className={analyticsButton()}
                disabled={loading}
                type="button"
                onClick={refresh}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
              {(
                [
                  [Clock3, "平均延迟", "avgMs", "ms"],
                  [ArrowDownUp, "抖动", "jitterMs", "ms"],
                  [Signal, "平均丢包率", "lossPct", "%"],
                  [CheckCircle2, "平均成功率", "successPct", "%"],
                ] as const
              ).map(([Icon, label, key, unit]) => (
                <div
                  key={key}
                  className="rounded-lg bg-default-50 p-3.5"
                  title={
                    key === "jitterMs"
                      ? "相邻成功探测的延迟差绝对值均值；中断或长时间缺采样不计入"
                      : key === "successPct"
                        ? "探测连接成功比例，等于 100% 减去平均丢包率"
                        : undefined
                  }
                >
                  <p className="flex items-center gap-2 text-xs text-default-500">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </p>
                  <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
                    {statLabel(summary, key)}
                    <span className="ml-1.5 text-xs font-normal text-default-500">
                      {unit}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {error || (!data && loading) || !data?.points.length ? (
        <section className="rounded-2xl border border-divider bg-content1">
          <AnalyticsState
            empty="暂无网络质量记录。在节点的测试点设置中启用监控目标后，在线节点会定时采集延迟与丢包数据。"
            error={error}
            loading={loading}
            onRetry={refresh}
          />
        </section>
      ) : (
        <>
          <div
            className={`grid items-stretch gap-4 ${trendOnly ? "" : "xl:grid-cols-[minmax(240px,1fr)_minmax(0,3fr)]"}`}
          >
            {!trendOnly && (
              <section className="overflow-hidden rounded-2xl border border-divider bg-content1">
                <div className="border-b border-divider px-4 py-4">
                  <h3 className="text-sm font-semibold">
                    监控目标{" "}
                    <span className="ml-1 text-xs font-normal text-default-500">
                      {data.points.length} 个
                    </span>
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-default-500">
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        checked={worst}
                        className="accent-primary"
                        type="checkbox"
                        onChange={(e) => {
                          setWorst(e.target.checked);
                          setSelected([]);
                          resetZoom();
                        }}
                      />
                      只看最差 10
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        checked={compare}
                        className="accent-primary"
                        type="checkbox"
                        onChange={(e) => {
                          setCompare(e.target.checked);
                          setSelected([]);
                          resetZoom();
                        }}
                      />
                      对比模式
                    </label>
                  </div>
                </div>
                <div className="grid max-h-[430px] gap-1 overflow-y-auto p-3 sm:grid-cols-2 xl:grid-cols-1">
                  {targetList.map((point) => (
                    <button
                      key={point.name}
                      aria-pressed={selected.includes(point.name)}
                      className={`min-w-0 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected.includes(point.name) ? "border-primary/60 bg-primary/5" : "border-transparent hover:border-divider hover:bg-default-50"}`}
                      type="button"
                      onClick={() => chooseTarget(point.name)}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 rounded border ${selected.includes(point.name) ? "border-primary bg-primary" : "border-default-300"}`}
                        />
                        <span className="truncate">{point.name}</span>
                        <span className="ml-auto text-[10px] font-normal text-default-500">
                          TCPing
                        </span>
                      </div>
                      <p className="mt-2 flex justify-between text-xs text-default-500">
                        平均延迟{" "}
                        <span className="font-mono text-foreground">
                          {numberLabel(point.summary.avgMs)} ms
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-default-500">
                        丢包 {numberLabel(point.summary.lossPct)}% · 抖动{" "}
                        {numberLabel(point.summary.jitterMs)} ms
                      </p>
                      <div
                        aria-label={`${point.name} 最近采样状态`}
                        className="mt-3 flex h-3 gap-[2px] overflow-hidden"
                      >
                        {point.samples.slice(-40).map((s) => (
                          <span
                            key={s.t}
                            className={`min-w-0 flex-1 rounded-[1px] ${s.ms == null ? "bg-danger" : s.lossPct > 0 ? "bg-warning" : "bg-success"}`}
                            title={`${analyticsDate(s.t)} · ${s.ms == null ? "无响应" : `${s.ms} ms`} · 丢包 ${s.lossPct}%`}
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
                {selected.length > 0 && (
                  <div className="border-t border-divider p-3">
                    <button
                      className={`${analyticsButton()} w-full`}
                      type="button"
                      onClick={() => {
                        setSelected([]);
                        resetZoom();
                      }}
                    >
                      查看全部目标
                    </button>
                  </div>
                )}
              </section>
            )}

            <section
              ref={graph}
              className="min-w-0 overflow-hidden rounded-2xl border border-divider bg-content1"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-3">
                <h3 className="flex w-full min-w-0 items-center gap-2 text-sm font-semibold sm:mr-auto sm:w-auto sm:flex-1">
                  <ChartLine
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-default-500"
                  />
                  趋势
                  <span
                    className="ml-1 min-w-0 truncate text-xs font-normal text-default-500"
                    title={selected.join("、")}
                  >
                    当前：
                    {selected.length > 1
                      ? `${selected.length} 个目标`
                      : selected.length
                        ? selected[0]
                        : worst
                          ? "最差 10 个目标"
                          : "全部目标"}
                  </span>
                </h3>
                <label className="flex items-center gap-2 text-xs text-default-500">
                  数据粒度
                  <select
                    aria-label="数据粒度"
                    className="h-8 rounded-md border border-divider bg-content1 px-2 text-foreground outline-none focus:ring-2 focus:ring-primary"
                    value={interval}
                    onChange={(e) => {
                      setIntervalMinutes(Number(e.target.value));
                      resetZoom();
                    }}
                  >
                    <option value={0}>默认</option>
                    <option value={1}>1 分钟</option>
                    <option value={5}>5 分钟</option>
                  </select>
                </label>
                <button
                  aria-label="连接缺失点"
                  aria-pressed={connect}
                  className={cn(analyticsButton(connect), "w-8 px-0")}
                  title="连接缺失点"
                  type="button"
                  onClick={() => setConnect((value) => !value)}
                >
                  <Link2 aria-hidden="true" className="h-4 w-4" />
                </button>
                <div
                  aria-label="网络质量时间范围"
                  className="grid w-full min-w-0 grid-cols-5 gap-1 sm:flex sm:w-auto sm:items-center"
                >
                  {ranges.map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={hours === value}
                      className={cn(
                        analyticsButton(hours === value),
                        "min-w-0 px-0 sm:px-3",
                      )}
                      type="button"
                      onClick={() => {
                        setHours(value);
                        resetZoom();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {trendOnly && (
                <div
                  aria-label="选择对比目标"
                  className="flex flex-wrap gap-1.5 px-4 pt-3"
                >
                  <button
                    aria-pressed={!selected.length}
                    className={analyticsButton(!selected.length)}
                    type="button"
                    onClick={() => {
                      setSelected([]);
                      resetZoom();
                    }}
                  >
                    全部目标
                  </button>
                  {data.points.map((point, i) => (
                    <button
                      key={point.name}
                      aria-pressed={selected.includes(point.name)}
                      className={analyticsButton(selected.includes(point.name))}
                      type="button"
                      onClick={() => chooseTarget(point.name)}
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: colors[i % colors.length] }}
                      />
                      {point.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-1.5 px-4 pt-3">
                {trendOnly && (
                  <button
                    aria-label="刷新网络质量"
                    className={`${analyticsButton()} mr-auto`}
                    disabled={loading}
                    type="button"
                    onClick={refresh}
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                    />
                    刷新
                  </button>
                )}
                <button
                  aria-label="区域缩放"
                  aria-pressed={zoomMode}
                  className={cn(analyticsButton(zoomMode), "w-8 px-0")}
                  title="开启后在图表上拖动选择时间区间"
                  type="button"
                  onClick={() => setZoomMode((v) => !v)}
                >
                  <Search aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  aria-label="缩放还原"
                  className={cn(analyticsButton(), "w-8 px-0")}
                  disabled={!zoom}
                  title="缩放还原"
                  type="button"
                  onClick={resetZoom}
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  aria-label="保存为图片"
                  className={cn(analyticsButton(), "w-8 px-0")}
                  title="保存为图片"
                  type="button"
                  onClick={() => {
                    if (chart.current)
                      void saveChartImage(
                        chart.current,
                        `${nodeName}-网络质量-${rangeLabel}`,
                      )
                        .then(() => toast.success("图片已保存"))
                        .catch((e: unknown) =>
                          toast.error(
                            e instanceof Error ? e.message : "导出失败",
                          ),
                        );
                  }}
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div ref={chart} className="bg-content1 text-foreground">
                <div
                  aria-label="趋势图图例"
                  className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 pb-1 pt-4 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-4 sm:px-6"
                  role="group"
                >
                  {shown.map(({ point, color }) => {
                    const hidden = hiddenLines.includes(point.name);

                    return (
                      <button
                        key={point.name}
                        aria-label={`${point.name}曲线`}
                        aria-pressed={!hidden}
                        className={cn(
                          "flex min-h-8 min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          hidden ? "text-default-400" : "text-foreground",
                        )}
                        data-chart-legend=""
                        title={`${hidden ? "显示" : "隐藏"} ${point.name}`}
                        type="button"
                        onClick={() => toggleLine(point.name)}
                      >
                        <ChartLine
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                          data-chart-legend-marker=""
                          style={{
                            color: hidden ? "var(--default-400)" : color,
                          }}
                        />
                        <span className="min-w-0 break-words leading-4">
                          {point.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div
                  className="flex items-center gap-1.5 px-4 pt-2 text-[11px] text-default-500 sm:hidden"
                  id={chartScrollHint}
                >
                  <ArrowLeftRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  左右滑动查看曲线，默认显示最新时段
                </div>
                <div className="relative">
                  <div
                    ref={chartViewport}
                    aria-describedby={chartScrollHint}
                    aria-label="延迟趋势图，可左右滑动"
                    className={cn(
                      "overflow-x-auto overscroll-x-contain [scrollbar-width:thin] focus-visible:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary",
                      zoomMode
                        ? "cursor-crosshair"
                        : "cursor-grab active:cursor-grabbing sm:cursor-auto",
                    )}
                    role="region"
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Focus enables keyboard scrolling of the chart viewport.
                    tabIndex={0}
                    onPointerCancel={() => {
                      chartPan.current = null;
                    }}
                    onPointerDown={(event) => {
                      const viewport = event.currentTarget;

                      if (
                        !zoomMode &&
                        event.pointerType === "mouse" &&
                        event.button === 0 &&
                        viewport.scrollWidth > viewport.clientWidth
                      ) {
                        chartPan.current = {
                          pointerId: event.pointerId,
                          x: event.clientX,
                          left: viewport.scrollLeft,
                        };
                      }
                    }}
                    onPointerMove={(event) => {
                      const pan = chartPan.current;

                      if (
                        !pan ||
                        pan.pointerId !== event.pointerId ||
                        Math.abs(event.clientX - pan.x) < 4
                      )
                        return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      event.preventDefault();
                      event.currentTarget.scrollLeft =
                        pan.left - (event.clientX - pan.x);
                    }}
                    onPointerUp={(event) => {
                      chartPan.current = null;
                      if (
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                    }}
                    onScroll={(event) => {
                      chartScrollLeft.current = event.currentTarget.scrollLeft;
                    }}
                  >
                    <div
                      aria-label="网络质量延迟趋势图"
                      className={`${trendOnly ? "h-[280px]" : "h-[320px] sm:h-[360px]"} min-w-[720px] px-1 pb-4 pt-1 sm:min-w-0 sm:px-3 ${zoomMode ? "cursor-crosshair select-none" : ""}`}
                    >
                      <ResponsiveContainer
                        height="100%"
                        initialDimension={{ width: 600, height: 340 }}
                        minHeight={0}
                        minWidth={0}
                        width="100%"
                      >
                        <LineChart
                          accessibilityLayer
                          className="[&>svg]:outline-none"
                          data={plotted}
                          margin={{ top: 16, right: 24, bottom: 12, left: 4 }}
                          onMouseDown={(e: {
                            activeLabel?: number | string;
                          }) => {
                            const t = Number(e?.activeLabel);

                            if (zoomMode && Number.isFinite(t)) {
                              drag.current = t;
                              setSelection([t, t]);
                            }
                          }}
                          onMouseMove={(e: {
                            activeLabel?: number | string;
                          }) => {
                            const t = Number(e?.activeLabel);

                            if (drag.current != null && Number.isFinite(t))
                              setSelection([drag.current, t]);
                          }}
                          onMouseUp={finishZoom}
                        >
                          <CartesianGrid
                            stroke="var(--divider)"
                            strokeDasharray="0"
                            vertical={false}
                          />
                          <XAxis
                            allowDataOverflow
                            axisLine={{ stroke: "var(--divider)" }}
                            dataKey="t"
                            domain={zoom ?? [data.since, data.until]}
                            interval="preserveStartEnd"
                            minTickGap={30}
                            stroke="var(--default-500)"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(t: number) =>
                              analyticsDate(t, hours >= 168)
                            }
                            tickLine={false}
                            type="number"
                          />
                          <YAxis {...yAxisProps} />
                          <Tooltip
                            content={<QualityTooltip />}
                            filterNull={false}
                            includeHidden={false}
                            portal={compactChart ? tooltipPortal : undefined}
                            wrapperStyle={
                              compactChart
                                ? {
                                    position: "absolute",
                                    top: 12,
                                    right: 8,
                                    zIndex: 20,
                                    pointerEvents: "none",
                                  }
                                : undefined
                            }
                          />
                          {shown.map(({ point, index, color }) => (
                            <Line
                              key={point.name}
                              activeDot={{ r: 4 }}
                              connectNulls={connect}
                              dataKey={`s${index}`}
                              dot={false}
                              hide={hiddenLines.includes(point.name)}
                              isAnimationActive={false}
                              name={point.name}
                              stroke={color}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              type="monotoneX"
                            />
                          ))}
                          {selection && (
                            <ReferenceArea
                              fill="var(--primary)"
                              fillOpacity={0.12}
                              stroke="var(--primary)"
                              x1={Math.min(...selection)}
                              x2={Math.max(...selection)}
                            />
                          )}
                          {focus != null && (
                            <ReferenceLine
                              label={{
                                value: "异常时间",
                                position: "insideTopRight",
                                fill: "var(--warning)",
                                fontSize: 11,
                              }}
                              stroke="var(--warning)"
                              strokeDasharray="4 4"
                              x={focus}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div
                    aria-hidden="true"
                    className={`${trendOnly ? "h-[280px]" : "h-[320px]"} pointer-events-none absolute left-0 top-0 z-10 w-[72px] overflow-hidden bg-content1 px-1 pb-4 pt-1 sm:hidden`}
                  >
                    <ResponsiveContainer
                      height="100%"
                      initialDimension={{ width: 96, height: 260 }}
                      width={96}
                    >
                      <LineChart
                        accessibilityLayer={false}
                        data={[{ t: 0 }]}
                        margin={{ top: 16, right: 24, bottom: 42, left: 4 }}
                      >
                        <XAxis hide dataKey="t" domain={[0, 1]} type="number" />
                        <YAxis {...yAxisProps} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    ref={setTooltipPortal}
                    className="pointer-events-none absolute inset-0 z-20 sm:hidden"
                  />
                </div>
              </div>
              <p className="border-t border-divider px-4 py-3 text-[11px] text-default-500">
                每 {Math.round(data.probeIntervalMs / 60000)} 分钟采集一次 ·
                粒度仅合并已有采样 · 抖动为相邻成功探测的延迟差均值
                {zoom && " · 正在查看缩放区间"}
              </p>
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border border-divider bg-content1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="h-4 w-4 text-default-500" />
                异常摘要
              </h3>
              <span className="text-xs text-default-500">
                {analyticsDate(data.since)} — {analyticsDate(data.until)} ·
                点击可定位到主图时间点
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
              {(
                [
                  ["P50", "p50Ms"],
                  ["P95", "p95Ms"],
                  ["P99", "p99Ms"],
                  ["样本", "sampleCount"],
                ] as const
              ).map(([label, key]) => (
                <div key={key} className="rounded-lg bg-default-50 px-4 py-3">
                  <p className="text-xs text-default-500">{label}</p>
                  <p className="mt-2 font-mono text-lg font-semibold">
                    {statLabel(summary, key)}
                    {key !== "sampleCount" && (
                      <span className="ml-1 text-xs font-normal text-default-500">
                        ms
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-divider border-t border-divider">
              {data.events.map((event) => (
                <button
                  key={event.kind}
                  className="flex w-full flex-col items-start gap-2 px-5 py-4 text-left text-xs hover:bg-default-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  type="button"
                  onClick={() => {
                    setHiddenLines((current) =>
                      current.filter((name) => name !== event.name),
                    );
                    setFocus(event.t);
                    centerChartViewport();
                    const window = Math.max(
                      data.intervalMs * 4,
                      Math.min((hours * 3600000) / 6, 3600000),
                    );

                    setZoom([
                      Math.max(data.since, event.t - window),
                      Math.min(data.until, event.t + window),
                    ]);
                    graph.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.kind === "loss" ? "bg-danger" : "bg-warning"}`}
                    />
                    <span>
                      {event.kind === "latency" ? "最高延迟" : "最高丢包"}：
                      {event.name}{" "}
                      <span className="font-mono">
                        {event.kind === "latency"
                          ? `${numberLabel(event.ms)} ms`
                          : `${event.lossPct}%`}
                      </span>
                      {event.kind === "latency" &&
                        summary?.p95Ms != null &&
                        event.ms != null &&
                        event.ms > summary.p95Ms && (
                          <span className="ml-1 text-default-500">
                            （高于 P95 {summary.p95Ms} ms）
                          </span>
                        )}
                    </span>
                  </span>
                  <span className="shrink-0 self-end text-default-500 sm:self-auto">
                    {analyticsDate(event.t)}
                  </span>
                </button>
              ))}
              <p className="px-5 py-4 text-xs text-default-500">
                {data.events.length
                  ? "暂无更多明显异常"
                  : "所选目标暂无异常记录"}
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
