import type { InboundApiItem, InboundRelayApiItem } from "@/api/types";
import type { ReactNode } from "react";

import { ArrowRight, Circle, Plus } from "lucide-react";

import { Button } from "@/shadcn-bridge/heroui/button";
import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";
import { Chip } from "@/shadcn-bridge/heroui/chip";

/** The destination is already shown at the other end of the path. */
function relayLabel(line: InboundRelayApiItem): string {
  const full = line.name || line.tunnelName || "中转";
  const cut = full.lastIndexOf(" → ");

  return cut > 0 ? full.slice(0, cut) : full;
}

function ForwardStatus({ line }: { line: InboundRelayApiItem }) {
  const text = !line.forwardExists
    ? "转发已删除"
    : line.forwardStatus !== 1
      ? "转发已暂停"
      : "转发正常";
  const color = !line.forwardExists
    ? "text-danger"
    : line.forwardStatus !== 1
      ? "text-warning"
      : "text-success";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 text-sm font-medium sm:border-r sm:border-divider sm:pr-3 ${color}`}
    >
      <Circle aria-hidden="true" className="h-2 w-2 fill-current" />
      {text}
    </span>
  );
}

export function RelayLandingCard({
  inbound,
  lines,
  renderLatency,
  onManage,
}: {
  inbound: InboundApiItem;
  lines: InboundRelayApiItem[];
  renderLatency: (line: InboundRelayApiItem) => ReactNode;
  onManage: () => void;
}) {
  const empty = lines.length === 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-3 md:p-5 md:pb-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="min-w-0 break-all text-xl font-semibold leading-6 sm:text-2xl sm:leading-7">
              {inbound.name}
            </h3>
            <Chip
              className="shrink-0 px-2.5 py-0.5 text-xs"
              size="sm"
              variant="flat"
            >
              {lines.length} 条中转
            </Chip>
            {inbound.relayOnly && (
              <Chip
                className="shrink-0 px-2.5 py-0.5 text-xs"
                size="sm"
                variant="flat"
              >
                仅中转
              </Chip>
            )}
          </div>
          <p className="break-all text-sm text-default-500">
            {inbound.external
              ? "来源：导入的节点"
              : `所属节点：${inbound.nodeName || "未关联节点"}`}
          </p>
        </div>
        <Button
          aria-label={`${empty ? "添加中转" : "管理中转"} · ${inbound.name}`}
          className="h-8 min-w-0 shrink-0 px-2 text-sm"
          color="primary"
          size="sm"
          startContent={
            empty ? (
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            ) : undefined
          }
          variant="light"
          onPress={onManage}
        >
          {empty ? "添加中转" : "管理"}
        </Button>
      </CardHeader>
      <CardBody className="p-4 pt-0 md:p-5 md:pt-0">
        {empty ? (
          <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-divider bg-default-100/40 px-4 py-4 text-sm text-default-500">
            尚未配置中转
          </div>
        ) : (
          <ul className="space-y-4">
            {lines.map((line) => (
              <li key={line.id} className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg bg-default-100/60 px-4 py-2.5">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-default-500">中转入口</p>
                    <p className="break-all text-base font-medium leading-6">
                      {relayLabel(line)}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-5 w-5 text-default-400"
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-default-500">落地</p>
                    <p className="break-all text-base font-medium leading-6">
                      {inbound.name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider pt-2">
                  <ForwardStatus line={line} />
                  <div className="min-w-0 flex-1 basis-64">
                    {renderLatency(line) ?? (
                      <p className="py-1 text-xs text-default-500">
                        无可用转发
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
