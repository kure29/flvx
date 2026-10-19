import type { Node } from "@/pages/node/types";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Pin } from "lucide-react";

import { getConfigByName, setNodeLatencyTargets } from "@/api";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@/shadcn-bridge/heroui/modal";
import {
  LATENCY_TARGETS_KEY,
  type LatencyTarget,
  parseLatencyTargets,
} from "@/utils/latency-targets";

const MAX_PINNED = 3;

/**
 * Chooses which reference points one or more nodes measure: the defaults,
 * or their own selection with up to three pinned for cards.
 */
export function LatencyTargetsModal({
  nodes,
  onClose,
  onSaved,
}: {
  /** Nodes being set; empty closes the dialog. */
  nodes: Node[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pool, setPool] = useState<LatencyTarget[]>([]);
  const [custom, setCustom] = useState(false);
  const [points, setPoints] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const open = nodes.length > 0;
  const batch = nodes.length > 1;

  useEffect(() => {
    if (!open) return;
    getConfigByName(LATENCY_TARGETS_KEY)
      .then((res) =>
        setPool(res.code === 0 ? parseLatencyTargets(res.data?.value) : []),
      )
      .catch(() => setPool([]));
    // One node starts from its own setting; a batch from the defaults.
    const own = !batch ? nodes[0].latencyTargets : null;

    setCustom(Boolean(own));
    setPoints(own?.points ?? []);
    setPinned(own?.pinned ?? []);
  }, [open, nodes, batch]);

  const defaults = pool.filter((t) => t.enabled);

  const startCustom = () => {
    if (points.length === 0) {
      setPoints(defaults.map((t) => t.name));
      setPinned(defaults.filter((t) => t.pinned).map((t) => t.name));
    }
    setCustom(true);
  };

  const toggle = (name: string, on: boolean) => {
    setPoints((prev) =>
      on ? [...prev, name] : prev.filter((n) => n !== name),
    );
    if (!on) setPinned((prev) => prev.filter((n) => n !== name));
  };

  const togglePin = (name: string) =>
    setPinned((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : prev.length < MAX_PINNED
          ? [...prev, name]
          : prev,
    );

  const save = async () => {
    if (custom && points.length === 0) {
      toast.error("至少选一个测试点");

      return;
    }
    setSaving(true);
    try {
      const res = await setNodeLatencyTargets({
        ids: nodes.map((n) => n.id),
        custom,
        // Keep pool order.
        points: pool.map((t) => t.name).filter((n) => points.includes(n)),
        pinned,
      });

      if (res.code !== 0) {
        toast.error(res.msg || "保存失败");

        return;
      }
      toast.success(batch ? `已设置 ${nodes.length} 个节点` : "已保存");
      onSaved();
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const modeButton = (on: boolean, label: string, onPress: () => void) => (
    <button
      className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
        on
          ? "bg-content1 font-medium shadow-sm"
          : "text-default-500 hover:text-default-700"
      }`}
      type="button"
      onClick={onPress}
    >
      {label}
    </button>
  );

  return (
    <Modal
      backdrop="blur"
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
      }}
      isOpen={open}
      placement="center"
      scrollBehavior="inside"
      size="lg"
      onOpenChange={(v) => !v && onClose()}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold">
            {batch ? `为 ${nodes.length} 个节点设置测试点` : "测试点"}
          </h2>
          <p className="truncate text-xs font-normal text-default-500">
            {nodes.map((n) => n.name).join("、")}
          </p>
        </ModalHeader>
        <ModalBody className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-default-100 p-1">
            {modeButton(!custom, "跟随默认", () => setCustom(false))}
            {modeButton(custom, "自定义", startCustom)}
          </div>

          {pool.length === 0 ? (
            <p className="py-4 text-center text-sm text-default-500">
              还没有测试点，请先到网站配置添加
            </p>
          ) : !custom ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-xs text-default-500">
                测网站配置里打开“默认”的测试点，那边改了这里跟着变：
              </p>
              <div className="flex flex-wrap gap-1.5">
                {defaults.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 rounded-full bg-default-100 px-2 py-0.5 text-xs"
                  >
                    {t.pinned && <Pin className="h-3 w-3 text-primary" />}
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-default-500">
                <span>
                  已选 {points.length} 个 · 卡片显示 {pinned.length}/
                  {MAX_PINNED}
                </span>
                <span className="flex gap-3">
                  <button
                    className="text-primary"
                    type="button"
                    onClick={() => setPoints(pool.map((t) => t.name))}
                  >
                    全选
                  </button>
                  <button
                    className="text-primary"
                    type="button"
                    onClick={() => {
                      setPoints([]);
                      setPinned([]);
                    }}
                  >
                    清空
                  </button>
                </span>
              </div>
              <div className="divide-y divide-divider rounded-lg border border-divider">
                {pool.map((t) => {
                  const on = points.includes(t.name);
                  const pin = pinned.includes(t.name);

                  return (
                    <div
                      key={t.name}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      <Checkbox
                        isSelected={on}
                        size="sm"
                        onValueChange={(v) => toggle(t.name, v)}
                      >
                        <span className="text-sm">{t.name}</span>
                      </Checkbox>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-default-400">
                        {t.host}:{t.port}
                      </span>
                      <button
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-30 ${
                          pin
                            ? "bg-primary/10 text-primary"
                            : "text-default-400 hover:text-default-600"
                        }`}
                        disabled={!on || (!pin && pinned.length >= MAX_PINNED)}
                        title="卡片上固定显示"
                        type="button"
                        onClick={() => togglePin(t.name)}
                      >
                        <Pin className="h-3 w-3" />
                        卡片
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {batch && (
            <p className="text-xs text-warning-600">
              保存后会覆盖这些节点原来的测试点设置。
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            取消
          </Button>
          <Button
            color="primary"
            isDisabled={pool.length === 0}
            isLoading={saving}
            onPress={save}
          >
            保存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
