import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { Button } from "@/shadcn-bridge/heroui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import { Spinner } from "@/shadcn-bridge/heroui/spinner";
import { Alert } from "@/shadcn-bridge/heroui/alert";
import {
  getForwardDiagnosisQualityDisplay,
  type ForwardDiagnosisResult,
} from "@/pages/forward/diagnosis";
import { Forward } from "@/pages/forward/types";

export interface DiagnosisModalProps {
  currentDiagnosisForward: Forward | null;
  diagnosisAbortRef: MutableRefObject<AbortController | null>;
  diagnosisLoading: boolean;
  diagnosisModalOpen: boolean;
  diagnosisProgress: {
    total: number;
    completed: number;
    success: number;
    failed: number;
    timedOut: boolean;
  };
  diagnosisResult: ForwardDiagnosisResult | null;
  handleDiagnose: (forward: Forward) => Promise<void>;
  setDiagnosisLoading: Dispatch<SetStateAction<boolean>>;
  setDiagnosisModalOpen: Dispatch<SetStateAction<boolean>>;
}

/** Diagnosis results for one forward, streamed as they arrive. */
export function DiagnosisModal({
  currentDiagnosisForward,
  diagnosisAbortRef,
  diagnosisLoading,
  diagnosisModalOpen,
  diagnosisProgress,
  diagnosisResult,
  handleDiagnose,
  setDiagnosisLoading,
  setDiagnosisModalOpen,
}: DiagnosisModalProps) {
  return (
    <Modal
      backdrop="blur"
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden [&>div]:bg-content1 [&>div]:dark:bg-content1",
      }}
      isOpen={diagnosisModalOpen}
      placement="center"
      scrollBehavior="inside"
      size="4xl"
      onOpenChange={(open) => {
        setDiagnosisModalOpen(open);
        if (!open) {
          diagnosisAbortRef.current?.abort();
          diagnosisAbortRef.current = null;
          setDiagnosisLoading(false);
        }
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader
              closable
              className="flex flex-col gap-1 border-b border-divider"
            >
              <h2 className="text-xl font-bold">规则诊断结果</h2>
              {currentDiagnosisForward && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-small text-default-500 truncate flex-1 min-w-0">
                    {currentDiagnosisForward.name}
                  </span>
                  <Chip
                    className="flex-shrink-0"
                    color="primary"
                    size="sm"
                    variant="flat"
                  >
                    规则服务
                  </Chip>
                </div>
              )}
            </ModalHeader>
            <ModalBody className="bg-transparent">
              {diagnosisResult ? (
                <div className="space-y-4">
                  {diagnosisLoading && (
                    <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-primary">
                        <Spinner size="sm" />
                        <span>
                          正在诊断 {diagnosisProgress.completed}/
                          {diagnosisProgress.total > 0
                            ? diagnosisProgress.total
                            : "?"}
                        </span>
                      </div>
                      <Chip color="primary" size="sm" variant="flat">
                        流式更新中
                      </Chip>
                    </div>
                  )}

                  {diagnosisProgress.timedOut && (
                    <Alert
                      color="warning"
                      description="诊断超时（单条30秒 / 整体2分钟），以下为当前已完成结果。"
                      title="诊断超时"
                      variant="flat"
                    />
                  )}

                  {/* 统计摘要 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-default-100 rounded-lg border border-divider">
                      <div className="text-2xl font-bold text-foreground">
                        {diagnosisProgress.total > 0
                          ? diagnosisProgress.total
                          : diagnosisResult.results.length}
                      </div>
                      <div className="text-xs text-default-500 mt-1">
                        总测试数
                      </div>
                    </div>
                    <div className="text-center p-3 bg-success-50 dark:bg-success-900/20 rounded-lg border border-success-200 dark:border-success-700">
                      <div className="text-2xl font-bold text-success-600 dark:text-success-400">
                        {diagnosisProgress.completed > 0 ||
                        diagnosisProgress.total > 0
                          ? diagnosisProgress.success
                          : diagnosisResult.results.filter((r) => r.success)
                              .length}
                      </div>
                      <div className="text-xs text-success-600 dark:text-success-400/80 mt-1">
                        成功
                      </div>
                    </div>
                    <div className="text-center p-3 bg-danger-50 dark:bg-danger-900/20 rounded-lg border border-danger-200 dark:border-danger-700">
                      <div className="text-2xl font-bold text-danger-600 dark:text-danger-400">
                        {diagnosisProgress.completed > 0 ||
                        diagnosisProgress.total > 0
                          ? diagnosisProgress.failed
                          : diagnosisResult.results.filter((r) => !r.success)
                              .length}
                      </div>
                      <div className="text-xs text-danger-600 dark:text-danger-400/80 mt-1">
                        失败
                      </div>
                    </div>
                  </div>

                  {/* 桌面端表格展示 */}
                  <div className="hidden md:block space-y-3">
                    {(() => {
                      // 使用后端返回的 chainType 和 inx 字段进行分组
                      const groupedResults = {
                        entry: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 1,
                        ),
                        chains: {} as Record<
                          number,
                          typeof diagnosisResult.results
                        >,
                        exit: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 3,
                        ),
                      };

                      // 按 inx 分组链路测试
                      diagnosisResult.results.forEach((r) => {
                        if (r.fromChainType === 2 && r.fromInx != null) {
                          if (!groupedResults.chains[r.fromInx]) {
                            groupedResults.chains[r.fromInx] = [];
                          }
                          groupedResults.chains[r.fromInx].push(r);
                        }
                      });

                      const renderTableSection = (
                        title: string,
                        results: typeof diagnosisResult.results,
                      ) => {
                        if (results.length === 0) return null;

                        return (
                          <div
                            key={title}
                            className="border border-divider rounded-lg overflow-hidden"
                          >
                            <div className="bg-primary/10 dark:bg-primary/20 px-3 py-2 border-b border-divider">
                              <h3 className="text-sm font-semibold text-primary">
                                {title}
                              </h3>
                            </div>
                            <table className="w-full text-sm">
                              <thead className="bg-default-100">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-xs">
                                    路径
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-20">
                                    状态
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-24">
                                    延迟(ms)
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-24">
                                    丢包率
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-20">
                                    质量
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-divider bg-content1">
                                {results.map((result, index) => {
                                  const isDiagnosing = Boolean(
                                    result.diagnosing,
                                  );
                                  const isSuccess = result.success === true;
                                  const quality =
                                    getForwardDiagnosisQualityDisplay(
                                      result.averageTime,
                                      result.packetLoss,
                                    );

                                  return (
                                    <tr
                                      key={index}
                                      className={`hover:bg-default-50 dark:hover:bg-gray-700/50 ${
                                        isDiagnosing
                                          ? "bg-warning-50 dark:bg-warning-900/20"
                                          : isSuccess
                                            ? "bg-content1"
                                            : "bg-danger-50 dark:bg-danger-900/30"
                                      }`}
                                    >
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          {isDiagnosing ? (
                                            <Spinner size="sm" />
                                          ) : (
                                            <span
                                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                                                isSuccess
                                                  ? "bg-success text-white"
                                                  : "bg-danger text-white"
                                              }`}
                                            >
                                              {isSuccess ? "✓" : "✗"}
                                            </span>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-foreground truncate">
                                              {result.description}
                                            </div>
                                            <div className="text-xs text-default-500 truncate">
                                              {result.targetIp}:
                                              {result.targetPort}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <Chip
                                          color={
                                            isDiagnosing
                                              ? "warning"
                                              : isSuccess
                                                ? "success"
                                                : "danger"
                                          }
                                          size="sm"
                                          variant="flat"
                                        >
                                          {isDiagnosing
                                            ? "诊断中"
                                            : isSuccess
                                              ? "成功"
                                              : "失败"}
                                        </Chip>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {isSuccess ? (
                                          <span className="font-semibold text-primary">
                                            {result.averageTime?.toFixed(0)}
                                          </span>
                                        ) : (
                                          <span className="text-default-400">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {isSuccess ? (
                                          <span
                                            className={`font-semibold ${
                                              (result.packetLoss || 0) > 0
                                                ? "text-warning"
                                                : "text-success"
                                            }`}
                                          >
                                            {result.packetLoss?.toFixed(1)}%
                                          </span>
                                        ) : (
                                          <span className="text-default-400">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {isSuccess && quality ? (
                                          <Chip
                                            className="text-xs whitespace-nowrap"
                                            color={quality.color as any}
                                            size="sm"
                                            variant="flat"
                                          >
                                            {quality.text}
                                          </Chip>
                                        ) : (
                                          <span className="text-default-400">
                                            -
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      };

                      return (
                        <>
                          {/* 入口测试 */}
                          {renderTableSection(
                            "🚪 入口测试",
                            groupedResults.entry,
                          )}

                          {/* 链路测试（按跳数排序） */}
                          {Object.keys(groupedResults.chains)
                            .map(Number)
                            .sort((a, b) => a - b)
                            .map((hop) =>
                              renderTableSection(
                                `🔗 转发链 - 第${hop}跳`,
                                groupedResults.chains[hop],
                              ),
                            )}

                          {/* 出口测试 */}
                          {renderTableSection(
                            "🚀 出口测试",
                            groupedResults.exit,
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* 移动端卡片展示 */}
                  <div className="md:hidden space-y-3">
                    {(() => {
                      // 使用后端返回的 chainType 和 inx 字段进行分组
                      const groupedResults = {
                        entry: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 1,
                        ),
                        chains: {} as Record<
                          number,
                          typeof diagnosisResult.results
                        >,
                        exit: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 3,
                        ),
                      };

                      // 按 inx 分组链路测试
                      diagnosisResult.results.forEach((r) => {
                        if (r.fromChainType === 2 && r.fromInx != null) {
                          if (!groupedResults.chains[r.fromInx]) {
                            groupedResults.chains[r.fromInx] = [];
                          }
                          groupedResults.chains[r.fromInx].push(r);
                        }
                      });

                      const renderCardSection = (
                        title: string,
                        results: typeof diagnosisResult.results,
                      ) => {
                        if (results.length === 0) return null;

                        return (
                          <div key={title} className="space-y-2">
                            <div className="px-2 py-1.5 bg-primary/10 dark:bg-primary/20 rounded-lg border border-primary/30">
                              <h3 className="text-sm font-semibold text-primary">
                                {title}
                              </h3>
                            </div>
                            {results.map((result, index) => {
                              const isDiagnosing = Boolean(result.diagnosing);
                              const isSuccess = result.success === true;
                              const quality = getForwardDiagnosisQualityDisplay(
                                result.averageTime,
                                result.packetLoss,
                              );

                              return (
                                <div
                                  key={index}
                                  className={`border rounded-lg p-3 ${
                                    isDiagnosing
                                      ? "border-warning-200 dark:border-warning-300/30 bg-warning-50 dark:bg-warning-900/20"
                                      : isSuccess
                                        ? "border-divider bg-content1"
                                        : "border-danger-200 dark:border-danger-300/30 bg-danger-50 dark:bg-danger-900/30"
                                  }`}
                                >
                                  <div className="flex items-start gap-2 mb-2">
                                    {isDiagnosing ? (
                                      <Spinner size="sm" />
                                    ) : (
                                      <span
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                                          isSuccess
                                            ? "bg-success text-white"
                                            : "bg-danger text-white"
                                        }`}
                                      >
                                        {isSuccess ? "✓" : "✗"}
                                      </span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm text-foreground break-words">
                                        {result.description}
                                      </div>
                                      <div className="text-xs text-default-500 mt-0.5 break-all">
                                        {result.targetIp}:{result.targetPort}
                                      </div>
                                    </div>
                                    <Chip
                                      className="flex-shrink-0"
                                      color={
                                        isDiagnosing
                                          ? "warning"
                                          : isSuccess
                                            ? "success"
                                            : "danger"
                                      }
                                      size="sm"
                                      variant="flat"
                                    >
                                      {isDiagnosing
                                        ? "诊断中"
                                        : isSuccess
                                          ? "成功"
                                          : "失败"}
                                    </Chip>
                                  </div>

                                  {isSuccess ? (
                                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-divider">
                                      <div className="text-center">
                                        <div className="text-lg font-bold text-primary">
                                          {result.averageTime?.toFixed(0)}
                                        </div>
                                        <div className="text-xs text-default-500">
                                          延迟(ms)
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        <div
                                          className={`text-lg font-bold ${
                                            (result.packetLoss || 0) > 0
                                              ? "text-warning"
                                              : "text-success"
                                          }`}
                                        >
                                          {result.packetLoss?.toFixed(1)}%
                                        </div>
                                        <div className="text-xs text-default-500">
                                          丢包率
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        {quality && (
                                          <>
                                            <Chip
                                              className="text-xs whitespace-nowrap"
                                              color={quality.color as any}
                                              size="sm"
                                              variant="flat"
                                            >
                                              {quality.text}
                                            </Chip>
                                            <div className="text-xs text-default-500 mt-0.5">
                                              质量
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-2 pt-2 border-t border-divider">
                                      <div
                                        className={`text-xs ${
                                          isDiagnosing
                                            ? "text-warning"
                                            : "text-danger"
                                        }`}
                                      >
                                        {isDiagnosing
                                          ? result.message || "诊断中..."
                                          : result.message || "连接失败"}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      };

                      return (
                        <>
                          {/* 入口测试 */}
                          {renderCardSection(
                            "🚪 入口测试",
                            groupedResults.entry,
                          )}

                          {/* 链路测试（按跳数排序） */}
                          {Object.keys(groupedResults.chains)
                            .map(Number)
                            .sort((a, b) => a - b)
                            .map((hop) =>
                              renderCardSection(
                                `🔗 转发链 - 第${hop}跳`,
                                groupedResults.chains[hop],
                              ),
                            )}

                          {/* 出口测试 */}
                          {renderCardSection(
                            "🚀 出口测试",
                            groupedResults.exit,
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* 失败详情（仅桌面端显示，移动端已在卡片中显示） */}
                  {diagnosisResult.results.some(
                    (r) => r.success === false && !r.diagnosing,
                  ) && (
                    <div className="space-y-2 hidden md:block">
                      <h4 className="text-sm font-semibold text-danger">
                        失败详情
                      </h4>
                      <div className="space-y-2">
                        {diagnosisResult.results
                          .filter((r) => r.success === false && !r.diagnosing)
                          .map((result, index) => (
                            <Alert
                              key={index}
                              className="text-xs"
                              color="danger"
                              description={result.message || "连接失败"}
                              title={result.description}
                              variant="flat"
                            />
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      aria-hidden="true"
                      className="w-8 h-8 text-default-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    暂无诊断数据
                  </h3>
                </div>
              )}
            </ModalBody>
            <ModalFooter className="border-t border-divider">
              {currentDiagnosisForward && (
                <Button
                  color="primary"
                  isLoading={diagnosisLoading}
                  onPress={() => handleDiagnose(currentDiagnosisForward)}
                >
                  重新诊断
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
