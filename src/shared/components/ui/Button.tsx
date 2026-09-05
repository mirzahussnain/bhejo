import React from "react";
import Link from "next/link";
import { cn } from "@/shared/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonBaseProps {
  readonly children: React.ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  readonly isLoading?: boolean;
  readonly disabled?: boolean;
  readonly icon?: React.ReactNode;
  readonly iconPlacement?: "left" | "right";
  readonly className?: string;
}

export type ButtonProps = ButtonBaseProps &
  (
    | (React.ButtonHTMLAttributes<HTMLButtonElement> & { readonly href?: undefined })
    | (React.AnchorHTMLAttributes<HTMLAnchorElement> & { readonly href: string })
  );

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-xs hover:bg-brand-dark focus-visible:ring-brand/40 border border-transparent",
  secondary:
    "border border-canvas-border bg-canvas-card text-canvas-text shadow-2xs hover:border-brand-border hover:bg-canvas-subtle hover:text-brand focus-visible:ring-brand/40",
  outline:
    "border border-brand text-brand bg-transparent hover:bg-brand-subtle focus-visible:ring-brand/40",
  ghost:
    "text-canvas-muted hover:text-brand hover:bg-canvas-subtle focus-visible:ring-brand/40 border border-transparent",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 py-1.5 text-xs rounded-xl gap-1.5 font-semibold",
  md: "min-h-11 px-5 py-2.5 text-sm rounded-2xl gap-2 font-semibold",
  lg: "min-h-13 px-6 py-3 text-sm sm:text-base rounded-2xl gap-2.5 font-bold",
};

/**
 * Reusable semantic Button micro-component.
 * Strictly adheres to Tailwind v4 semantic theme tokens for color consistency across all views.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  icon,
  iconPlacement = "right",
  className = "",
  href,
  disabled,
  ...rest
}: ButtonProps) {
  const commonClasses = cn(
    "inline-flex items-center justify-center transition-all duration-150 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
    VARIANT_STYLES[variant],
    SIZE_STYLES[size],
    fullWidth ? "w-full" : "",
    className
  );

  const content = (
    <>
      {isLoading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : icon && iconPlacement === "left" ? (
        <span className="shrink-0">{icon}</span>
      ) : null}

      <span>{children}</span>

      {!isLoading && icon && iconPlacement === "right" && (
        <span className="shrink-0">{icon}</span>
      )}
    </>
  );

  if (href) {
    const anchorProps = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <Link href={href} className={commonClasses} {...anchorProps}>
        {content}
      </Link>
    );
  }

  const buttonProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type={buttonProps.type || "button"}
      disabled={disabled || isLoading}
      className={commonClasses}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
