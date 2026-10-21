import type * as React from "react";

import { Button } from "@/shadcn-bridge/heroui/button";
import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";

/*
 * Card for the card view of pages the upstream panel has no card for
 * (落地, 中转, 订阅), drawn like its node card: name with a status pill,
 * label / value rows, and a grid of flat action buttons at the bottom.
 */

/**
 * The card grid: one column fewer than upstream at each size, as this
 * panel's sidebar is wider and names would be cut off.
 */
export const CARD_GRID =
  "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4";

export type CardTone = "success" | "danger" | "warning" | "default";

const PILL: Record<CardTone, [string, string]> = {
  success: ["bg-emerald-500/20 text-emerald-600", "bg-emerald-500"],
  danger: ["bg-rose-500/20 text-rose-600", "bg-rose-500"],
  warning: ["bg-amber-500/20 text-amber-600", "bg-amber-500"],
  default: ["bg-default-200/70 text-default-600", "bg-default-400"],
};

export interface InfoCardAction {
  key: string;
  label: string;
  color?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "default";
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}

export function InfoCard({
  title,
  status,
  tone,
  headerRight,
  badges,
  rows,
  children,
  actions,
  selectMode,
  selected,
  onSelect,
  onPress,
}: {
  title: React.ReactNode;
  status: string;
  tone: CardTone;
  /** Next to the title, e.g. an on/off switch; clicks don't open the card. */
  headerRight?: React.ReactNode;
  badges?: React.ReactNode;
  rows: Array<[string, React.ReactNode]>;
  /** Shown under the rows, e.g. a usage bar. */
  children?: React.ReactNode;
  actions?: InfoCardAction[];
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onPress?: () => void;
}) {
  const [pill, dot] = PILL[tone];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const list = actions ?? [];

  return (
    <Card
      className={`group relative h-full flex flex-col overflow-visible ${onPress ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={selectMode ? onSelect : onPress}
    >
      <CardHeader className="pb-3 md:pb-3">
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {selectMode && (
              <div role="presentation" onClick={stop}>
                <Checkbox
                  className="mt-0.5"
                  isSelected={selected}
                  onValueChange={() => onSelect?.()}
                />
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-lg font-semibold leading-5 text-foreground">
                  {title}
                </h3>
                <div
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${pill}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {status}
                </div>
              </div>
            </div>
          </div>
          {headerRight && !selectMode && (
            <div
              className="ml-2 flex-shrink-0 self-start"
              role="presentation"
              onClick={stop}
            >
              {headerRight}
            </div>
          )}
        </div>
      </CardHeader>

      <CardBody className="flex flex-1 flex-col pb-3 pt-0 md:pb-3 md:pt-0">
        {badges && <div className="mb-3 flex flex-wrap gap-1.5">{badges}</div>}
        <div className="mb-4 space-y-2 empty:hidden">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex min-w-0 items-center justify-between gap-2 text-sm"
            >
              <span className="flex-shrink-0 text-default-600">{label}</span>
              <span className="min-w-0 truncate text-right text-xs">
                {value}
              </span>
            </div>
          ))}
        </div>
        {children && <div className="mb-4">{children}</div>}
        {list.length > 0 && !selectMode && (
          <div
            className="mt-auto grid gap-1.5"
            role="presentation"
            style={{
              gridTemplateColumns: `repeat(${Math.min(list.length, 3)}, minmax(0, 1fr))`,
            }}
            onClick={stop}
          >
            {list.map((a) => (
              <Button
                key={a.key}
                className="min-h-8"
                color={a.color ?? "default"}
                isDisabled={a.disabled}
                isLoading={a.loading}
                size="sm"
                variant="flat"
                onPress={a.onPress}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
