import { useState } from "react";
import { ChevronDown, X } from "lucide-react";

import { demoRole, switchDemoRole } from "@/demo";

const DOCS = "https://kure29.github.io/flyx/guide/install";

/** The demo's floating note: sample data, switch views, how to install. */
export function DemoBanner() {
  const [open, setOpen] = useState(true);
  const role = demoRole();

  if (!open) {
    return (
      <button
        className="fixed bottom-[84px] right-3 z-[60] rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-lg lg:bottom-4"
        type="button"
        onClick={() => setOpen(true)}
      >
        演示站
      </button>
    );
  }

  return (
    <div className="fixed bottom-[84px] right-3 z-[60] w-[min(20rem,calc(100vw-24px))] rounded-2xl border border-divider bg-content1/95 p-3 text-xs shadow-xl backdrop-blur lg:bottom-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-sm">FLYX 在线演示</span>
        <button
          aria-label="收起"
          className="rounded p-1 text-default-400 hover:bg-default-100"
          type="button"
          onClick={() => setOpen(false)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-default-500">
        数据都是示例，可以随便点；修改不会保存，刷新后还原。
      </p>
      <div className="mt-2 flex gap-2">
        <button
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-default-100 px-2 py-1.5 hover:bg-default-200"
          type="button"
          onClick={() => switchDemoRole(role === "admin" ? "user" : "admin")}
        >
          <ChevronDown className="h-3 w-3" />
          {role === "admin" ? "看普通用户视角" : "回到管理员视角"}
        </button>
        <a
          className="flex flex-1 items-center justify-center rounded-lg bg-primary px-2 py-1.5 font-medium text-white"
          href={DOCS}
          rel="noreferrer"
          target="_blank"
        >
          安装 FLYX
        </a>
      </div>
    </div>
  );
}
