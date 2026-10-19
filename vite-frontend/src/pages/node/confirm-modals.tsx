import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/shadcn-bridge/heroui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { Node } from "@/pages/node/types";

export interface RollbackNodeModalProps {
  confirmRollback: () => Promise<void>;
  nodeToRollback: Node | null;
  rollbackModalOpen: boolean;
  setRollbackModalOpen: Dispatch<SetStateAction<boolean>>;
}

/** Confirm rolling a node's agent back to the previous version. */
export function RollbackNodeModal({
  confirmRollback,
  nodeToRollback,
  rollbackModalOpen,
  setRollbackModalOpen,
}: RollbackNodeModalProps) {
  return (
    <Modal
      backdrop="blur"
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
      }}
      isOpen={rollbackModalOpen}
      placement="center"
      scrollBehavior="inside"
      size="2xl"
      onOpenChange={setRollbackModalOpen}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">确认回退</h2>
            </ModalHeader>
            <ModalBody>
              <p>
                确定要将节点 <strong>&quot;{nodeToRollback?.name}&quot;</strong>{" "}
                回退到上一个版本吗？
              </p>
              <p className="text-small text-default-500">
                节点将执行版本回退并自动重启，期间会导致节点短暂离线。
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                取消
              </Button>
              <Button color="secondary" onPress={confirmRollback}>
                确认回退
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

export interface DeleteNodeModalProps {
  confirmDelete: () => Promise<void>;
  deleteLoading: boolean;
  deleteModalOpen: boolean;
  nodeToDelete: Node | null;
  setDeleteModalOpen: Dispatch<SetStateAction<boolean>>;
}

/** Confirm deleting one node. */
export function DeleteNodeModal({
  confirmDelete,
  deleteLoading,
  deleteModalOpen,
  nodeToDelete,
  setDeleteModalOpen,
}: DeleteNodeModalProps) {
  return (
    <Modal
      backdrop="blur"
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
      }}
      isOpen={deleteModalOpen}
      placement="center"
      scrollBehavior="inside"
      size="2xl"
      onOpenChange={setDeleteModalOpen}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">确认删除</h2>
            </ModalHeader>
            <ModalBody>
              <p>
                确定要删除节点 <strong>&quot;{nodeToDelete?.name}&quot;</strong>{" "}
                吗？
              </p>
              <p className="text-small text-default-500">
                此操作不可恢复，请谨慎操作。
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="danger"
                isLoading={deleteLoading}
                onPress={confirmDelete}
              >
                {deleteLoading ? "删除中..." : "确认删除"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

export interface BatchDeleteNodesModalProps {
  batchDeleteModalOpen: boolean;
  batchLoading: boolean;
  handleBatchDelete: () => Promise<void>;
  selectedIds: Set<number>;
  setBatchDeleteModalOpen: Dispatch<SetStateAction<boolean>>;
}

/** Confirm deleting the selected nodes. */
export function BatchDeleteNodesModal({
  batchDeleteModalOpen,
  batchLoading,
  handleBatchDelete,
  selectedIds,
  setBatchDeleteModalOpen,
}: BatchDeleteNodesModalProps) {
  return (
    <Modal
      backdrop="blur"
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
      }}
      isOpen={batchDeleteModalOpen}
      placement="center"
      scrollBehavior="inside"
      size="md"
      onOpenChange={setBatchDeleteModalOpen}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">确认删除</h2>
            </ModalHeader>
            <ModalBody>
              <p>
                确定要删除选中的 <strong>{selectedIds.size}</strong> 个节点吗？
              </p>
              <p className="text-small text-default-500">
                此操作不可恢复，请谨慎操作。
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="danger"
                isLoading={batchLoading}
                onPress={handleBatchDelete}
              >
                {batchLoading ? "删除中..." : "确认删除"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
