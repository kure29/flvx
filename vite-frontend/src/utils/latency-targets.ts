/** Config key of the latency reference point pool. */
export const LATENCY_TARGETS_KEY = "latency_targets";

/**
 * A reference point in the pool. Enabled points are the defaults, measured
 * by nodes without their own selection; pinned ones show first on cards.
 */
export interface LatencyTarget {
  name: string;
  host: string;
  port: number;
  enabled: boolean;
  pinned?: boolean;
}

export function parseLatencyTargets(raw: string | undefined): LatencyTarget[] {
  try {
    const list = JSON.parse(raw || "[]");

    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
