import { RefreshCw } from "lucide-react";

export const analyticsButton = (active = false) =>
  `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-default-400 bg-default-100 text-foreground" : "border-divider bg-content1 text-default-500 hover:bg-default-100 hover:text-foreground"}`;

export const analyticsDate = (time: number, includeDate = true) =>
  new Date(time).toLocaleString("zh-CN", {
    ...(includeDate ? ({ month: "2-digit", day: "2-digit" } as const) : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function AnalyticsState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  empty: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-default-500"
      role="status"
    >
      {loading ? (
        <>
          <RefreshCw className="h-5 w-5 animate-spin" />
          正在加载统计数据
        </>
      ) : error ? (
        <>
          <p className="text-danger">{error}</p>
          <button className={analyticsButton()} type="button" onClick={onRetry}>
            重新加载
          </button>
        </>
      ) : (
        <p className="max-w-md leading-6">{empty}</p>
      )}
    </div>
  );
}

/** Export the actual plotted SVG as a PNG, with the current theme resolved. */
export async function saveChartImage(container: HTMLElement, filename: string) {
  const source = container.querySelector(
    ".recharts-wrapper > svg.recharts-surface",
  );

  if (!source) throw new Error("图表尚未加载");
  const svg = source.cloneNode(true) as SVGElement;
  const originalElements = [source, ...source.querySelectorAll("*")];
  const clonedElements = [svg, ...svg.querySelectorAll("*")];

  originalElements.forEach((element, index) => {
    const style = getComputedStyle(element);

    for (const property of [
      "fill",
      "stroke",
      "color",
      "font-family",
      "font-size",
      "opacity",
    ]) {
      (clonedElements[index] as SVGElement).style.setProperty(
        property,
        style.getPropertyValue(property),
      );
    }
  });
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const rect = source.getBoundingClientRect();
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );

  try {
    const image = new Image();

    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) throw new Error("浏览器不支持导出图片");
    context.font = "12px sans-serif";
    let x = 20;
    let y = 48;
    const legend = [
      ...container.querySelectorAll(
        "[data-chart-legend], .recharts-legend-item-text",
      ),
    ].map((element) => {
      const text = element.textContent ?? "";
      const width = context.measureText(text).width + 24;

      if (x + width > rect.width - 20 && x > 20) {
        x = 20;
        y += 20;
      }
      const marker = element.matches("[data-chart-legend]")
        ? element.querySelector("[data-chart-legend-marker]")
        : element
            .closest(".recharts-legend-item")
            ?.querySelector(".recharts-legend-icon");
      const markerStyle = marker ? getComputedStyle(marker) : null;
      const color = markerStyle
        ? markerStyle.stroke !== "none"
          ? markerStyle.stroke
          : markerStyle.fill
        : getComputedStyle(element).color;
      const label = { text, color, x, y };

      x += width;

      return label;
    });
    const chartTop = y + 12;

    canvas.width = Math.ceil(rect.width * 2);
    canvas.height = Math.ceil((rect.height + chartTop) * 2);
    context.scale(2, 2);
    context.fillStyle = getComputedStyle(container).backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = getComputedStyle(container).color;
    context.font = "14px sans-serif";
    context.fillText(filename, 20, 25);
    context.font = "12px sans-serif";
    legend.forEach((label) => {
      context.fillStyle = label.color;
      context.fillText(label.text, label.x, label.y);
    });
    context.drawImage(image, 0, chartTop, rect.width, rect.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) =>
        blob ? resolve(blob) : reject(new Error("导出图片失败")),
      ),
    );
    const pngUrl = URL.createObjectURL(png);
    const link = document.createElement("a");

    link.href = pngUrl;
    link.download = `${filename}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
