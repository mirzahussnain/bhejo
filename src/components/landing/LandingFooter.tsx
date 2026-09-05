import React from "react";
import Link from "next/link";
import { BhejoWordmark } from "@/shared/components/ui/BhejoWordmark";
import { FOOTER_COLUMNS } from "@/shared/constants/landing";

/**
 * Landing Page Footer.
 * Semantic footer with single-line desktop bottom bar and brand wordmark.
 */
export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-canvas-border bg-canvas-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand Info Column */}
          <div className="flex flex-col items-start md:col-span-4">
            <BhejoWordmark size="sm" />
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-canvas-muted">
              Privacy-first document scanning. Send secure links to recipients and capture high-resolution documents directly inside mobile browsers.
            </p>

            {/* Operational Status Pill */}
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-canvas-border bg-canvas-subtle px-3 py-1 text-[11px] font-medium text-canvas-text">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All scanning services operational</span>
            </div>
          </div>

          {/* Links Columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-8">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-canvas-text">
                  {column.title}
                </h4>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-xs text-canvas-muted transition-colors hover:text-brand"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Single-Line Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-canvas-border pt-8 text-xs text-canvas-muted sm:flex-row">
          <p>© {currentYear} Bhejo. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="font-mono text-[11px]">100% Client-Side WebAssembly</span>
            <Link href="/login" className="hover:text-brand transition-colors">
              Owner Sign In
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
