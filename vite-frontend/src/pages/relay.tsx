import type { InboundApiItem, InboundRelayApiItem } from "@/api/types";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { latestProbe } from "@/utils/latest-probe";
import { getInboundList, getInboundRelays, probeInboundRelays } from "@/api";
import { AnimatedPage } from "@/components/animated-page";
import { PageLoadingState } from "@/components/page-state";
import {
  EmptyHint,
  PageHeader,
  PageTabs,
  PageToolbar,
} from "@/components/page-kit";
import { RelayLatencyCell } from "@/components/relay-latency";
import ForwardPage from "@/pages/forward";
import { RelayModal } from "@/pages/inbound/relay-modal";
import TunnelPage from "@/pages/tunnel";
import { TunnelMonitorView } from "@/pages/node/tunnel-monitor-view";
import { RelayLandingCard } from "@/pages/relay/relay-landing-card";
import { Button } from "@/shadcn-bridge/heroui/button";

type RelayTab = "lines" | "tunnels" | "rules" | "quality";

const TAB_KEY = "flvx_relay_tab";

function readTab(): RelayTab {
  try {
    const v = localStorage.getItem(TAB_KEY);

    if (v === "lines" || v === "tunnels" || v === "rules" || v === "quality")
      return v;
  } catch {
    // Remembering the tab is only a convenience.
  }

  return "lines";
}

const TABS: Array<{ key: RelayTab; label: string }> = [
  { key: "lines", label: "线路" },
  { key: "tunnels", label: "隧道" },
  { key: "rules", label: "规则" },
  { key: "quality", label: "质量" },
];

/** Tunnel latency, throughput and errors over time (was 监控 → 隧道). */
function QualityView() {
  return <TunnelMonitorView />;
}

/** Relay lines grouped by the landing they lead to. */
function LinesView() {
  const [loading, setLoading] = useState(true);
  const [inbounds, setInbounds] = useState<InboundApiItem[]>([]);
  const [relays, setRelays] = useState<InboundRelayApiItem[]>([]);
  const [editing, setEditing] = useState<InboundApiItem | null>(null);
  const [onlyWithRelays, setOnlyWithRelays] = useState(false);
  const [query, setQuery] = useState("");

  const [probingIds, setProbingIds] = useState<Set<number>>(new Set());
  const loadingRef = useRef(false);
  // A reload asked for during a silent poll (after an edit) runs after it.
  const reloadRef = useRef(false);

  const load = useCallback(async (silent = false): Promise<void> => {
    if (loadingRef.current) {
      if (!silent) reloadRef.current = true;

      return;
    }
    loadingRef.current = true;
    try {
      const [inRes, relRes] = await Promise.all([
        getInboundList(),
        getInboundRelays(0),
      ]);

      if (inRes.code === 0) setInbounds(inRes.data ?? []);
      if (relRes.code === 0) {
        setRelays((prev) => {
          const previous = new Map(prev.map((r) => [r.id, r]));

          return (relRes.data ?? []).map((r) => ({
            ...r,
            latency: latestProbe(r.latency, previous.get(r.id)?.latency),
          }));
        });
      }
      if (!silent && (inRes.code !== 0 || relRes.code !== 0))
        toast.error(inRes.msg || relRes.msg || "加载失败");
    } catch {
      if (!silent) toast.error("加载失败");
    } finally {
      loadingRef.current = false;
      setLoading(false);
      if (reloadRef.current) {
        reloadRef.current = false;
        void load(true);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useVisiblePolling(useCallback(() => load(true), [load]));

  /** Measures the given lines (all when empty) and merges the results. */
  const probe = useCallback(
    async (ids: number[]) => {
      const busy = ids.length > 0 ? ids : relays.map((r) => r.id);

      setProbingIds((prev) => new Set([...prev, ...busy]));
      try {
        const res = await probeInboundRelays(ids);

        if (res.code !== 0) {
          toast.error(res.msg || "检测失败");

          return;
        }
        const data = res.data ?? {};

        setRelays((prev) =>
          prev.map((r) =>
            data[String(r.id)]
              ? { ...r, latency: latestProbe(data[String(r.id)], r.latency) }
              : r,
          ),
        );
      } catch {
        toast.error("检测失败");
      } finally {
        setProbingIds((prev) => {
          const next = new Set(prev);

          busy.forEach((id) => next.delete(id));

          return next;
        });
      }
    },
    [relays],
  );

  const latencyOf = (l: InboundRelayApiItem) =>
    l.forwardExists ? (
      <RelayLatencyCell
        latency={l.latency}
        probing={probingIds.has(l.id)}
        variant="summary"
        onProbe={() => probe([l.id])}
      />
    ) : null;

  const byInbound = useMemo(() => {
    const m = new Map<number, InboundRelayApiItem[]>();

    for (const r of relays) {
      m.set(r.inboundId, [...(m.get(r.inboundId) ?? []), r]);
    }

    return m;
  }, [relays]);

  if (loading) return <PageLoadingState message="正在加载..." />;

  const q = query.trim().toLowerCase();
  const shown = inbounds
    .filter(
      (i) =>
        (!onlyWithRelays || (byInbound.get(i.id)?.length ?? 0) > 0) &&
        (!q || i.name.toLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        Number((byInbound.get(b.id)?.length ?? 0) > 0) -
        Number((byInbound.get(a.id)?.length ?? 0) > 0),
    );

  return (
    <div className="space-y-3">
      <PageToolbar
        placeholder="搜索落地名称"
        search={query}
        onSearch={setQuery}
      >
        <Button
          className="shrink-0"
          color={onlyWithRelays ? "primary" : "default"}
          size="sm"
          variant="flat"
          onPress={() => setOnlyWithRelays((v) => !v)}
        >
          只看有中转的
        </Button>
        {relays.length > 0 && (
          <Button
            className="shrink-0"
            isLoading={probingIds.size > 0}
            size="sm"
            variant="flat"
            onPress={() => probe([])}
          >
            测延迟
          </Button>
        )}
      </PageToolbar>

      {shown.length === 0 ? (
        <EmptyHint
          text={
            inbounds.length === 0
              ? "还没有落地。先在“落地”里搭建或导入节点，再回来对接中转"
              : query
                ? "没有匹配的落地"
                : "还没有中转线路"
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {shown.map((i) => {
            const lines = byInbound.get(i.id) ?? [];

            return (
              <RelayLandingCard
                key={i.id}
                inbound={i}
                lines={lines}
                renderLatency={latencyOf}
                onManage={() => setEditing(i)}
              />
            );
          })}
        </div>
      )}

      <RelayModal
        item={editing}
        onChanged={() => load()}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

/** 中转: relay lines per landing, plus the tunnel and rule pages. */
export default function RelayPage() {
  const [tab, setTabState] = useState<RelayTab>(readTab);
  const setTab = (t: RelayTab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // ignore
    }
  };

  return (
    <AnimatedPage className="px-3 py-6 lg:px-6">
      <PageHeader
        description="让客户端先连中转再到落地：线路按落地管理，隧道和规则是底层的转发配置"
        title="中转"
      />
      <PageTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "lines" ? (
        <LinesView />
      ) : tab === "tunnels" ? (
        <TunnelPage embedded />
      ) : tab === "quality" ? (
        <QualityView />
      ) : (
        <ForwardPage embedded />
      )}
    </AnimatedPage>
  );
}
