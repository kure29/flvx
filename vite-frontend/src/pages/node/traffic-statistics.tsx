import type { NodeTrafficData, NodeTrafficGrain } from "@/api/types";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Info, RefreshCw } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getNodeTrafficHistory } from "@/api";
import { formatTraffic } from "@/utils/traffic";
import {
  analyticsButton,
  analyticsDate,
  AnalyticsState,
} from "@/pages/node/analytics-chart";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@/shadcn-bridge/heroui/modal";
import { Button } from "@/shadcn-bridge/heroui/button";

const grains = [
  ["hour", "小时"],
  ["day", "日"],
  ["month", "月"],
] as const;

type TrafficBucket = NodeTrafficData["buckets"][number];

function TrafficTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TrafficBucket }[];
}) {
  const row = payload?.[0]?.payload;

  if (!active || !row) return null;

  return (
    <div className="rounded-xl border border-divider bg-content1 p-3 text-xs shadow-xl">
      <p className="mb-3 text-default-500">
        {analyticsDate(row.t)} — {analyticsDate(row.end)}
      </p>
      <p className="flex justify-between gap-8">
        <span className="text-success">下行</span>
        <span className="font-mono">
          {row.inBytes == null ? "未采集" : formatTraffic(row.inBytes)}
        </span>
      </p>
      <p className="mt-2 flex justify-between gap-8">
        <span className="text-default-500">上行</span>
        <span className="font-mono">
          {row.outBytes == null ? "未采集" : formatTraffic(row.outBytes)}
        </span>
      </p>
      <p className="mt-3 text-default-500">
        {row.current
          ? "当前时段累计中"
          : row.partial
            ? "部分时段未统计，仅显示已采集用量"
            : `已记录 ${row.hours} 个小时`}
      </p>
    </div>
  );
}

