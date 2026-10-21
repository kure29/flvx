import type { NodeSystemInfo } from "@/pages/node/system-info";

function bytes(v: number): string {
  const units = ["B", "K", "M", "G", "T", "P"];
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

function tone(v: number): string {
  return v >= 85 ? "bg-danger" : v >= 60 ? "bg-warning" : "bg-success";
}

function Meter({ label, value }: { label: string; value?: number }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-1 text-[11px] leading-none">
        <span className="text-default-500">{label}</span>
        <span className="font-mono font-semibold">
          {value === undefined ? "—" : `${Math.round(value)}%`}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-default-100">
        {value !== undefined && (
          <div
            className={`h-full rounded-full ${tone(value)}`}
            style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A node's live resources on its list row: CPU, memory and disk, speed
 * and this month's traffic. "row" sits at the end of a wide row, "footer"
 * under the name on narrow screens.
 */
export function NodeLiveStats({
  info,
  month,
  variant,
}: {
  info: NodeSystemInfo | null;
  /** This month's [in, out] bytes. */
  month?: [number, number];
  variant: "row" | "footer";
}) {
  const up = info ? (info.netOutSpeed ?? info.uploadSpeed) : undefined;
  const down = info ? (info.netInSpeed ?? info.downloadSpeed) : undefined;
  const meters = (
    <>
      <Meter label="CPU" value={info?.cpuUsage} />
      <Meter label="内存" value={info?.memoryUsage} />
      <Meter label="磁盘" value={info?.diskUsage} />
    </>
  );
  const speed =
    up === undefined || down === undefined
      ? "—"
      : `↑${bytes(up)}/s ↓${bytes(down)}/s`;
  const monthText = month ? `本月 ${bytes(month[0] + month[1])}` : "";

  if (variant === "footer") {
    return (
      <div className="mt-2 space-y-1.5 lg:hidden">
        <div className="grid grid-cols-3 gap-3">{meters}</div>
        <div className="flex gap-3 font-mono text-[11px] text-default-500">
          <span>{speed}</span>
          {monthText && <span>{monthText}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-4 lg:flex">
      <div className="grid w-60 grid-cols-3 gap-3">{meters}</div>
      <div className="w-36 space-y-0.5 font-mono text-[11px] leading-tight">
        <div className="text-warning-700 dark:text-warning-400">
          ↑ {up === undefined ? "—" : `${bytes(up)}/s`}
        </div>
        <div className="text-primary">
          ↓ {down === undefined ? "—" : `${bytes(down)}/s`}
        </div>
      </div>
      <div className="flex w-24 items-center gap-1.5">
        <span className="text-[10px] text-default-400">本月</span>
        <div className="space-y-0.5 font-mono text-[11px] leading-tight text-default-600">
          <div>↑ {month ? bytes(month[1]) : "—"}</div>
          <div>↓ {month ? bytes(month[0]) : "—"}</div>
        </div>
      </div>
    </div>
  );
}
