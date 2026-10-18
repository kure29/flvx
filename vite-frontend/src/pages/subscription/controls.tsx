import { useEffect, useRef } from "react";

import { Switch } from "@/shadcn-bridge/heroui/switch";

/** Small controls shared by the subscription editors. */

/**
 * A choice between a few options: bordered buttons, the picked one
 * outlined in the primary colour, so it reads on a white page too.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="grid gap-2"
      role="radiogroup"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map(([k, label]) => (
        <button
          key={k}
          aria-checked={value === k}
          className={`rounded-xl border px-2 py-2 text-sm transition-colors ${
            value === k
              ? "border-primary bg-primary-50 font-medium text-primary dark:bg-primary-900/30"
              : "border-default-200 bg-content1 text-default-600 hover:border-default-400 dark:border-default-100"
          }`}
          role="radio"
          type="button"
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The editor's page tabs: text with an underline under the current one. */
export function EditorTabs<T extends string>({
  value,
  tabs,
  onChange,
}: {
  value: T;
  tabs: Array<{ key: T; label: string; badge?: string | number }>;
  onChange: (v: T) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);

  // On a phone the tabs scroll sideways; keep the picked one in view.
  useEffect(() => {
    bar.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div
      ref={bar}
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-divider px-1 [scrollbar-width:none]"
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          aria-selected={value === t.key}
          className={`-mb-px flex shrink-0 items-center gap-1 border-b-2 px-3 pb-2 pt-1 text-sm transition-colors ${
            value === t.key
              ? "border-primary font-medium text-primary"
              : "border-transparent text-default-500 hover:text-foreground"
          }`}
          role="tab"
          type="button"
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.badge !== undefined && t.badge !== "" && (
            <span
              className={`rounded-full px-1.5 text-[11px] leading-4 ${
                value === t.key
                  ? "bg-primary text-white"
                  : "bg-default-100 text-default-500"
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

export function ToggleRow({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        aria-labelledby={`${id}-label`}
        id={id}
        isDisabled={disabled}
        isSelected={value}
        size="sm"
        onValueChange={onChange}
      />
      <label
        className="flex cursor-pointer flex-col"
        htmlFor={id}
        id={`${id}-label`}
      >
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-default-500">{hint}</span>}
      </label>
    </div>
  );
}
