import type {
  KernelApiItem,
  KernelCapabilitiesApiData,
  NodeApiItem,
} from "@/api/types";

import { useCallback, useEffect, useState } from "react";

import { getKernelCapabilities, getKernelList, getNodeList } from "@/api";
import { PageLoadingState } from "@/components/page-state";
import { type InstallRequest, KernelPanel } from "@/pages/inbound/kernel-panel";

/** The kernels installed on each node, under 节点 → 内核. */
export function KernelsTab({
  installRequest,
  onInstallRequestHandled,
}: {
  installRequest: InstallRequest | null;
  onInstallRequestHandled: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [caps, setCaps] = useState<KernelCapabilitiesApiData | null>(null);
  const [nodes, setNodes] = useState<NodeApiItem[]>([]);
  const [kernels, setKernels] = useState<KernelApiItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [capsRes, nodeRes, kernelRes] = await Promise.all([
        getKernelCapabilities(),
        getNodeList(),
        getKernelList(),
      ]);

      if (capsRes.code === 0) setCaps(capsRes.data);
      if (nodeRes.code === 0) setNodes(nodeRes.data || []);
      if (kernelRes.code === 0) setKernels(kernelRes.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);

    return () => window.clearInterval(timer);
  }, [load]);

  if (loading) return <PageLoadingState message="正在加载..." />;

  return (
    <KernelPanel
      caps={caps}
      installRequest={installRequest}
      kernels={kernels}
      nodes={nodes}
      onChanged={load}
      onInstallRequestHandled={onInstallRequestHandled}
    />
  );
}
