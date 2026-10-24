import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/shadcn-bridge/heroui/button";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import { Spinner } from "@/shadcn-bridge/heroui/spinner";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { nodeTune, type NodeTuneLine, type NodeTuneStatus } from "@/api";

const mb = (bytes: number) => `${Math.round((bytes / 1048576) * 10) / 10} MB`;

/** The typed line, or null while it is not a valid one. */
function parseLine(bw: string, rtt: string): NodeTuneLine | null {
  const b = Number(bw);
  const r = Number(rtt);

  if (!Number.isInteger(b) || !Number.isInteger(r)) return null;
  if (b < 1 || b > 100000 || r < 1 || r > 2000) return null;

  return { bandwidthMbps: b, rttMs: r };
}

/**
 * 节点调优: shows the node's current network parameters next to the
 * recommended ones; the checked groups are applied by the agent (sysctl,
 * kept across reboots), unchecked ones go back to their original values.
 */
export function NodeTuneModal({
  node,
  onClose,
}: {
  node: { id: number; name: string } | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<NodeTuneStatus | null>(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"" | "apply" | "restore">("");
  const [detail, setDetail] = useState<string | null>(null);
  // Bandwidth (Mbps) and RTT (ms) as typed; the agent sizes buffers for them.
  const [bw, setBw] = useState("");
  const [rtt, setRtt] = useState("");
  const line = parseLine(bw, rtt);
  const lineSupported = Boolean(status?.params);

  useEffect(() => {
    if (!node) return;
    setStatus(null);
    setError("");
    setDetail(null);
    nodeTune(node.id, "status")
      .then((res) => {
        if (res.code !== 0 || !res.data) {
          setError(res.msg || "读取服务器状态失败");

          return;
        }
        setStatus(res.data);
        if (res.data.params) {
          setBw(String(res.data.params.bandwidthMbps));
          setRtt(String(res.data.params.rttMs));
        }
        // Everything checked by default, as recommended.
        setChosen(new Set(res.data.groups.map((g) => g.id)));
      })
      .catch(() => setError("读取服务器状态失败"));
  }, [node]);

  // A changed line changes the targets: ask the agent again, after typing
  // settles.
  useEffect(() => {
    if (!node || !line || !status?.params) return;
    const p = status.params;

    if (p.bandwidthMbps === line.bandwidthMbps && p.rttMs === line.rttMs)
      return;
    const timer = window.setTimeout(() => {
      void nodeTune(node.id, "status", [], line).then((res) => {
        if (res.code === 0 && res.data) setStatus(res.data);
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [node, line?.bandwidthMbps, line?.rttMs]);

  const run = async (action: "apply" | "restore") => {
    if (!node) return;
    setBusy(action);
    try {
      const res = await nodeTune(
        node.id,
        action,
        [...chosen],
        lineSupported && line ? line : undefined,
      );

      if (res.code !== 0 || !res.data) {
        toast.error(res.msg || "调优失败");

        return;
      }
      setStatus(res.data);
      (res.data.warnings || []).forEach((w) => toast(w, { icon: "⚠️" }));
      toast.success(action === "apply" ? "已应用，立即生效" : "已恢复默认");
      if (action === "restore") {
        setChosen(new Set());
      }
    } catch {
      toast.error("调优失败");
    } finally {
      setBusy("");
    }
  };

  const toggle = (id: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);

      if (on) next.add(id);
      else next.delete(id);

      return next;
    });

  return (
    <Modal
      backdrop="blur"
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
      }}
      isOpen={Boolean(node)}
      placement="center"
      scrollBehavior="inside"
      size="2xl"
      onOpenChange={(open) => !open && onClose()}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">服务器调优</h2>
              <p className="text-sm font-normal text-default-500">
                {node?.name}
                {status &&
                  ` · 内核 ${status.kernel || "未知"} · 拥塞控制 ${status.congestion || "未知"}`}
              </p>
            </ModalHeader>
            <ModalBody>
              {error ? (
                <p className="py-6 text-center text-sm text-danger">{error}</p>
              ) : !status ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-default-500">
                    勾选的项目写入系统配置并立即生效，重启后保持；取消勾选的会恢复成调优前的值。
                  </p>
                  {lineSupported ? (
                    <div className="space-y-1.5 rounded-xl border border-divider px-3 py-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          endContent={
                            <span className="text-xs text-default-400">
                              Mbps
                            </span>
                          }
                          inputMode="numeric"
                          label="带宽"
                          size="sm"
                          value={bw}
                          variant="bordered"
                          onChange={(e) =>
                            setBw(e.target.value.replace(/\D/g, ""))
                          }
                        />
                        <Input
                          endContent={
                            <span className="text-xs text-default-400">ms</span>
                          }
                          inputMode="numeric"
                          label="主要线路延迟"
                          size="sm"
                          value={rtt}
                          variant="bordered"
                          onChange={(e) =>
                            setRtt(e.target.value.replace(/\D/g, ""))
                          }
                        />
                      </div>
                      {!line ? (
                        <p className="text-xs text-danger">
                          带宽填 1–100000 Mbps，延迟填 1–2000 ms
                        </p>
                      ) : (
                        status.sizes && (
                          <p className="text-xs text-default-500">
                            按服务器的套餐带宽和到主要用户的延迟（比如跨境约
                            150ms）计算缓冲区。内存 {status.sizes.ramMb} MB ·
                            缓冲区上限 {mb(status.sizes.bufMax)}（
                            {status.sizes.bufReason}）
                          </p>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-warning-600">
                      这台服务器的 agent
                      较旧，缓冲区用固定值；升级后可以按带宽和延迟计算
                    </p>
                  )}
                  {status.groups.map((g) => {
                    const supported = g.settings.some((s) => s.supported);

                    return (
                      <div
                        key={g.id}
                        className="rounded-xl border border-divider px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            isDisabled={!supported}
                            isSelected={chosen.has(g.id) && supported}
                            size="sm"
                            onValueChange={(on) => toggle(g.id, on)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium">
                                {g.name}
                              </span>
                              {g.applied ? (
                                <Chip color="success" size="sm" variant="flat">
                                  已生效
                                </Chip>
                              ) : !supported ? (
                                <Chip size="sm" variant="flat">
                                  系统不支持
                                </Chip>
                              ) : null}
                              <button
                                className="ml-auto text-xs text-primary"
                                type="button"
                                onClick={() =>
                                  setDetail(detail === g.id ? null : g.id)
                                }
                              >
                                {detail === g.id ? "收起" : "参数"}
                              </button>
                            </div>
                            <p className="text-xs text-default-500">{g.desc}</p>
                            {detail === g.id && (
                              <div className="mt-2 space-y-0.5 font-mono text-[11px] text-default-600">
                                {g.settings.map((s) => (
                                  <div key={s.key} className="break-all">
                                    {s.key}:{" "}
                                    {s.supported ? (
                                      <>
                                        <span
                                          className={s.ok ? "text-success" : ""}
                                        >
                                          {s.current}
                                        </span>
                                        {!s.ok && ` → ${s.target}`}
                                      </>
                                    ) : (
                                      <span className="text-default-400">
                                        不支持
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              {status?.hasBackup && (
                <Button
                  className="mr-auto"
                  isDisabled={busy !== ""}
                  isLoading={busy === "restore"}
                  variant="light"
                  onPress={() => run("restore")}
                >
                  恢复默认
                </Button>
              )}
              <Button variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="primary"
                isDisabled={
                  !status ||
                  chosen.size === 0 ||
                  busy !== "" ||
                  (lineSupported && !line)
                }
                isLoading={busy === "apply"}
                onPress={() => run("apply")}
              >
                应用
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
