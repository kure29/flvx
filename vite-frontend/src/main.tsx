import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import toast from "react-hot-toast";

import App from "./App.tsx";
import { IS_DEMO, installDemo } from "./demo";
import { DemoBanner } from "./demo/banner";
import { Provider } from "./provider.tsx";
import "@/styles/globals.css";

// A page chunk from the previous build is gone after an upgrade: reload
// to pick up the new build instead of showing a blank page. At most once
// a minute, so a chunk that is really missing doesn't loop.
window.addEventListener("vite:preloadError", (event) => {
  const key = "flvx_chunk_reload";

  try {
    const last = Number(sessionStorage.getItem(key) || 0);

    if (Date.now() - last < 60000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

if (IS_DEMO) installDemo();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-foreground">
            发现新版本，是否立即刷新以应用更新？
          </span>
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors"
              onClick={() => {
                updateSW(true);
                toast.dismiss(t.id);
              }}
            >
              刷新
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium bg-default-200 text-default-700 hover:bg-default-300 rounded-md transition-colors"
              onClick={() => toast.dismiss(t.id)}
            >
              稍后
            </button>
          </div>
        </div>
      ),
      { duration: Infinity, position: "bottom-right" },
    );
  },
});

// The demo is static files on GitHub Pages: hash routes need no server.
const Router = IS_DEMO ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Router>
    <Provider>
      <App />
      {IS_DEMO && <DemoBanner />}
    </Provider>
  </Router>,
);
