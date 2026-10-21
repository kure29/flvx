import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Field } from "./section";

import { saveStatusPage } from "@/api";
import { copyText } from "@/pages/inbound/share";
import {
  setStatusPageSettings,
  toggleStatusPublic,
  useStatusPage,
} from "@/pages/node/status-page-store";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Switch } from "@/shadcn-bridge/heroui/switch";

const pageLink = (slug: string) => `${window.location.origin}/status/${slug}`;

/** One line for the collapsed section. */
export function useStatusPageSummary(): string {
  const data = useStatusPage();

  if (!data) return "加载中...";
  if (!data.settings.enabled) return "未开启（单独保存）";
  const shown = data.nodes.filter((n) => n.public).length;

  return `已开启 · 显示 ${shown} / ${data.nodes.length} 个节点（单独保存）`;
}

/**
 * The public status page: on or off, title and link (saved with their own
 * button), and the nodes it shows (each tick saves at once).
 */
export function StatusPageSettings() {
  const data = useStatusPage();
  const settings = data?.settings ?? null;
  const nodes = data?.nodes ?? [];
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [background, setBackground] = useState("");
  const [opacity, setOpacity] = useState(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setTitle(settings.title);
    setEnabled(settings.enabled);
    setBackground(settings.background);
    setOpacity(settings.cardOpacity);
  }, [settings]);

  const save = async (newSlug = false) => {
    setSaving(true);
    try {
      const res = await saveStatusPage({
        enabled,
        title,
        newSlug,
        background: background.trim(),
        cardOpacity: opacity,
      });

      if (res.code !== 0 || !res.data) {
        toast.error(res.msg || "保存失败");

        return;
      }
      setStatusPageSettings(res.data);
      toast.success(newSlug ? "已换新链接，旧链接已失效" : "已保存");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <p className="text-sm text-default-500">加载中...</p>;
  }
  const shown = nodes.filter((n) => n.public).length;
  const dirty =
    enabled !== settings.enabled ||
    title !== settings.title ||
    background.trim() !== settings.background ||
    opacity !== settings.cardOpacity;

  return (
    <>
      <p className="text-xs text-default-500">
        不用登录就能看的只读页面：只显示下面勾选的节点的名称、资源、网速、流量、延迟和回程线路，不显示
        IP、端口和版本
      </p>
      <Field inline help="关闭后链接返回 404" label="开启公开状态页">
        <Switch
          aria-label="开启公开状态页"
          isSelected={enabled}
          size="sm"
          onValueChange={setEnabled}
        />
      </Field>
      <Field label="标题">
        <Input
          aria-label="标题"
          placeholder="节点状态"
          value={title}
          variant="bordered"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field
        help="图片地址（https://… 或面板上以 / 开头的路径），留空不用背景"
        label="背景图"
      >
        <Input
          aria-label="背景图"
          placeholder="https://example.com/bg.webp"
          value={background}
          variant="bordered"
          onChange={(e) => setBackground(e.target.value)}
        />
      </Field>
      <Field
        help="低于 100% 时背景图会透过卡片显示；字看不清就调高"
        label={
          <>
            卡片不透明度
            <span className="ml-1.5 font-normal text-default-400">
              {opacity}%
            </span>
          </>
        }
      >
        <input
          aria-label="卡片不透明度"
          className="w-full accent-primary"
          max={100}
          min={10}
          step={5}
          type="range"
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
        />
      </Field>
      <div className="flex justify-end">
        <Button
          color="primary"
          isDisabled={!dirty}
          isLoading={saving}
          size="sm"
          onPress={() => save()}
        >
          保存
        </Button>
      </div>
      {settings.slug && (
        <Field
          help="链接泄露或不想再公开给某些人时换一个，旧链接立即失效"
          label="链接"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-lg bg-default-100 px-3 py-2 font-mono text-xs">
              {pageLink(settings.slug)}
            </span>
            <Button
              size="sm"
              variant="flat"
              onPress={() =>
                copyText(pageLink(settings.slug), "状态页链接已复制")
              }
            >
              复制
            </Button>
            <Button
              isLoading={saving}
              size="sm"
              variant="flat"
              onPress={() => save(true)}
            >
              换新链接
            </Button>
          </div>
        </Field>
      )}
      <Field
        help="勾选立即生效；节点页每行的开关也能改"
        label={
          <>
            显示的节点
            <span className="ml-1.5 font-normal text-default-400">
              {shown} / {nodes.length}
            </span>
          </>
        }
      >
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-divider p-2">
          {nodes.map((n) => (
            <Checkbox
              key={n.id}
              className="w-full"
              isSelected={n.public}
              onValueChange={(on) => toggleStatusPublic(n.id, on)}
            >
              <span className="text-sm">{n.name}</span>
            </Checkbox>
          ))}
          {nodes.length === 0 && (
            <p className="py-4 text-center text-xs text-default-500">
              还没有节点
            </p>
          )}
        </div>
      </Field>
    </>
  );
}
