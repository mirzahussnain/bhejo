"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Link as LinkIcon,
  ChatCircleDots,
  Scan,
  ShieldCheck,
  CheckCircle,
  Clock,
  Key,
} from "@phosphor-icons/react";
import { HOW_IT_WORKS_STEPS } from "@/shared/constants/landing";
import { cn } from "@/shared/utils/cn";
import { RadialGradientBackground } from "@/components/ui/tailwind-css-background-snippet";

/**
 * How It Works Section.
 * Vertical stack header, 3-step interactive timeline with illustrative preview panels.
 */
export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="how-it-works" className="relative scroll-mt-20 overflow-hidden border-t border-canvas-border bg-canvas py-20 lg:py-28">
      {/* Subtle Blended Radial Gradient Background */}
      <RadialGradientBackground opacityClassName="opacity-[0.16]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header: Clean Vertical Stack (No Split Header) */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-canvas-text sm:text-4xl">
            Scanning Made Effortless for Both Sides
          </h2>
          <p className="mt-4 text-base leading-relaxed text-canvas-muted sm:text-lg">
            No confusing scanner apps for recipients. No blurry phone photos or crooked angles for you.
          </p>
        </div>

        {/* 3-Step Interactive Timeline Grid */}
        <div className="mt-14 grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Step Selector List (Left Col) */}
          <div className="flex flex-col gap-4 lg:col-span-6">
            {HOW_IT_WORKS_STEPS.map((step, idx) => {
              const isActive = activeStep === idx;
              return (
                <button
                  key={step.stepNumber}
                  type="button"
                  onClick={() => setActiveStep(idx)}
                  className={cn(
                    "group relative flex w-full flex-col rounded-3xl p-6 text-left transition-all duration-200 border cursor-pointer",
                    isActive
                      ? "bg-canvas-card border-brand shadow-sm ring-1 ring-brand/20"
                      : "bg-canvas-card/60 border-canvas-border hover:bg-canvas-card hover:border-brand-border/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "font-mono text-xs font-bold uppercase tracking-wider",
                        isActive ? "text-brand" : "text-canvas-muted"
                      )}
                    >
                      Step {step.stepNumber}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        isActive
                          ? "bg-brand-subtle text-brand"
                          : "bg-canvas-subtle text-canvas-muted"
                      )}
                    >
                      {step.tag}
                    </span>
                  </div>

                  <h3
                    className={cn(
                      "mt-2 text-lg font-bold tracking-tight transition-colors",
                      isActive ? "text-brand" : "text-canvas-text"
                    )}
                  >
                    {step.title}
                  </h3>

                  <p className="mt-1.5 text-sm leading-relaxed text-canvas-muted">
                    {step.summary}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Interactive Step Visualizer (Right Col) */}
          <div className="flex items-center justify-center lg:col-span-6">
            <div className="w-full max-w-lg rounded-3xl border border-canvas-border bg-canvas-card p-6 shadow-md sm:p-8">
              <AnimatePresence mode="wait">
                {activeStep === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2 border-b border-canvas-border pb-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-brand-subtle text-brand">
                        <LinkIcon size={18} weight="bold" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-brand">New Scan Request</p>
                        <p className="text-[11px] text-canvas-muted">Configuring secure session</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-canvas-border bg-canvas-subtle p-4 space-y-3">
                      <div>
                        <label className="text-[11px] font-semibold text-canvas-text block">Document Title</label>
                        <div className="mt-1 rounded-xl bg-canvas-card border border-canvas-border px-3 py-2 text-xs font-medium text-canvas-text">
                          Passport & Utility Bill
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-canvas-card border border-canvas-border p-2.5">
                          <div className="flex items-center gap-1 text-[11px] text-canvas-muted">
                            <Clock size={14} className="text-brand-muted" />
                            <span>Expires In</span>
                          </div>
                          <p className="mt-1 text-xs font-bold text-canvas-text">24 Hours</p>
                        </div>
                        <div className="rounded-xl bg-canvas-card border border-canvas-border p-2.5">
                          <div className="flex items-center gap-1 text-[11px] text-canvas-muted">
                            <Key size={14} className="text-brand-muted" />
                            <span>Security PIN</span>
                          </div>
                          <p className="mt-1 text-xs font-bold text-canvas-text">4-Digit OTP</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-brand p-3 text-center text-xs font-semibold text-white shadow-xs">
                      Share Link Generated: bhejo.app/s/8f92a1
                    </div>
                  </motion.div>
                )}

                {activeStep === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2 border-b border-canvas-border pb-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <ChatCircleDots size={18} weight="bold" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-canvas-text">Delivered via WhatsApp or SMS</p>
                        <p className="text-[11px] text-canvas-muted">Zero app install required for recipient</p>
                      </div>
                    </div>

                    {/* Simulated Chat Message Bubble */}
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 space-y-2">
                      <p className="text-xs text-canvas-text leading-relaxed">
                        Hey dad, please scan your ID with this secure link. Just tap and point your camera:
                      </p>
                      <div className="rounded-xl bg-canvas-card border border-emerald-200 p-3 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-bold text-brand">bhejo.app/scan/8f92a1</span>
                        </div>
                        <p className="mt-1 text-[11px] text-canvas-muted">
                          Encrypted document scan request • Opens in browser
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-canvas-subtle p-3 text-center text-xs font-medium text-canvas-muted">
                      Recipient opens link directly in Safari or Chrome without creating an account.
                    </div>
                  </motion.div>
                )}

                {activeStep === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2 border-b border-canvas-border pb-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-brand-subtle text-brand">
                        <Scan size={18} weight="bold" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-brand">Auto-Captured & Cropped</p>
                        <p className="text-[11px] text-canvas-muted">100% processed in phone browser RAM</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 rounded-2xl border border-canvas-border bg-canvas-subtle p-4">
                      <div className="size-16 shrink-0 rounded-lg bg-canvas-card border border-canvas-border shadow-xs flex items-center justify-center">
                        <CheckCircle size={28} weight="fill" className="text-emerald-600" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-bold text-canvas-text">passport_scan_page1.pdf</p>
                        <p className="text-[11px] text-canvas-muted">Perspective corrected • 300 DPI equivalent</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                          <ShieldCheck size={12} weight="bold" /> Encrypted Delivery
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-brand p-3 text-center text-xs font-semibold text-white shadow-xs">
                      Document ready in your sender dashboard
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
