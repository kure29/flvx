import type { InboundApiItem, SplitCategory } from "@/api/types";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/shadcn-bridge/heroui/button";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Select, SelectItem } from "@/shadcn-bridge/heroui/select";

/** A 分流 rule as edited: domains and IPs are free text. */
export interface SplitRuleForm {
  categories: string[];
  domains: string;
  ips: string;
  action: "direct" | "block" | "proxy";
  /** Target inbound for "proxy". */
  outboundId: string;
}

export const emptySplitRule = (): SplitRuleForm => ({
  categories: [],
  domains: "",
  ips: "",
  action: "proxy",
  outboundId: "",
});

const chipClass = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs transition-colors ${
    on
      ? "border-primary bg-primary text-primary-foreground"
      : "border-divider bg-content1 text-default-600"
  }`;

const countEntries = (v: string) => v.split(/[\s,，]+/).filter(Boolean).length;

/** One line saying what a rule matches and where it sends it. */
function ruleSummary(
  r: SplitRuleForm,
  categories: SplitCategory[],
  target: string,
): { match: string; target: string } {
  const parts = r.categories.map(
    (k) => categories.find((c) => c.key === k)?.label ?? k,
  );
  const domains = countEntries(r.domains);
  const ips = countEntries(r.ips);

  if (domains) parts.push(`${domains} 个域名`);
  if (ips) parts.push(`${ips} 个 IP`);

  return { match: parts.join("、") || "未选择", target };
}

/** 分流 rules of an inbound, tried in order before its default exit. */
export function SplitRulesEditor({
  rules,
  onChange,
  categories,
  targets,
  targetLabel,
}: {
  rules: SplitRuleForm[];
  onChange: (rules: SplitRuleForm[]) => void;
  categories: SplitCategory[];
  /** Inbounds traffic can be sent through. */
  targets: InboundApiItem[];
  targetLabel: (i: InboundApiItem) => string;
}) {
  const update = (i: number, patch: Partial<SplitRuleForm>) =>
    onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => {
    const next = [...rules];

    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const groups = [...new Set(categories.map((c) => c.group))];
  // Rules whose custom domain / IP fields were opened by hand.
  const [customOpen, setCustomOpen] = useState<Set<number>>(new Set());

  return (
    <div className="space-y-3">
      {rules.length === 0 && (
        <div className="rounded-xl border border-dashed border-divider px-4 py-6 text-center text-sm text-default-500">
          还没有分流规则，所有流量走默认出口
        </div>
      )}
      {rules.map((r, i) => {
        const missing =
          r.action === "proxy" &&
          r.outboundId !== "" &&
          !targets.some((t) => String(t.id) === r.outboundId);
        const actionKey = r.action === "proxy" ? r.outboundId || "" : r.action;
        const target =
          r.action === "direct"
            ? "直连"
            : r.action === "block"
              ? "阻断"
              : missing
                ? "已删除的节点"
                : (() => {
                    const t = targets.find(
                      (t) => String(t.id) === r.outboundId,
                    );

                    return t ? targetLabel(t) : "未选择";
                  })();
        const summary = ruleSummary(r, categories, target);

        return (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-divider bg-content1"
          >
            <div className="flex items-center gap-2 border-b border-divider bg-default-50 px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-medium">{summary.match}</p>
                <p
                  className={`truncate ${
                    r.action === "block" || missing
                      ? "text-danger"
                      : "text-default-500"
                  }`}
                >
                  → {summary.target}
                </p>
              </div>
              <Button
                isIconOnly
                aria-label="上移"
                isDisabled={i === 0}
                size="sm"
                variant="light"
                onPress={() => move(i, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                isIconOnly
                aria-label="下移"
                isDisabled={i === rules.length - 1}
                size="sm"
                variant="light"
                onPress={() => move(i, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                isIconOnly
                aria-label="删除这条分流"
                color="danger"
                size="sm"
                variant="light"
                onPress={() => onChange(rules.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-3 p-3">
              {groups.map((g) => (
                <div key={g} className="space-y-1.5">
                  <p className="text-[11px] text-default-400">{g}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories
                      .filter((c) => c.group === g)
                      .map((c) => {
                        const on = r.categories.includes(c.key);

                        return (
                          <button
                            key={c.key}
                            aria-pressed={on}
                            className={chipClass(on)}
                            type="button"
                            onClick={() =>
                              update(i, {
                                categories: on
                                  ? r.categories.filter((k) => k !== c.key)
                                  : [...r.categories, c.key],
                              })
                            }
                          >
                            {c.label}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
              {r.domains || r.ips || customOpen.has(i) ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    label="自定义域名"
                    placeholder="example.com，含子域名，逗号分隔"
                    size="sm"
                    value={r.domains}
                    variant="bordered"
                    onChange={(e) => update(i, { domains: e.target.value })}
                  />
                  <Input
                    label="自定义 IP"
                    placeholder="1.2.3.4、1.2.3.0/24，逗号分隔"
                    size="sm"
                    value={r.ips}
                    variant="bordered"
                    onChange={(e) => update(i, { ips: e.target.value })}
                  />
                </div>
              ) : (
                <button
                  className="text-xs text-primary"
                  type="button"
                  onClick={() => setCustomOpen((prev) => new Set(prev).add(i))}
                >
                  + 自定义域名 / IP
                </button>
              )}
              <Select
                description={
                  missing
                    ? "所选节点已被删除，匹配的流量会被丢弃，请重新选择"
                    : undefined
                }
                label="去向"
                placeholder="选择出站节点"
                selectedKeys={actionKey ? [actionKey] : []}
                size="sm"
                onSelectionChange={(keys) => {
                  const key = String(Array.from(keys)[0] ?? "");

                  if (key === "direct" || key === "block") {
                    update(i, { action: key, outboundId: "" });
                  } else if (key) {
                    update(i, { action: "proxy", outboundId: key });
                  }
                }}
              >
                {[
                  <SelectItem key="direct" textValue="直连">
                    直连
                  </SelectItem>,
                  <SelectItem key="block" textValue="阻断">
                    阻断
                  </SelectItem>,
                  ...(missing
                    ? [
                        <SelectItem key={r.outboundId} textValue="已删除的节点">
                          已删除的节点
                        </SelectItem>,
                      ]
                    : []),
                  ...targets.map((t) => (
                    <SelectItem key={String(t.id)} textValue={targetLabel(t)}>
                      {targetLabel(t)}
                    </SelectItem>
                  )),
                ]}
              </Select>
            </div>
          </div>
        );
      })}
      <Button
        className="w-full"
        size="sm"
        startContent={<Plus className="h-3.5 w-3.5" />}
        variant="flat"
        onPress={() => onChange([...rules, emptySplitRule()])}
      >
        添加分流规则
      </Button>
    </div>
  );
}
