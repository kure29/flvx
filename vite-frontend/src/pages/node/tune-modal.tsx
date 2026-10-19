import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/shadcn-bridge/heroui/button";
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
import { nodeTune, type NodeTuneStatus } from "@/api";

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

  useEffect(() => {
    if (!node) return;
    setStatus(null);
    setError("");
    setDetail(null);
    nodeTune(node.id, "status")
      .then((res) => {
        if (res.code !== 0 || !res.data) {
          setError(res.msg || "读取节点状态失败");

          return;
        }
        setStatus(res.data);
        // Everything checked by default, as recommended.
        setChosen(new Set(res.data.groups.map((g) => g.id)));
      })
      .catch(() => setError("读取节点状态失败"));
  }, [node]);

  const run = async (action: "apply" | "restore") => {
    if (!node) return;
    setBusy(action);
    try {
      const res = await nodeTune(node.id, action, [...chosen]);

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
              <h2 className="text-xl font-bold">节点调优</h2>
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
                关闭
              </Button>
              <Button
                color="primary"
                isDisabled={!status || chosen.size === 0 || busy !== ""}
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
