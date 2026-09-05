import React from "react";
import { cn } from "@/shared/utils/cn";

interface BadgeProps {
  readonly children: React.ReactNode;
  readonly variant?: "brand" | "neutral" | "viewfinder";
  readonly className?: string;
  readonly hasDot?: boolean;
}

/**
 * Reusable semantic Badge micro-component.
 */
export function Badge({
  children,
  variant = "brand",
  className = "",
  hasDot = false,
}: BadgeProps) {
  const variantStyles = {
    brand:
      "bg-brand-subtle text-brand border border-brand-border/60 shadow-xs",
    neutral:
      "bg-canvas-card text-canvas-muted border border-canvas-border shadow-xs",
    viewfinder:
      "bg-viewfinder-card/80 text-white border border-viewfinder-border shadow-md backdrop-blur-sm",
  };

  const dotStyles = {
    brand: "bg-brand",
    neutral: "bg-slate-400",
    viewfinder: "bg-viewfinder-accent shadow-[0_0_8px_rgba(56,189,248,0.8)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
        variantStyles[variant],
        className
      )}
    >
      {hasDot && (
        <span
          className={cn("size-1.5 rounded-full animate-pulse", dotStyles[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
