import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ChipColor =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger";
type ChipVariant = "solid" | "flat" | "light" | "bordered";
type ChipSize = "sm" | "md" | "lg";

const flatColors: Record<ChipColor, string> = {
  default: "border-divider bg-default-100 text-default-600",
  primary: "border-primary/25 bg-primary/10 text-primary",
  secondary: "border-secondary/25 bg-secondary/10 text-secondary",
  success: "border-success/25 bg-success/10 text-success",
  warning:
    "border-warning/25 bg-warning/10 text-warning-700 dark:text-warning-400",
  danger: "border-danger/25 bg-danger/10 text-danger",
};

export interface ChipProps extends React.ComponentProps<"span"> {
  color?: ChipColor;
  size?: ChipSize;
  variant?: ChipVariant;
}

function colorVariant(color: ChipColor) {
  if (color === "danger") {
    return "destructive" as const;
  }
  if (color === "success") {
    return "success" as const;
  }
  if (color === "warning") {
    return "warning" as const;
  }
  if (color === "secondary") {
    return "secondary" as const;
  }

  return "default" as const;
}

export function Chip({
  children,
  className,
  color = "default",
  size = "md",
  variant = "solid",
  ...props
}: ChipProps) {
  return (
    <Badge
      className={cn(
        variant !== "solid" ? flatColors[color] : "",
        variant === "light" ? "border-transparent bg-transparent" : "",
        variant === "bordered" ? "border-current bg-transparent" : "",
        size === "sm" ? "px-2 py-0 text-[10px]" : "",
        size === "lg" ? "px-3 py-1 text-sm" : "",
        className,
      )}
      variant={colorVariant(color)}
      {...props}
    >
      {children}
    </Badge>
  );
}
