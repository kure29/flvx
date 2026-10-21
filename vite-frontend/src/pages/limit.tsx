import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";

import { ActionSheet } from "@/components/action-sheet";
import {
  EmptyHint,
  ListGroup,
  ListRow,
  PageHeader,
  PageShell,
  PageToolbar,
} from "@/components/page-kit";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Input } from "@/shadcn-bridge/heroui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import {
  createSpeedLimit,
  getSpeedLimitList,
  updateSpeedLimit,
  deleteSpeedLimit,
} from "@/api";
import { PageLoadingState } from "@/components/page-state";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";

interface SpeedLimitRule {
  id: number;
  name: string;
  speed: number;
  status: number;
  createdTime: string;
  updatedTime: string;
}

interface SpeedLimitForm {
  id?: number;
  name: string;
  speed: number;
  status: number;
}

export default function LimitPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<SpeedLimitRule[]>([]);
  const [searchKeyword, setSearchKeyword] = useLocalStorageState(
    "limit-search-keyword",
    "",
  );
  const [sheetRuleId, setSheetRuleId] = useState<number | null>(null);

  const filteredRules = useMemo(() => {
    if (!searchKeyword.trim()) return rules;
    const lowerKeyword = searchKeyword.toLowerCase();

    return rules.filter(
      (r) => r.name && r.name.toLowerCase().includes(lowerKeyword),
    );
  }, [rules, searchKeyword]);

  // 模态框状态
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<SpeedLimitRule | null>(null);

  // 表单状态
  const [form, setForm] = useState<SpeedLimitForm>({
    name: "",
    speed: 100,
    status: 1,
  });

  // 表单验证错误
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadData();
  }, []);

  // 加载所有数据
  const loadData = async () => {
    setLoading(true);
    try {
      const rulesRes = await getSpeedLimitList();

      if (rulesRes.code === 0) {
        setRules(rulesRes.data || []);
      } else {
        toast.error(rulesRes.msg || "获取限速规则失败");
      }
    } catch {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!form.name.trim()) {
      newErrors.name = "请输入规则名称";
    } else if (form.name.length < 2 || form.name.length > 50) {
      newErrors.name = "规则名称长度应在2-50个字符之间";
    }

    if (!form.speed || form.speed < 1) {
      newErrors.speed = "请输入有效的速度限制（≥1 Mbps）";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  // 新增规则
  const handleAdd = () => {
    setIsEdit(false);
    setForm({
      name: "",
      speed: 100,
      status: 1,
    });
    setErrors({});
    setModalOpen(true);
  };

  // 编辑规则
  const handleEdit = (rule: SpeedLimitRule) => {
    setIsEdit(true);
    setForm({
      id: rule.id,
      name: rule.name,
      speed: rule.speed,
      status: rule.status,
    });
    setErrors({});
    setModalOpen(true);
  };

  // 显示删除确认
  const handleDelete = (rule: SpeedLimitRule) => {
    setRuleToDelete(rule);
    setDeleteModalOpen(true);
  };

  // 确认删除规则
  const confirmDelete = async () => {
    if (!ruleToDelete) return;

    setDeleteLoading(true);
    try {
      const res = await deleteSpeedLimit(ruleToDelete.id);

      if (res.code === 0) {
        toast.success("删除成功");
        setDeleteModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      let res: { code: number; msg: string };
      const payload = {
        id: form.id,
        name: form.name,
        speed: form.speed,
        status: form.status,
      };

      if (isEdit) {
        res = await updateSpeedLimit(payload);
      } else {
        const createData = {
          name: payload.name,
          speed: payload.speed,
          status: payload.status,
        };

        res = await createSpeedLimit(createData);
      }

      if (res.code === 0) {
        toast.success(isEdit ? "修改成功" : "创建成功");
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || "操作失败");
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return <PageLoadingState message="正在加载..." />;
  }

  const sheetRule = rules.find((r) => r.id === sheetRuleId) ?? null;

  return (
    <PageShell embedded={embedded}>
      {!embedded && (
        <PageHeader
          description="分配隧道权限时可选的带宽上限"
          primary={{ key: "add", label: "新建限速规则", onPress: handleAdd }}
          title="限速"
        />
      )}
      <PageToolbar
        placeholder="搜索规则名称"
        primary={
          embedded
            ? { key: "add", label: "新建限速规则", onPress: handleAdd }
            : undefined
        }
        search={searchKeyword}
        onSearch={setSearchKeyword}
      />

      {rules.length === 0 ? (
        <EmptyHint
          action={{ key: "add", label: "新建限速规则", onPress: handleAdd }}
          text="还没有限速规则"
        />
      ) : filteredRules.length === 0 ? (
        <EmptyHint text="没有匹配的限速规则" />
      ) : (
        <ListGroup>
          {filteredRules.map((rule) => (
            <ListRow
              key={rule.id}
              meta={`${rule.speed} Mbps`}
              status={rule.status === 1 ? "ok" : "bad"}
              statusTitle={rule.status === 1 ? "运行" : "异常"}
              title={rule.name}
              onPress={() => setSheetRuleId(rule.id)}
            />
          ))}
        </ListGroup>
      )}

      <ActionSheet
        actions={
          sheetRule
            ? [
                {
                  key: "edit",
                  label: "编辑",
                  color: "primary" as const,
                  onPress: () => handleEdit(sheetRule),
                },
                {
                  key: "delete",
                  label: "删除",
                  color: "danger" as const,
                  onPress: () => handleDelete(sheetRule),
                },
              ]
            : []
        }
        isOpen={Boolean(sheetRule)}
        subtitle={sheetRule && (sheetRule.status === 1 ? "运行" : "异常")}
        title={sheetRule?.name ?? ""}
        onClose={() => setSheetRuleId(null)}
      >
        {sheetRule && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="shrink-0 text-default-500">速度限制</span>
              <span className="font-mono text-xs leading-5">
                {sheetRule.speed} Mbps
              </span>
            </div>
          </div>
        )}
      </ActionSheet>

      {/* 新增/编辑模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={modalOpen}
        placement="center"
        scrollBehavior="inside"
        size="2xl"
        onOpenChange={setModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">
                  {isEdit ? "编辑限速规则" : "新建限速规则"}
                </h2>
                <p className="text-small text-default-500">
                  {isEdit ? "修改现有限速规则的配置信息" : "创建新的限速规则"}
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    errorMessage={errors.name}
                    isInvalid={!!errors.name}
                    label="规则名称"
                    placeholder="请输入限速规则名称"
                    value={form.name}
                    variant="bordered"
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />

                  <Input
                    endContent={
                      <div className="pointer-events-none flex items-center">
                        <span className="text-default-400 text-small">
                          Mbps
                        </span>
                      </div>
                    }
                    errorMessage={errors.speed}
                    isInvalid={!!errors.speed}
                    label="速度限制"
                    placeholder="请输入速度限制"
                    type="number"
                    value={form.speed.toString()}
                    variant="bordered"
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        speed: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={submitLoading}
                  onPress={handleSubmit}
                >
                  {isEdit ? "保存修改" : "创建规则"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 删除确认模态框 */}
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
                <h2 className="text-lg font-bold text-danger">确认删除</h2>
              </ModalHeader>
              <ModalBody>
                <p className="text-default-600">
                  确定要删除限速规则{" "}
                  <span className="font-semibold text-foreground">
                    &quot;{ruleToDelete?.name}&quot;
                  </span>{" "}
                  吗？
                </p>
                <p className="text-small text-default-500 mt-2">
                  此操作无法撤销，删除后该规则将永久消失。
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
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </PageShell>
  );
}
