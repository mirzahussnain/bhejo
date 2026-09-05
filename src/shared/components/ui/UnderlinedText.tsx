"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/shared/utils/cn";

export interface UnderlinedTextProps {
  /** The text to be wrapped and underlined */
  readonly children: React.ReactNode;
  /** Additional CSS class names for the outer wrapper container */
  readonly className?: string;
  /** Additional CSS class names for the underline wrapper */
  readonly underlineClassName?: string;
  /** Fill color of the hand-drawn stroke (defaults to vibrant blue #2563EB) */
  readonly strokeColor?: string;
  /** Vertical placement override class (default: top-[100%] translate-y-1 sm:translate-y-1.5) */
  readonly positionClassName?: string;
  /** Whether to animate the stroke drawing on mount (default: true) */
  readonly animate?: boolean;
}

/**
 * Reusable UnderlinedText Micro-Component.
 * Accurately replicates the hand-drawn tapered curved stroke from reference Image 2:
 * - Dynamic length: Spans 100% of wrapped text from the first to last character (left -1% to width 102%).
 * - Sits cleanly below the text baseline with reduced, natural gap (-bottom-1.5 sm:-bottom-2).
 * - Organic tapered styling: Pointed needle tips at both ends, thicker body in center, subtle upward flick on right.
 * - Smooth GPU-accelerated reveal animation.
 */
export function UnderlinedText({
  children,
  className = "",
  underlineClassName = "",
  strokeColor = "#2563EB",
  positionClassName = "-bottom-1.5 sm:-bottom-2",
  animate = true,
}: UnderlinedTextProps) {
  const shouldReduceMotion = useReducedMotion();
  const willAnimate = animate && !shouldReduceMotion;

  // Exact hand-drawn tapered brush stroke replicating Image 2:
  // - Starts at a sharp needle point on the lower left (0, 15)
  // - Sweeps naturally upward into the text baseline (cresting at y ~ 4.5)
  // - Maintains a consistent organic pen thickness (~3.5px) across the center
  // - Tapers gracefully to a sharp needle point on the right (300, 3.8) with a subtle upward flick
  const taperedStrokePath =
    "M 0 15 C 50 8, 110 5, 170 4.5 C 220 4, 265 4.2, 300 3.8 C 265 6, 220 7.5, 170 8 C 110 8.5, 50 11.5, 0 15 Z";

  return (
    <span className={cn("relative inline-block whitespace-nowrap", className)}>
      {/* Target Word / Text */}
      <span className="relative z-10">{children}</span>

      {/* Dynamic Hand-Drawn Underline SVG (Image 2 style) */}
      <motion.div
        initial={willAnimate ? { scaleX: 0, opacity: 0 } : false}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{
          duration: 0.75,
          delay: 0.2,
          ease: [0.16, 1, 0.3, 1], // Natural ease-out sweep
        }}
        style={{ transformOrigin: "left center" }}
        className={cn(
          "pointer-events-none absolute left-[-1%] w-[102%] h-[0.3em] overflow-visible select-none",
          positionClassName,
          underlineClassName
        )}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 300 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          <path d={taperedStrokePath} fill={strokeColor} />
        </svg>
      </motion.div>
    </span>
  );
}
