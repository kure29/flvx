import type * as React from "react";
import type { ViewMode } from "@/components/view-mode";

import { MoreHorizontal, Search, X } from "lucide-react";

import { AnimatedPage } from "@/components/animated-page";
import { ViewModeToggle } from "@/components/view-mode";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@/shadcn-bridge/heroui/dropdown";

/*
 * Building blocks every page uses, so pages look alike:
 *   PageHeader   title, one line of help, one primary action
 *   PageTabs     the only tab style
 *   PageToolbar  search, filters, and secondary actions behind "更多"
 *   ListRow      one item per row; tapping opens its actions
 *   EmptyHint    what to do when a list is empty
 */

export interface PageAction {
  key: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  primary,
  secondary,
}: {
  title: string;
  description?: React.ReactNode;
  primary?: PageAction;
  /** A second, quieter action left of the primary one. */
  secondary?: PageAction;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && (
          <p className="mt-0.5 text-xs text-default-500">{description}</p>
        )}
      </div>
      {(primary || secondary) && (
        <div className="flex shrink-0 gap-2">
          {secondary && (
            <Button
              className="gap-1.5 border-default-300 text-foreground dark:text-foreground"
              isDisabled={secondary.disabled}
              size="sm"
              startContent={secondary.icon}
              variant="bordered"
              onPress={secondary.onPress}
            >
              {secondary.label}
            </Button>
          )}
          {primary && (
            <Button
              color="primary"
              isDisabled={primary.disabled}
              size="sm"
              onPress={primary.onPress}
            >
              {primary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface PageTab<T extends string> {
  key: T;
  label: string;
  badge?: React.ReactNode;
}

export function PageTabs<T extends string>({
  value,
  tabs,
  onChange,
}: {
  value: T;
  tabs: Array<PageTab<T>>;
  onChange: (key: T) => void;
}) {
  return (
    <div
      className="mb-4 grid gap-1 rounded-full bg-default-100 p-1 sm:max-w-md"
      role="tablist"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          aria-selected={value === t.key}
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
            value === t.key
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-default-500 hover:text-default-700"
          }`}
          role="tab"
          type="button"
          onClick={() => onChange(t.key)}
        >
          <span className="truncate">{t.label}</span>
          {t.badge !== undefined && t.badge !== null && (
            <span
              className={`shrink-0 rounded-full px-1.5 text-[11px] leading-4 ${
                value === t.key
                  ? "bg-primary/10 text-primary"
                  : "bg-default-200 text-default-500"
              }`}
            >
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function PageToolbar({
  search,
  onSearch,
  placeholder = "搜索",
  children,
  more,
  primary,
  view,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  /** Filters shown next to the search box. */
  children?: React.ReactNode;
  /** Secondary actions, behind a "更多" menu. */
  more?: PageAction[];
  /**
   * The main action, for a tab inside a page whose header holds no
   * action of its own.
   */
  primary?: PageAction;
  /** The list / card switch, kept at the right end. */
  view?: { value: ViewMode; onChange: (m: ViewMode) => void };
}) {
  const actions = (more ?? []).filter(Boolean);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 sm:flex-nowrap">
      {onSearch && (
        // With a main action too, the search gets a row of its own on a
        // phone instead of shrinking to its icon.
        <label
          className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-default-100 px-3.5 sm:max-w-xs ${primary ? "basis-full sm:basis-auto" : ""}`}
        >
          <Search className="h-4 w-4 shrink-0 text-default-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-default-400"
            enterKeyHint="search"
            placeholder={placeholder}
            type="text"
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
          />
          {search && (
            <button
              aria-label="清除搜索"
              className="text-default-400"
              type="button"
              onClick={() => onSearch("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      )}
      {children}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {view && <ViewModeToggle value={view.value} onChange={view.onChange} />}
        {actions.length > 0 && (
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <button
                aria-label="更多操作"
                className="flex h-9 items-center gap-1 rounded-full bg-default-100 px-3 text-sm text-default-600 transition-colors hover:bg-default-200"
                type="button"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">更多</span>
              </button>
            </DropdownTrigger>
            <DropdownMenu aria-label="更多操作">
              {actions.map((a) => (
                <DropdownItem
                  key={a.key}
                  className={a.disabled ? "pointer-events-none opacity-50" : ""}
                  color={a.danger ? "danger" : "default"}
                  onPress={a.disabled ? undefined : a.onPress}
                >
                  {a.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        )}
        {primary && (
          <Button
            className="shrink-0 rounded-full"
            color="primary"
            isDisabled={primary.disabled}
            size="sm"
            onPress={primary.onPress}
          >
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A filter button for the toolbar; highlighted while a filter is on. */
export function ToolbarButton({
  active,
  children,
  onPress,
}: {
  active?: boolean;
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <button
      className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm transition-colors ${
        active
          ? "bg-primary/10 font-medium text-primary"
          : "bg-default-100 text-default-600 hover:bg-default-200"
      }`}
      type="button"
      onClick={onPress}
    >
      {children}
    </button>
  );
}

/** Bar shown while picking items for a batch action. */
export function SelectionBar({
  count,
  allSelected,
  onToggleAll,
  actions,
  onExit,
}: {
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  actions: PageAction[];
  onExit: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-divider bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
      <span className="text-sm text-default-600">已选 {count} 个</span>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="flat" onPress={onToggleAll}>
          {allSelected ? "取消全选" : "全选"}
        </Button>
        {actions.map((a) => (
          <Button
            key={a.key}
            color={a.danger ? "danger" : "default"}
            isDisabled={a.disabled || count === 0}
            size="sm"
            variant="flat"
            onPress={a.onPress}
          >
            {a.label}
          </Button>
        ))}
        <Button size="sm" variant="light" onPress={onExit}>
          完成
        </Button>
      </div>
    </div>
  );
}

export type RowStatus = "ok" | "warn" | "bad" | "off";

const STATUS_DOT: Record<RowStatus, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  off: "bg-default-300",
};

/** One item of a list. Tapping it opens its actions. */
export function ListRow({
  status,
  statusTitle,
  title,
  badges,
  meta,
  footer,
  right,
  selectMode,
  selected,
  onSelect,
  onPress,
}: {
  status?: RowStatus;
  statusTitle?: string;
  title: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  /** Below the meta line, e.g. a usage bar. */
  footer?: React.ReactNode;
  /** Shown at the end of the row; clicks on it do not open the row. */
  right?: React.ReactNode;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onPress: () => void;
}) {
  const activate = selectMode ? onSelect : onPress;

  return (
    <div
      aria-pressed={selectMode ? selected : undefined}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-colors ${
        selected
          ? "border-primary bg-primary-50/70 dark:bg-primary-900/40"
          : "border-divider bg-content1 hover:bg-default-100"
      }`}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate?.();
        }
      }}
    >
      {selectMode && (
        <div
          className="flex shrink-0"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox isSelected={selected} onValueChange={() => onSelect?.()} />
        </div>
      )}
      {status && (
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
          title={statusTitle}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{title}</span>
          {badges}
        </div>
        {meta && (
          <div className="truncate text-xs text-default-500">{meta}</div>
        )}
        {footer && <div className="mt-1.5">{footer}</div>}
      </div>
      {right && !selectMode && (
        <div
          className="flex shrink-0 items-center gap-2"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          {right}
        </div>
      )}
    </div>
  );
}

export function ListGroup({
  title,
  count,
  children,
}: {
  title?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      {title && (
        <h2 className="flex items-baseline gap-2 px-1 text-sm font-semibold">
          {title}
          {count !== undefined && (
            <span className="text-xs font-normal text-default-400">
              {count}
            </span>
          )}
        </h2>
      )}
      <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">{children}</div>
    </section>
  );
}

export function EmptyHint({
  text,
  action,
}: {
  text: React.ReactNode;
  action?: PageAction;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-divider px-4 py-8 text-center text-sm text-default-500">
      <p>{text}</p>
      {action && (
        <Button
          color="primary"
          size="sm"
          variant="flat"
          onPress={action.onPress}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 2030-01-01; with time: 2030-01-01 08:00. Empty for no date. */
export function formatDate(ms?: number | string | null, withTime = false) {
  if (ms === undefined || ms === null || ms === "" || ms === 0) return "";
  const d = new Date(typeof ms === "string" && /^\d+$/.test(ms) ? +ms : ms);

  if (Number.isNaN(d.getTime())) return "";
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return withTime
    ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : date;
}

/**
 * A page that can also sit inside another page's tab (the 用户 page hosts
 * 分组 and 限速): embedded, it drops its own padding and header.
 */
export function PageShell({
  embedded,
  children,
}: {
  embedded?: boolean;
  children: React.ReactNode;
}) {
  return embedded ? (
    <div>{children}</div>
  ) : (
    <AnimatedPage className="px-3 lg:px-6 py-6">{children}</AnimatedPage>
  );
}
