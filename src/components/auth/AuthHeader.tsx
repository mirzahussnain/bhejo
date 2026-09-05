import React from "react";
import Link from "next/link";
import { BhejoLogo } from "@/shared/components/ui/BhejoLogo";

interface AuthHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly linkText: string;
  readonly linkHref: string;
}

/**
 * Top center Bhejo Logo and text header for Auth pages.
 * Fully semantic theme tokens with consistent brand palette.
 */
export function AuthHeader({
  title,
  subtitle,
  linkText,
  linkHref,
}: AuthHeaderProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Clickable Brand Logo & Text */}
      <Link
        href="/"
        className="group inline-flex flex-col items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-2xl p-1"
        aria-label="Bhejo Home"
      >
        <div className="flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
          <BhejoLogo size={44} />
        </div>
        <span className="text-2xl font-bold tracking-tight text-brand font-sans">
          Bhejo
        </span>
      </Link>

      {/* Page Title & Alternate Auth Link */}
      <h1 className="mt-6 text-2xl sm:text-3xl font-bold tracking-tight text-canvas-text">
        {title}
      </h1>
      <p className="mt-2 text-sm text-canvas-muted">
        {subtitle}{" "}
        <Link
          href={linkHref}
          className="font-semibold text-brand hover:text-brand-dark underline underline-offset-4 transition-colors"
        >
          {linkText}
        </Link>
      </p>
    </div>
  );
}