export function NodeTrafficStatistics({ nodeId }: { nodeId: number }) {
  const [grain, setGrain] = useState<NodeTrafficGrain>("hour");
  const [kind, setKind] = useState<"line" | "bar">("line");
  const [data, setData] = useState<NodeTrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    void getNodeTrafficHistory(nodeId, grain)
      .then((res) => {
        if (cancelled) return;
        if (res.code !== 0 || !res.data || !Array.isArray(res.data.buckets))
          throw new Error(res.msg || "加载流量统计失败");
        setData(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "加载流量统计失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nodeId, grain, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => setRevision((v) => v + 1), 60000);

    return () => window.clearInterval(timer);
  }, []);

  const totals = useMemo(
    () =>
      (data?.buckets ?? []).reduce(
        (sum, row) => ({
          in: sum.in + (row.inBytes ?? 0),
          out: sum.out + (row.outBytes ?? 0),
          recorded: sum.recorded + Number(row.inBytes != null),
          partial: sum.partial || row.partial,
        }),
        { in: 0, out: 0, recorded: 0, partial: false },
      ),
    [data],
  );
  const max = Math.max(
    0,
    ...(data?.buckets ?? []).flatMap((r) => [r.inBytes ?? 0, r.outBytes ?? 0]),
  );
  const unit =
    max >= 1024 ** 4
      ? { name: "TB", divisor: 1024 ** 4 }
      : max >= 1024 ** 3
        ? { name: "GB", divisor: 1024 ** 3 }
        : max >= 1024 ** 2
          ? { name: "MB", divisor: 1024 ** 2 }
          : { name: "KB", divisor: 1024 };
  const periodLabel =
    grain === "hour"
      ? "最近 24 小时"
      : grain === "day"
        ? "最近 31 天"
        : "最近 12 个月";
  const tickLabel = (t: number) =>
    grain === "hour"
      ? analyticsDate(t, false)
      : new Date(t).toLocaleDateString(
          "zh-CN",
          grain === "month"
            ? { year: "2-digit", month: "2-digit" }
            : { month: "2-digit", day: "2-digit" },
        );
  const refresh = () => setRevision((v) => v + 1);

  return (
    <>
      <section
        aria-busy={loading}
        aria-label="流量统计"
        className="min-w-0 overflow-hidden rounded-2xl border border-divider bg-content1"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3.5 sm:px-5">
          <h3 className="mr-auto flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4 text-default-500" />
            流量统计
            <button
              aria-label="流量历史说明"
              className="rounded p-1 text-default-500 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              type="button"
              onClick={() => setInfo(true)}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </h3>
          <div aria-label="流量统计周期" className="flex gap-1">
            {grains.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={grain === value}
                className={analyticsButton(grain === value)}
                type="button"
                onClick={() => {
                  if (grain !== value) {
                    setGrain(value);
                    setData(null);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div aria-label="流量图表类型" className="flex gap-1">
            <button
              aria-pressed={kind === "line"}
              className={analyticsButton(kind === "line")}
              type="button"
              onClick={() => setKind("line")}
            >
              折线图
            </button>
            <button
              aria-pressed={kind === "bar"}
              className={analyticsButton(kind === "bar")}
              type="button"
              onClick={() => setKind("bar")}
            >
              柱形图
            </button>
          </div>
          <button
            aria-label="刷新流量统计"
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
        {error || !data || !totals.recorded ? (
          <AnalyticsState
            empty="暂无流量历史。节点上报网卡累计流量后开始记录；尚未采集的历史时段会留空。"
            error={error}
            loading={loading}
            onRetry={refresh}
          />
        ) : (
          <>
            <div
              aria-label="流量历史图表"
              className="h-[300px] px-1 pt-5 sm:h-[350px] sm:px-4"
            >
              <ResponsiveContainer
                height="100%"
                initialDimension={{ width: 400, height: 300 }}
                minHeight={0}
                minWidth={0}
                width="100%"
              >
                <ComposedChart
                  accessibilityLayer
                  data={data.buckets}
                  margin={{ top: 8, right: 20, left: 0, bottom: 20 }}
                >
                  <CartesianGrid stroke="var(--divider)" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="t"
                    minTickGap={35}
                    stroke="var(--default-500)"
                    tick={{ fontSize: 11 }}
                    tickFormatter={tickLabel}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    label={{
                      value: unit.name,
                      position: "insideTopLeft",
                      dy: -16,
                      fill: "var(--default-500)",
                      offset: 0,
                      fontSize: 11,
                    }}
                    stroke="var(--default-500)"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) =>
                      new Intl.NumberFormat("zh-CN", {
                        maximumFractionDigits: 1,
                      }).format(v / unit.divisor)
                    }
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip content={<TrafficTooltip />} filterNull={false} />
                  <Legend
                    iconType="circle"
                    verticalAlign="top"
                    wrapperStyle={{ paddingBottom: 24, fontSize: 12 }}
                  />
                  {kind === "line" ? (
                    <>
                      <Area
                        activeDot={{ r: 4 }}
                        connectNulls={false}
                        dataKey="inBytes"
                        fill="var(--chart-download)"
                        fillOpacity={0.12}
                        isAnimationActive={false}
                        name="下行"
                        stroke="var(--chart-download)"
                        strokeWidth={1.8}
                        type="linear"
                      />
                      <Area
                        activeDot={{ r: 4 }}
                        connectNulls={false}
                        dataKey="outBytes"
                        fill="var(--chart-upload)"
                        fillOpacity={0.1}
                        isAnimationActive={false}
                        name="上行"
                        stroke="var(--chart-upload)"
                        strokeWidth={1.8}
                        type="linear"
                      />
                    </>
                  ) : (
                    <>
                      <Bar
                        dataKey="inBytes"
                        fill="var(--chart-download)"
                        isAnimationActive={false}
                        maxBarSize={24}
                        name="下行"
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        dataKey="outBytes"
                        fill="var(--chart-upload)"
                        isAnimationActive={false}
                        maxBarSize={24}
                        name="上行"
                        radius={[3, 3, 0, 0]}
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-divider px-5 py-3 text-xs text-default-500">
              <span>{periodLabel}</span>
              <span>
                下行{" "}
                <span className="font-mono text-success">
                  {formatTraffic(totals.in)}
                </span>
              </span>
              <span>
                上行{" "}
                <span className="font-mono text-foreground">
                  {formatTraffic(totals.out)}
                </span>
              </span>
              <span className="ml-auto">
                {totals.partial && "部分时段未统计 · "}当前时段累计中
              </span>
            </div>
          </>
        )}
      </section>
      <Modal
        isOpen={info}
        scrollBehavior="inside"
        onClose={() => setInfo(false)}
      >
        <ModalContent className="!w-[calc(100%-32px)] sm:!w-full">
          <ModalHeader>流量历史说明</ModalHeader>
          <ModalBody className="space-y-3 text-sm leading-6 text-default-500">
            <ModalDescription asChild>
              <div className="space-y-3 text-sm leading-6 text-default-500">
                <p>
                  按浏览器当前时区展示：小时为最近 24 小时，日为最近 31
                  天，月为最近 12 个月。下行指节点接收，上行指节点发送。
                </p>
                <p>
                  根据 agent
                  上报的网卡累计计数计算增量，按整点记录归属统计，重启后计数归零也会继续累计。已采集但无流量的时段显示
                  0；缺少采样的时段留空，部分缺采样只汇总已记录用量，当前时段为累计中。
                </p>
                <p>
                  小时记录保留 400
                  天；功能启用前及面板停止采集期间的数据无法追溯补齐。统计为节点网卡用量，包含转发之外的系统流量。
                </p>
              </div>
            </ModalDescription>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setInfo(false)}>
              知道了
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
