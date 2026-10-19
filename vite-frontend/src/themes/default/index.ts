/**
 * Default Theme
 * =============
 * This is the built-in "stock" FLYX theme.  It doesn't override any
 * components — it only declares the CSS tokens that match the colours
 * already defined in `globals.css`.  This serves as the **reference
 * implementation** that theme authors can copy and modify.
 *
 * When this theme is active, the frontend looks identical to an
 * unmodified FLYX install.
 */

import type { ThemePackage } from "../types";

const defaultTheme: ThemePackage = {
  id: "default",
  name: "默认主题",
  author: "FLYX Team",
  version: "1.0.0",
  description: "FLYX 内置默认蓝色主题",

  tokens: {
    light: {
      "--background": "#f6f7fb",
      "--foreground": "#111827",
      "--border": "#e5e7eb",
      "--input": "#d1d5db",
      "--ring": "#93c5fd",
      "--content1": "#ffffff",
      "--divider": "#e5e7eb",

      "--default-50": "#f9fafb",
      "--default-100": "#f3f4f6",
      "--default-200": "#e5e7eb",
      "--default-300": "#d1d5db",
      "--default-400": "#9ca3af",
      "--default-500": "#6b7280",
      "--default-600": "#4b5563",
      "--default-700": "#374151",
      "--default-800": "#1f2937",
      "--default-900": "#111827",

      "--primary": "#2563eb",
      "--primary-foreground": "#ffffff",
      "--primary-50": "#eff6ff",
      "--primary-100": "#dbeafe",
      "--primary-200": "#bfdbfe",
      "--primary-300": "#93c5fd",
      "--primary-400": "#60a5fa",
      "--primary-500": "#3b82f6",
      "--primary-600": "#2563eb",
      "--primary-700": "#1d4ed8",
      "--primary-800": "#1e40af",
      "--primary-900": "#1e3a8a",

      "--secondary": "#6366f1",
      "--secondary-foreground": "#ffffff",
      "--secondary-50": "#eef2ff",
      "--secondary-100": "#e0e7ff",
      "--secondary-200": "#c7d2fe",
      "--secondary-300": "#a5b4fc",
      "--secondary-400": "#818cf8",
      "--secondary-500": "#6366f1",
      "--secondary-600": "#4f46e5",
      "--secondary-700": "#4338ca",
      "--secondary-800": "#3730a3",
      "--secondary-900": "#312e81",

      "--danger": "#dc2626",
      "--danger-50": "#fef2f2",
      "--danger-100": "#fee2e2",
      "--danger-200": "#fecaca",
      "--danger-300": "#fca5a5",
      "--danger-400": "#f87171",
      "--danger-500": "#ef4444",
      "--danger-600": "#dc2626",
      "--danger-700": "#b91c1c",
      "--danger-800": "#991b1b",
      "--danger-900": "#7f1d1d",

      "--success": "#16a34a",
      "--success-50": "#f0fdf4",
      "--success-100": "#dcfce7",
      "--success-200": "#bbf7d0",
      "--success-300": "#86efac",
      "--success-400": "#4ade80",
      "--success-500": "#22c55e",
      "--success-600": "#16a34a",
      "--success-700": "#15803d",
      "--success-800": "#166534",
      "--success-900": "#14532d",

      "--warning": "#d97706",
      "--warning-50": "#fffbeb",
      "--warning-100": "#fef3c7",
      "--warning-200": "#fde68a",
      "--warning-300": "#fcd34d",
      "--warning-400": "#fbbf24",
      "--warning-500": "#f59e0b",
      "--warning-600": "#d97706",
      "--warning-700": "#b45309",
      "--warning-800": "#92400e",
      "--warning-900": "#78350f",
    },

    dark: {
      "--background": "#0b1020",
      "--foreground": "#f3f4f6",
      "--border": "#334155",
      "--input": "#475569",
      "--ring": "#60a5fa",
      "--content1": "#111827",
      "--divider": "#334155",

      "--default-50": "#0f172a",
      "--default-100": "#1e293b",
      "--default-200": "#334155",
      "--default-300": "#475569",
      "--default-400": "#64748b",
      "--default-500": "#94a3b8",
      "--default-600": "#cbd5e1",
      "--default-700": "#e2e8f0",
      "--default-800": "#f1f5f9",
      "--default-900": "#f8fafc",

      "--primary": "#3b82f6",
      "--secondary": "#818cf8",
      "--danger": "#ef4444",
      "--success": "#22c55e",
      "--warning": "#f59e0b",
    },
  },

  // No component/layout/page overrides — uses all defaults.
};

export default defaultTheme;
