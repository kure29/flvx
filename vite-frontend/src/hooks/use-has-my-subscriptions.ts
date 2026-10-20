import { useEffect, useState } from "react";

import { getMySubscriptions } from "@/api";

// One request per page load, shared by both layouts.
let cached: Promise<boolean> | null = null;

/** Whether the logged-in (non-admin) user has subscriptions assigned. */
export function useHasMySubscriptions(isAdmin: boolean): boolean {
  const [has, setHas] = useState(false);

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;

    cached ??= getMySubscriptions()
      .then((res) => res.code === 0 && (res.data?.length ?? 0) > 0)
      .catch(() => false);
    cached.then((v) => {
      if (!cancelled) setHas(v);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return has;
}
