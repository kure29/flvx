import { useState } from "react";
import toast from "react-hot-toast";

import {
  setStatusPageSettings,
  toggleStatusPublic,
  useStatusPage,
} from "./status-page-store";

import { saveStatusPage } from "@/api";
import { copyText } from "@/pages/inbound/share";
import { ToggleRow } from "@/pages/subscription/controls";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import { Input } from "@/shadcn-bridge/heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@/shadcn-bridge/heroui/modal";

const modalBase =
  "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden";

const pageLink = (slug: string) => `${window.location.origin}/status/${slug}`;

/**
 * The public status page on the 节点 tab: whether it is on, its link, and
 * a dialog for the title, a new link and the nodes it shows.
 */
export function StatusPageBar() {
  const data = useStatusPage();
  const settings = data?.settings ?? null;
  const nodes = data?.nodes ?? [];
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const open = () => {
    setTitle(settings?.title ?? "");
    setEnabled(settings?.enabled ?? false);
    setEditing(true);
  };

  const save = async (newSlug = false) => {
    setSaving(true);
    try {
      const res = await saveStatusPage({ enabled, title, newSlug });

      if (res.code !== 0 || !res.data) {
        toast.error(res.msg || "保存失败");

        return;
      }
      setStatusPageSettings(res.data);
      if (newSlug) toast.success("已换新链接，旧链接已失效");
      else {
        toast.success("已保存");
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;
  const shown = nodes.filter((n) => n.public).length;
  const live = settings.enabled && settings.slug;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-content1 px-4 py-3 shadow-sm">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${live ? "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300" : "bg-default-100 text-default-500"}`}
        >
          公开状态页 {live ? "已开启" : "未开启"}
        </span>
        {live ? (
          <span className="min-w-0 truncate font-mono text-xs text-default-500">
            {pageLink(settings.slug)} · 显示 {shown} / {nodes.length} 个节点
          </span>
        ) : (
          <span className="text-xs text-default-500">
            不用登录就能看的只读页面，不显示 IP
          </span>
        )}
        <span className="flex-1" />
        {live && (
          <Button
            size="sm"
            variant="flat"
            onPress={() =>
              copyText(pageLink(settings.slug), "状态页链接已复制")
            }
          >
            复制链接
          </Button>
        )}
        <Button size="sm" variant="flat" onPress={open}>
          设置
        </Button>
      </div>

      <Modal
        backdrop="blur"
        classNames={{ base: modalBase }}
        isOpen={editing}
        placement="center"
        scrollBehavior="inside"
        onOpenChange={(o) => !o && setEditing(false)}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">公开状态页</h2>
            <p className="text-small font-normal text-default-500">
              任何拿到链接的人都能看，只显示下面勾选的节点的名称、资源、网速、流量和延迟，不显示
              IP、端口和版本
            </p>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <ToggleRow
              hint="关闭后链接返回 404"
              id="status-page-enabled"
              label="开启公开状态页"
              value={enabled}
              onChange={setEnabled}
            />
            <Input
              label="标题"
              placeholder="节点状态"
              value={title}
              variant="bordered"
              onChange={(e) => setTitle(e.target.value)}
            />
            {settings.slug && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">链接</p>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate rounded-lg bg-default-100 px-3 py-2 font-mono text-xs">
                    {pageLink(settings.slug)}
                  </span>
                  <Button
                    isLoading={saving}
                    size="sm"
                    variant="flat"
                    onPress={() => save(true)}
                  >
                    换新链接
                  </Button>
                </div>
                <p className="text-xs text-default-500">
                  链接泄露或不想再公开给某些人时换一个，旧链接立即失效
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                显示的节点
                <span className="ml-1.5 text-default-400">
                  {shown} / {nodes.length}
                </span>
              </p>
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
              <p className="text-xs text-default-500">勾选立即生效</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setEditing(false)}>
              取消
            </Button>
            <Button color="primary" isLoading={saving} onPress={() => save()}>
              保存
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
