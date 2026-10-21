import type { StatusView } from "@/api";

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { StatusBoard } from "@/pages/status/status-board";

const POLL_MS = 5000;

const apiBase = import.meta.env.VITE_API_BASE ?? "";

/**
 * The public status page, /status/<slug>: no login, read only. It talks
 * to its one endpoint with fetch, not the panel's client, so nothing here
 * leads to the login page or the admin API.
 */
export default function StatusPage() {
  const { slug = "" } = useParams();
  const [view, setView] = useState<StatusView | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">(
    "loading",
  );

  useEffect(() => {
    const robots = document.createElement("meta");

    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);

    return () => robots.remove();
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const load = async () => {
      let wait = POLL_MS;

      try {
        const res = await fetch(
          `${apiBase}/api/v1/open_api/status/${encodeURIComponent(slug)}?tz=${-new Date().getTimezoneOffset()}`,
          { cache: "no-store" },
        );

        if (!active) return;
        if (res.status === 404) {
          setState("gone");

          return;
        }
        if (res.status === 429) wait = 60000;
        else if (res.ok) {
          const body = (await res.json()) as { data?: StatusView };

          if (body.data) {
            setView(body.data);
            setState("ok");
          }
        } else setState((s) => (s === "ok" ? s : "error"));
      } catch {
        if (active) setState((s) => (s === "ok" ? s : "error"));
      }
      if (active) timer = window.setTimeout(load, wait);
    };

    void load();

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [slug]);

  const title = view?.title || "节点状态";

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8 sm:py-9">
        <header className="flex items-center gap-3">
          <svg
            aria-hidden="true"
            className="h-8 w-8 shrink-0 text-primary"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
            viewBox="0 0 36 36"
          >
            <path d="M4 12c5-4 9-4 14 0s9 4 14 0" />
            <path d="M4 19c5-4 9-4 14 0s9 4 14 0" strokeOpacity="0.7" />
            <path d="M4 26c5-4 9-4 14 0s9 4 14 0" strokeOpacity="0.4" />
          </svg>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold sm:text-2xl">
            {title}
          </h1>
          {state === "ok" && (
            <span className="flex items-center gap-2 rounded-full bg-content1 px-3 py-1.5 text-xs text-default-600 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-success" />
              实时
            </span>
          )}
        </header>

        {state === "loading" && (
          <p className="py-24 text-center text-sm text-default-500">
            正在加载…
          </p>
        )}
        {state === "gone" && (
          <p className="py-24 text-center text-sm text-default-500">
            这个状态页不存在或已关闭
          </p>
        )}
        {state === "error" && !view && (
          <p className="py-24 text-center text-sm text-danger">
            暂时连不上，稍后自动重试
          </p>
        )}
        {view && state !== "gone" && <StatusBoard summary nodes={view.nodes} />}
        <footer className="pt-2 text-center text-xs text-default-400">
          由 FLYX 提供
        </footer>
      </main>
    </div>
  );
}
