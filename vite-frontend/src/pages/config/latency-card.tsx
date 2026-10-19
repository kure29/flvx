import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/shadcn-bridge/heroui/button";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@/shadcn-bridge/heroui/dropdown";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Switch } from "@/shadcn-bridge/heroui/switch";

export const LATENCY_TARGETS_KEY = "latency_targets";

const MAX_TARGETS = 10;
const MAX_PINNED = 3;

interface LatencyTarget {
  name: string;
  host: string;
  port: number;
  enabled: boolean;
  pinned?: boolean;
}

// Province × carrier TCP-ping addresses on carrier CDN nodes, port 80.
const CITIES = [
  ["北京", "bj"],
  ["上海", "sh"],
  ["广东", "gd"],
] as const;
const CARRIERS = [
  ["电信", "ct"],
  ["联通", "cu"],
  ["移动", "cm"],
] as const;
const PRESETS: LatencyTarget[] = CITIES.flatMap(([city, c]) =>
  CARRIERS.map(([carrier, k]) => ({
    name: `${city}${carrier}`,
    host: `${c}-${k}-v4.ip.zstaticcdn.com`,
    port: 80,
    enabled: true,
  })),
);
// One point per carrier, spread over regions.
const RECOMMENDED = ["广东电信", "上海联通", "北京移动"];

function parseTargets(raw: string | undefined): LatencyTarget[] {
  try {
    const list = JSON.parse(raw || "[]");

    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** One line for the collapsed section. */
export function latencySummary(configs: Record<string, string>): string {
  const targets = parseTargets(configs[LATENCY_TARGETS_KEY]);
  const enabled = targets.filter((t) => t.enabled);

  if (enabled.length === 0) return "未设置 · 延迟从面板服务器测";
  const pinned = enabled.filter((t) => t.pinned).map((t) => t.name);

  return [
    `${enabled.length} 个测试点`,
    pinned.length ? `卡片显示 ${pinned.join("、")}` : "卡片显示最差和最好的",
  ].join(" · ");
}

/** Reference points nodes measure latency to, saved with the page. */
export function LatencySettings({
  configs,
  onChange,
}: {
  configs: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const targets = parseTargets(configs[LATENCY_TARGETS_KEY]);
  const pinnedCount = targets.filter((t) => t.pinned).length;
  const names = new Set(targets.map((t) => t.name));

  const save = (next: LatencyTarget[]) =>
    onChange(LATENCY_TARGETS_KEY, next.length ? JSON.stringify(next) : "");
  const update = (i: number, patch: Partial<LatencyTarget>) =>
    save(targets.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, by: number) => {
    const next = [...targets];

    [next[i], next[i + by]] = [next[i + by], next[i]];
    save(next);
  };
  const add = (list: LatencyTarget[]) =>
    save(
      [...targets, ...list.filter((t) => !names.has(t.name))].slice(
        0,
        MAX_TARGETS,
      ),
    );

  const full = targets.length >= MAX_TARGETS;

  return (
    <div className="space-y-3">
      <p className="text-xs text-default-500">
        节点定时用 TCP
        连接测到这些地址的延迟和丢包，代表该地区运营商用户到节点的延迟。
        节点和自建入站的卡片显示勾选“卡片显示”的测试点（最多 {MAX_PINNED}{" "}
        个，没选够时补最差和最好的）。不设置时，入站延迟仍从面板服务器测。
      </p>

      {targets.length === 0 && (
        <div className="rounded-lg border border-dashed border-divider px-3 py-4 text-center text-sm text-default-500">
          还没有测试点
          <div className="mt-2">
            <Button
              color="primary"
              size="sm"
              variant="flat"
              onPress={() =>
                add(
                  PRESETS.filter((p) => RECOMMENDED.includes(p.name)).map(
                    (p) => ({ ...p, pinned: true }),
                  ),
                )
              }
            >
              添加三网推荐（{RECOMMENDED.join(" / ")}）
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {targets.map((t, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-divider p-2.5"
          >
            <div className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[8rem_1fr_5rem]">
              <Input
                aria-label="名称"
                classNames={{ base: "order-1" }}
                placeholder="名称"
                size="sm"
                value={t.name}
                variant="bordered"
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <Input
                aria-label="地址"
                classNames={{
                  base: "order-3 col-span-2 min-w-0 sm:order-2 sm:col-span-1",
                }}
                placeholder="域名或 IP"
                size="sm"
                value={t.host}
                variant="bordered"
                onChange={(e) => update(i, { host: e.target.value.trim() })}
              />
              <Input
                aria-label="端口"
                classNames={{ base: "order-2 sm:order-3" }}
                inputMode="numeric"
                placeholder="端口"
                size="sm"
                value={t.port ? String(t.port) : ""}
                variant="bordered"
                onChange={(e) =>
                  update(i, {
                    port: Number(e.target.value.replace(/\D/g, "")) || 0,
                  })
                }
              />
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <Switch
                  aria-label="启用"
                  isSelected={t.enabled}
                  size="sm"
                  onValueChange={(v) => update(i, { enabled: v })}
                />
                启用
              </span>
              <Checkbox
                isDisabled={!t.pinned && pinnedCount >= MAX_PINNED}
                isSelected={Boolean(t.pinned)}
                size="sm"
                onValueChange={(v) => update(i, { pinned: v })}
              >
                <span className="text-xs">卡片显示</span>
              </Checkbox>
              <span className="ml-auto flex items-center gap-0.5">
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
                  isDisabled={i === targets.length - 1}
                  size="sm"
                  variant="light"
                  onPress={() => move(i, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  isIconOnly
                  aria-label="删除"
                  color="danger"
                  size="sm"
                  variant="light"
                  onPress={() => save(targets.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Dropdown>
          <DropdownTrigger>
            <Button isDisabled={full} size="sm" variant="flat">
              添加预设
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="预设测试点" className="max-h-72 w-44">
            {PRESETS.map((p) => (
              <DropdownItem
                key={p.name}
                className={names.has(p.name) ? "opacity-40" : ""}
                onPress={() => add([p])}
              >
                {p.name}
                {names.has(p.name) ? "（已添加）" : ""}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
        <Button
          isDisabled={full}
          size="sm"
          startContent={<Plus className="h-3.5 w-3.5" />}
          variant="flat"
          onPress={() =>
            save([...targets, { name: "", host: "", port: 80, enabled: true }])
          }
        >
          自定义
        </Button>
        <span className="self-center text-xs text-default-400">
          {targets.length} / {MAX_TARGETS}
        </span>
      </div>
    </div>
  );
}
