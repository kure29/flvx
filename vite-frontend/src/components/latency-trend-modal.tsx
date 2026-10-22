import { NodeNetworkQuality } from "@/pages/node/network-quality";
import { Button } from "@/shadcn-bridge/heroui/button";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
} from "@/shadcn-bridge/heroui/modal";

export function LatencyTrendModal({
  nodeId,
  nodeName,
  onClose,
}: {
  nodeId: number | null;
  nodeName?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      backdrop="blur"
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
      }}
      isOpen={nodeId !== null}
      placement="center"
      scrollBehavior="inside"
      size="4xl"
      onOpenChange={(open) => !open && onClose()}
    >
      <ModalContent>
        <div className="space-y-1">
          <ModalHeader>延迟趋势</ModalHeader>
          <ModalDescription className="text-xs text-default-500">
            {nodeName || "节点"} → 各测试点 ·
            选择目标进行对比，点击异常可定位到趋势图
          </ModalDescription>
        </div>
        <ModalBody>
          {nodeId !== null && (
            <NodeNetworkQuality
              key={nodeId}
              nodeId={nodeId}
              nodeName={nodeName || "节点"}
              variant="trend"
            />
          )}
        </ModalBody>
        <ModalFooter className="mt-0">
          <Button variant="light" onPress={onClose}>
            关闭
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
