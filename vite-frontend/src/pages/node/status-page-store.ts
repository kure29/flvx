import type { StatusPageSettings } from "@/api";

import { useEffect, useSyncExternalStore } from "react";
import toast from "react-hot-toast";

import { getStatusPage, setNodeStatusPublic } from "@/api";

/** The status page bar and the node rows' 公开 switches share this. */
export interface StatusPageData {
  settings: StatusPageSettings;
  nodes: Array<{ id: number; name: string; public: boolean }>;
}

let data: StatusPageData | null = null;
let loading = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((f) => f());

const subscribe = (f: () => void) => {
  listeners.add(f);

  return () => {
    listeners.delete(f);
  };
};

export async function loadStatusPage() {
  loading = true;
  try {
    const res = await getStatusPage();

    if (res.code === 0 && res.data) {
      data = res.data;
      emit();
    }
  } finally {
    loading = false;
  }
}

export function setStatusPageSettings(settings: StatusPageSettings) {
  if (!data) return;
  data = { ...data, settings };
  emit();
}

/** Shows or hides a node on the page right away; a failure reloads. */
export async function toggleStatusPublic(id: number, on: boolean) {
  if (data) {
    data = {
      ...data,
      nodes: data.nodes.map((n) => (n.id === id ? { ...n, public: on } : n)),
    };
    emit();
  }
  const res = await setNodeStatusPublic(id, on);

  if (res.code !== 0) {
    toast.error(res.msg || "保存失败");
    void loadStatusPage();
  }
}

export function useStatusPage(): StatusPageData | null {
  const value = useSyncExternalStore(subscribe, () => data);

  useEffect(() => {
    if (!data && !loading) void loadStatusPage();
  }, []);

  return value;
}
