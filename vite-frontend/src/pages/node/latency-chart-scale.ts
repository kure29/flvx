/** Rounded latency ticks with room above the visible peak, without clipping it. */
export function latencyChartScale(values: Iterable<number | null | undefined>) {
  let peak = 0;

  for (const value of values) {
    if (value != null && Number.isFinite(value)) peak = Math.max(peak, value);
  }
  const extent = Math.max(80, peak);
  const roughStep = extent / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step =
    ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= roughStep) ?? 10) *
    magnitude;
  const max = Math.ceil((extent * 1.08) / step) * step;

  return {
    max,
    ticks: Array.from(
      { length: Math.round(max / step) + 1 },
      (_, i) => i * step,
    ),
  };
}
