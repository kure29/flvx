import { Copy } from "lucide-react";

import { copyText } from "@/pages/inbound/share";
import { SUB_CLIENTS } from "@/pages/subscription/clients";

/**
 * One tile per client: pressing it opens the app's own import (or copies
 * the link where the app has none), the button on its right copies the
 * link. With routing rules, clients that take a full configuration get it.
 */
export function SubClientGrid({
  link,
  name,
  rules,
}: {
  /** The subscription link for a ?format= value ("" for auto). */
  link: (format: string) => string;
  name: string;
  rules: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SUB_CLIENTS.map((c) => {
        const url = link(c.format);
        const isConfig = rules && c.configImportURL !== undefined;
        const importURL = isConfig ? (c.configImportURL ?? null) : c.importURL;
        const open = () => {
          if (importURL) {
            window.location.href = importURL(url, name);
          } else {
            copyText(
              url,
              isConfig
                ? `${c.label}配置链接已复制，在 App 的配置里从 URL 下载`
                : `${c.label}订阅已复制`,
            );
          }
        };

        return (
          <div
            key={c.key}
            className="relative flex h-14 items-center rounded-xl border border-divider transition-colors hover:bg-default-100"
          >
            <button
              className="h-full min-w-0 flex-1 truncate pl-3 pr-9 text-left text-sm font-medium"
              title={
                importURL
                  ? `导入到 ${c.label}`
                  : isConfig
                    ? `复制 ${c.label} 配置链接`
                    : "复制通用订阅"
              }
              type="button"
              onClick={open}
            >
              {c.label}
            </button>
            <button
              aria-label={`复制 ${c.label} 订阅链接`}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-default-400 hover:bg-default-200 hover:text-default-600"
              type="button"
              onClick={() => copyText(url, `${c.label} 订阅已复制`)}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
