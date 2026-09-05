"use client";

import React from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck, CornersOut, CheckCircle, Cpu } from "@phosphor-icons/react";

interface AuthVisualSideProps {
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Left-side visual showcase for Auth screens (Desktop only).
 * Features high-resolution realistic scanning photography paired with
 * floating, animated glassmorphic SVG artifacts powered by Motion.
 * Fully themed with Tailwind v4 semantic tokens.
 */
export function AuthVisualSide({
  imageSrc,
  imageAlt,
  title,
  description,
}: AuthVisualSideProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative hidden lg:flex h-full min-h-screen w-full flex-col justify-between overflow-hidden bg-viewfinder p-10 xl:p-14 text-white select-none">
      {/* Background Photography Asset */}
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        priority
        className="object-cover object-center opacity-90 transition-transform duration-700 hover:scale-105"
        sizes="(min-width: 1024px) 50vw, 100vw"
      />

      {/* Cinematic Vignette Gradients for Text & Artifact Legibility */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-viewfinder/95 via-viewfinder/40 to-viewfinder/60"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-radial from-transparent via-viewfinder/30 to-viewfinder/80"
        aria-hidden="true"
      />

      {/* Optical Scan Line Laser Effect */}
      {!shouldReduceMotion && (
        <motion.div
          className="pointer-events-none absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-viewfinder-accent/80 to-transparent shadow-[0_0_12px_rgba(56,189,248,0.9)]"
          initial={{ top: "25%", opacity: 0 }}
          animate={{
            top: ["25%", "65%", "25%"],
            opacity: [0.3, 0.85, 0.3],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          aria-hidden="true"
        />
      )}

      {/* Top Floating Glassmorphic Artifact: Real-Time HUD */}
      <div className="relative z-10">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
          animate={
            shouldReduceMotion
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  y: [0, -8, 0],
                  transition: {
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }
          }
          className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-viewfinder/75 p-3.5 shadow-2xl backdrop-blur-md"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-viewfinder-accent/20 text-viewfinder-accent">
            <CornersOut size={20} weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-white font-mono tracking-tight">
                Sub-Pixel Detection Active
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono">
              WASM Engine • 10 FPS Local Analysis
            </p>
          </div>
        </motion.div>
      </div>

      {/* Center Ambient Focus Reticle */}
      <div className="relative z-10 my-auto flex justify-center">
        <motion.div
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  scale: [1, 1.03, 1],
                  opacity: [0.7, 0.95, 0.7],
                }
          }
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative size-44 rounded-2xl border-2 border-dashed border-viewfinder-accent/40 p-3 pointer-events-none"
        >
          <span className="absolute -top-1.5 -left-1.5 size-4 border-t-2 border-l-2 border-viewfinder-accent" />
          <span className="absolute -top-1.5 -right-1.5 size-4 border-t-2 border-r-2 border-viewfinder-accent" />
          <span className="absolute -bottom-1.5 -left-1.5 size-4 border-b-2 border-l-2 border-viewfinder-accent" />
          <span className="absolute -bottom-1.5 -right-1.5 size-4 border-b-2 border-r-2 border-viewfinder-accent" />
          <div className="flex h-full w-full items-center justify-center text-[11px] font-mono text-viewfinder-accent/90 font-semibold tracking-wider">
            AUTO-ALIGN READY
          </div>
        </motion.div>
      </div>

      {/* Bottom Floating Glassmorphic Artifact: Privacy & Value Proposition */}
      <div className="relative z-10 space-y-4">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={
            shouldReduceMotion
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  y: [0, 8, 0],
                  transition: {
                    duration: 4.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }
          }
          className="rounded-3xl border border-white/15 bg-viewfinder/80 p-6 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-viewfinder-accent">
            <ShieldCheck size={16} weight="fill" />
            <span>Privacy-First Architecture</span>
          </div>
          <h2 className="mt-2 text-lg font-bold text-white tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-300 leading-relaxed max-w-md">
            {description}
          </p>

          <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-3 text-[11px] text-slate-300 font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle size={14} weight="fill" className="text-emerald-400" />
              Zero Video Streaming
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu size={14} weight="bold" className="text-viewfinder-accent" />
              100% In-Memory
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
