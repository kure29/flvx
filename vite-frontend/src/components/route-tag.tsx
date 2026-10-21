// Short tag and color per return route, premium lines warmer.
const ROUTES: Record<string, [string, string]> = {
  "电信 CN2 GIA": [
    "CN2 GIA",
    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ],
  "电信 CN2 GT": [
    "CN2 GT",
    "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  ],
  "电信 163": ["163", "bg-default-200/70 text-default-600"],
  "联通 9929": [
    "9929",
    "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  ],
  "联通 4837": ["4837", "bg-sky-500/15 text-sky-700 dark:text-sky-400"],
  "移动 CMIN2": [
    "CMIN2",
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  ],
  "移动 CMI": ["CMI", "bg-teal-500/15 text-teal-700 dark:text-teal-400"],
};

/** A return route as a small colored tag; short form for tight spaces. */
export function RouteTag({
  route,
  short,
}: {
  route?: string;
  short?: boolean;
}) {
  if (!route || route === "未识别") return null;
  const [tag, cls] = ROUTES[route] ?? [route, ROUTES["电信 163"][1]];

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded px-1 font-sans text-[10px] font-medium leading-4 ${cls}`}
      title={`回程 ${route}`}
    >
      {short ? tag : route}
    </span>
  );
}
