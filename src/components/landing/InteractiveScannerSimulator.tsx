"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Camera,
  CheckCircle,
  ArrowClockwise,
  ShieldCheck,
  CornersOut,
} from "@phosphor-icons/react";

/**
 * Interactive Mobile Scanner Simulator.
 * Demonstrates local OpenCV WebAssembly edge detection, stability tracking,
 * and automatic document capture without server streaming.
 */
export function InteractiveScannerSimulator() {
  const [scanState, setScanState] = useState<"tracking" | "snapping" | "completed">("tracking");
  const [pageCount, setPageCount] = useState(1);
  const shouldReduceMotion = useReducedMotion();

  // Automatic demo cycle if user doesn't click
  useEffect(() => {
    if (scanState !== "tracking") return;
    const timer = setTimeout(() => {
      // Auto-trigger preview if user is just watching
    }, 4500);
    return () => clearTimeout(timer);
  }, [scanState]);

  const handleTriggerSnap = () => {
    if (scanState !== "tracking") return;
    setScanState("snapping");
    setTimeout(() => {
      setScanState("completed");
    }, 350);
  };

  const handleReset = () => {
    setScanState("tracking");
    setPageCount((prev) => (prev >= 3 ? 1 : prev + 1));
  };

  return (
    <div className="relative mx-auto w-full max-w-[270px] sm:max-w-[290px] lg:max-w-[310px]">
      {/* Subtle ambient backplate glow matching brand palette */}
      <div
        className="absolute -inset-3 rounded-[38px] bg-gradient-to-b from-brand/10 via-brand-muted/5 to-transparent blur-xl"
        aria-hidden="true"
      />

      {/* Smartphone Hardware Frame */}
      <div className="relative overflow-hidden rounded-[32px] border-[4px] border-viewfinder-border bg-viewfinder p-2.5 shadow-2xl ring-1 ring-white/10">
        {/* Dynamic Island / Camera Punch Hole */}
        <div className="mx-auto mb-2 flex h-3.5 w-20 items-center justify-center rounded-full bg-black">
          <div className="size-1.5 rounded-full bg-viewfinder-card ring-1 ring-viewfinder-border" />
        </div>

        {/* Viewfinder Viewport Screen */}
        <div className="relative aspect-[9/15.2] w-full overflow-hidden rounded-[22px] bg-viewfinder flex flex-col justify-between p-3 select-none">
          {/* Top Status Bar Inside Camera Screen */}
          <div className="z-20 flex items-center justify-between text-xs text-white/90">
            <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 backdrop-blur-md">
              <ShieldCheck size={13} weight="fill" className="text-viewfinder-accent" />
              <span className="font-mono text-[10px] font-medium">Local WASM</span>
            </div>
            <div className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium backdrop-blur-md">
              Page {pageCount} of 3
            </div>
          </div>

          {/* Viewfinder Camera Field (Document Tracking Arena) */}
          <div className="relative my-auto flex h-[70%] w-full items-center justify-center overflow-hidden rounded-xl bg-viewfinder-card/90 border border-white/5">
            {/* Background Texture representing desk surface */}
            <div
              className="absolute inset-0 opacity-20 bg-[radial-gradient(#38BDF8_1px,transparent_1px)] [background-size:16px_16px]"
              aria-hidden="true"
            />

            {/* Simulated Document Sheet */}
            <motion.div
              className="relative aspect-[1/1.414] w-[74%] rounded-lg bg-white p-3.5 shadow-xl transition-all duration-300"
              animate={
                scanState === "completed"
                  ? { scale: 1.04, rotate: 0 }
                  : { scale: 1, rotate: -1.5 }
              }
              transition={{ duration: 0.4 }}
            >
              {/* Fake Document Lines with realistic contrast */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="h-2 w-14 rounded-sm bg-brand" />
                <div className="h-1.5 w-8 rounded-sm bg-slate-300" />
              </div>
              <div className="mt-2.5 space-y-1.5">
                <div className="h-1.5 w-full rounded-sm bg-slate-200" />
                <div className="h-1.5 w-4/5 rounded-sm bg-slate-200" />
                <div className="h-1.5 w-5/6 rounded-sm bg-slate-200" />
              </div>
              <div className="mt-3 flex gap-2">
                <div className="h-8 w-8 rounded-sm bg-slate-100 border border-slate-200" />
                <div className="flex-1 space-y-1">
                  <div className="h-1.5 w-3/4 rounded-sm bg-slate-300" />
                  <div className="h-1.5 w-1/2 rounded-sm bg-slate-200" />
                </div>
              </div>

              {/* Corner Tracking Reticles (Visible during tracking) */}
              {scanState === "tracking" && (
                <>
                  {/* Top-Left Corner */}
                  <span className="absolute -top-1.5 -left-1.5 size-4 border-t-2 border-l-2 border-viewfinder-accent rounded-tl-sm shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" />
                  {/* Top-Right Corner */}
                  <span className="absolute -top-1.5 -right-1.5 size-4 border-t-2 border-r-2 border-viewfinder-accent rounded-tr-sm shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" />
                  {/* Bottom-Left Corner */}
                  <span className="absolute -bottom-1.5 -left-1.5 size-4 border-b-2 border-l-2 border-viewfinder-accent rounded-bl-sm shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" />
                  {/* Bottom-Right Corner */}
                  <span className="absolute -bottom-1.5 -right-1.5 size-4 border-b-2 border-r-2 border-viewfinder-accent rounded-br-sm shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" />
                </>
              )}

              {/* Success Badge overlay when completed */}
              {scanState === "completed" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-white/95 backdrop-blur-xs p-2 text-center"
                >
                  <CheckCircle size={32} weight="fill" className="text-emerald-600" />
                  <p className="mt-1 text-xs font-bold text-canvas-text">Perspective Cropped</p>
                  <p className="text-[10px] text-canvas-muted font-mono">100% Client-Side</p>
                </motion.div>
              )}
            </motion.div>

            {/* Shutter Flash Animation */}
            <AnimatePresence>
              {scanState === "snapping" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.95 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 bg-white z-30"
                />
              )}
            </AnimatePresence>

            {/* Live Guidance Status Pill */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap">
              {scanState === "tracking" && (
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1.5 rounded-full bg-viewfinder/85 px-3 py-1 text-[11px] font-medium text-viewfinder-accent border border-viewfinder-accent/30 shadow-lg backdrop-blur-md"
                >
                  <span className="size-1.5 rounded-full bg-viewfinder-accent animate-ping" />
                  <span>Hold still... 98% aligned</span>
                </motion.div>
              )}
              {scanState === "completed" && (
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-950/90 px-3 py-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/40 shadow-lg backdrop-blur-md">
                  <CheckCircle size={14} weight="fill" />
                  <span>Captured & Enhanced</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Interactive Controls */}
          <div className="z-20 flex items-center justify-between pt-1">
            {scanState === "tracking" ? (
              <button
                type="button"
                onClick={handleTriggerSnap}
                className="flex h-9.5 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-xs font-bold text-white shadow-md transition-all hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98] cursor-pointer"
              >
                <Camera size={15} weight="bold" />
                <span>Simulate Auto-Capture</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReset}
                className="flex h-9.5 w-full items-center justify-center gap-1.5 rounded-lg bg-viewfinder-card text-xs font-bold text-white border border-viewfinder-border shadow-md transition-all hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98] cursor-pointer"
              >
                <ArrowClockwise size={15} weight="bold" className="text-viewfinder-accent" />
                <span>Scan Next Page</span>
              </button>
            )}
          </div>
        </div>

        {/* Home Indicator bar */}
        <div className="mx-auto mt-1.5 h-1 w-20 rounded-full bg-white/20" />
      </div>

      {/* Floating Micro-Badge */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-canvas-muted">
        <CornersOut size={13} className="text-brand-muted" />
        <span>Sub-pixel corner detection powered by WebAssembly</span>
      </div>
    </div>
  );
}
