"use client";

import React from "react";
import {
  Cpu,
  UserCheck,
  Files,
  ShieldCheck,
  CornersOut,
  CheckCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/shared/components/ui/Badge";
import { FEATURE_BENTO_ITEMS } from "@/shared/constants/landing";
import { RadialGradientBackground } from "@/components/ui/tailwind-css-background-snippet";

/**
 * Feature Bento Section.
 * Asymmetric 4-cell Bento Grid with strict visual diversity:
 * - Cell 1: Light brand-subtle tint with interactive corner-math visual
 * - Cell 2: White card with friction comparison visual
 * - Cell 3: White card with multi-page physical stack preview
 * - Cell 4: Deep dark viewfinder card showing local RAM isolation boundary
 */
export function FeatureBentoSection() {
  return (
    <section id="features" className="relative scroll-mt-20 overflow-hidden border-t border-canvas-border bg-canvas-card py-20 lg:py-28">
      {/* Subtle Blended Radial Gradient Background */}
      <RadialGradientBackground opacityClassName="opacity-[0.16]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header: Clean Vertical Stack */}
        <div className="mx-auto max-w-2xl text-center">
          {/* Eyebrow (Eyebrow #2 on the page) */}
          <Badge variant="brand" className="mb-4">
            Computer Vision Architecture
          </Badge>
          <h2 className="text-3xl font-extrabold tracking-tight text-canvas-text sm:text-4xl">
            Built for Accuracy. Designed for Simplicity.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-canvas-muted sm:text-lg">
            Every feature eliminates user friction while maintaining the strictest privacy standards in document capture.
          </p>
        </div>

        {/* Asymmetric 4-Cell Bento Grid */}
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Cell 1: Spans 2 Columns (Computer Vision) */}
          <div className="flex flex-col justify-between overflow-hidden rounded-3xl border border-brand-border/80 bg-brand-subtle/50 p-6 sm:p-8 md:col-span-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-white shadow-xs">
                  <Cpu size={18} weight="bold" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-brand">
                  {FEATURE_BENTO_ITEMS[0].category}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-canvas-text sm:text-2xl">
                {FEATURE_BENTO_ITEMS[0].title}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-canvas-muted">
                {FEATURE_BENTO_ITEMS[0].subtitle}
              </p>
            </div>

            {/* Visual: Edge Detection Geometry Simulation */}
            <div className="mt-6 rounded-2xl border border-brand-border bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-canvas-border pb-2 text-xs font-mono text-brand-muted">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CornersOut size={16} className="text-brand" />
                  Quad Contour Validation
                </span>
                <span className="rounded-md bg-brand-subtle px-2 py-0.5 text-[10px] font-bold text-brand">
                  10 FPS WASM
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-[11px] text-canvas-muted sm:grid-cols-4">
                <div className="rounded-lg bg-canvas-subtle p-2">
                  <span className="text-canvas-muted">Top-L:</span> <span className="font-bold text-canvas-text">[48, 72]</span>
                </div>
                <div className="rounded-lg bg-canvas-subtle p-2">
                  <span className="text-canvas-muted">Top-R:</span> <span className="font-bold text-canvas-text">[592, 68]</span>
                </div>
                <div className="rounded-lg bg-canvas-subtle p-2">
                  <span className="text-canvas-muted">Btm-R:</span> <span className="font-bold text-canvas-text">[604, 820]</span>
                </div>
                <div className="rounded-lg bg-canvas-subtle p-2">
                  <span className="text-canvas-muted">Btm-L:</span> <span className="font-bold text-canvas-text">[42, 814]</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cell 2: Spans 1 Column (Zero Friction) */}
          <div className="flex flex-col justify-between rounded-3xl border border-canvas-border bg-canvas-card p-6 sm:p-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-canvas-subtle text-brand">
                  <UserCheck size={18} weight="bold" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-canvas-muted">
                  {FEATURE_BENTO_ITEMS[1].category}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-canvas-text">
                {FEATURE_BENTO_ITEMS[1].title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-canvas-muted">
                {FEATURE_BENTO_ITEMS[1].subtitle}
              </p>
            </div>

            {/* Visual: Contrast Pill */}
            <div className="mt-6 space-y-2 rounded-2xl border border-canvas-border bg-canvas-subtle p-3.5 text-xs">
              <div className="flex items-center justify-between text-canvas-muted">
                <span>App Store Downloads</span>
                <span className="font-bold text-red-600">Zero</span>
              </div>
              <div className="flex items-center justify-between text-canvas-muted">
                <span>Account Creation</span>
                <span className="font-bold text-red-600">Zero</span>
              </div>
              <div className="flex items-center justify-between border-t border-canvas-border pt-2 text-canvas-text font-bold">
                <span>Tap to Scan</span>
                <span className="text-emerald-600">Instant</span>
              </div>
            </div>
          </div>

          {/* Cell 3: Spans 1 Column (Multi-Page Scanning) */}
          <div className="flex flex-col justify-between rounded-3xl border border-canvas-border bg-canvas-card p-6 sm:p-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-canvas-subtle text-brand">
                  <Files size={18} weight="bold" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-canvas-muted">
                  {FEATURE_BENTO_ITEMS[2].category}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-canvas-text">
                {FEATURE_BENTO_ITEMS[2].title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-canvas-muted">
                {FEATURE_BENTO_ITEMS[2].subtitle}
              </p>
            </div>

            {/* Visual: Page Stack Indicator */}
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-canvas-border bg-canvas-subtle p-4">
              <div className="flex -space-x-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-white border border-canvas-border font-bold text-xs shadow-xs text-brand">
                  1
                </div>
                <div className="flex size-9 items-center justify-center rounded-lg bg-white border border-canvas-border font-bold text-xs shadow-xs text-brand">
                  2
                </div>
                <div className="flex size-9 items-center justify-center rounded-lg bg-brand text-white font-bold text-xs shadow-xs">
                  +18
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">
                <CheckCircle size={14} weight="fill" /> Unified Bundle
              </span>
            </div>
          </div>

          {/* Cell 4: Spans 2 Columns (High-Contrast Viewfinder Dark Surface) */}
          <div className="flex flex-col justify-between overflow-hidden rounded-3xl border border-viewfinder-border bg-viewfinder p-6 text-white shadow-xl sm:p-8 md:col-span-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-white/10 text-viewfinder-accent shadow-xs">
                  <ShieldCheck size={18} weight="fill" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-viewfinder-accent">
                  {FEATURE_BENTO_ITEMS[3].category}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-white sm:text-2xl">
                {FEATURE_BENTO_ITEMS[3].title}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">
                {FEATURE_BENTO_ITEMS[3].subtitle}
              </p>
            </div>

            {/* Visual: Local Memory Boundary Pill */}
            <div className="mt-6 rounded-2xl border border-viewfinder-border bg-viewfinder-card p-4 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-white/90">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  <span>Sandbox: Local Mobile Browser Memory</span>
                </div>
                <div className="text-viewfinder-accent font-semibold">
                  Zero Video Uplink Streamed
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
