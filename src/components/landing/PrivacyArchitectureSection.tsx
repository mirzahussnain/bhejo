import React from "react";
import { ShieldCheck, LockKey, EyeSlash, XCircle, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { PRIVACY_SPECS } from "@/shared/constants/landing";
import { RadialGradientBackground } from "@/components/ui/tailwind-css-background-snippet";

/**
 * Privacy Architecture Section.
 * High-contrast comparison between Bhejo and traditional cloud scanning apps.
 */
export function PrivacyArchitectureSection() {
  return (
    <section id="privacy" className="relative scroll-mt-20 overflow-hidden border-t border-canvas-border bg-canvas py-20 lg:py-28">
      {/* Subtle Blended Radial Gradient Background */}
      <RadialGradientBackground opacityClassName="opacity-[0.16]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header: Clean Vertical Stack */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-canvas-text sm:text-4xl">
            Privacy as a Fundamental Guarantee
          </h2>
          <p className="mt-4 text-base leading-relaxed text-canvas-muted sm:text-lg">
            Traditional scanner applications stream live video frames to remote cloud servers. Bhejo confines frame analysis entirely inside recipient device memory.
          </p>
        </div>

        {/* 3 Privacy Pillars Cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-3xl border border-canvas-border bg-canvas-card p-6 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
              <EyeSlash size={22} weight="bold" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-canvas-text">Zero Video Streaming</h3>
            <p className="mt-2 text-sm leading-relaxed text-canvas-muted">
              Live camera analysis runs exclusively on the recipient device. Video frames are never recorded or transmitted.
            </p>
          </div>

          <div className="rounded-3xl border border-canvas-border bg-canvas-card p-6 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
              <LockKey size={22} weight="bold" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-canvas-text">Ephemeral Session Tokens</h3>
            <p className="mt-2 text-sm leading-relaxed text-canvas-muted">
              Links are protected by cryptographically unguessable tokens and optional PIN codes with automatic expiration.
            </p>
          </div>

          <div className="rounded-3xl border border-canvas-border bg-canvas-card p-6 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
              <ShieldCheck size={22} weight="bold" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-canvas-text">No External AI Training</h3>
            <p className="mt-2 text-sm leading-relaxed text-canvas-muted">
              Your sensitive documents (passports, tax forms, contracts) are never used to train third-party machine learning models.
            </p>
          </div>
        </div>

        {/* Technical Specification Matrix */}
        <div className="mt-10 overflow-hidden rounded-3xl border border-canvas-border bg-canvas-card shadow-xs">
          <div className="border-b border-canvas-border bg-canvas-subtle/60 px-6 py-4">
            <h3 className="text-sm font-bold text-brand">
              Technical Comparison: Local WebAssembly vs Cloud Scanners
            </h3>
          </div>
          <div className="divide-y divide-canvas-border">
            {PRIVACY_SPECS.map((row) => (
              <div
                key={row.capability}
                className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-12 sm:items-center"
              >
                <div className="font-semibold text-sm text-canvas-text sm:col-span-4">
                  {row.capability}
                </div>
                <div className="flex items-start gap-2 text-sm text-brand font-medium sm:col-span-4">
                  <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>{row.bhejo}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-canvas-muted sm:col-span-4">
                  <XCircle size={18} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />
                  <span>{row.traditional}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
