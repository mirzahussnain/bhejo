"use client";

import React from "react";
import { motion, useReducedMotion, type TargetAndTransition } from "motion/react";
import { cn } from "@/lib/utils";

export interface RadialGradientBackgroundProps {
  /** Optional custom class name for the outer container */
  readonly className?: string;
  /** Opacity class for subtle blending (default: "opacity-[0.18]") */
  readonly opacityClassName?: string;
  /** Optional children to render inside */
  readonly children?: React.ReactNode;
}

/**
 * RadialGradientBackground / WaveGradientBackground.
 * Spans the full height and width of the section, with organic horizontal waves
 * moving continuously from end to end and colors fluctuating smoothly between
 * grey, white, and subtle current color (#63e / brand indigo).
 * Sits at z-0 with translucent blending to preserve the section's original background.
 */
export const RadialGradientBackground: React.FC<RadialGradientBackgroundProps> = ({
  className,
  opacityClassName = "opacity-[0.18]",
  children,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const rawId = React.useId();
  const id = rawId.replace(/:/g, "-");
  const backGradId = `wave-grad-back-${id}`;
  const frontGradId = `wave-grad-front-${id}`;

  // Primary wave: moves smoothly from one end to the other horizontally
  const wave1Animation: TargetAndTransition = shouldReduceMotion
    ? {}
    : {
        x: ["0%", "-50%"],
        transition: {
          x: {
            duration: 20,
            repeat: Infinity,
            repeatType: "loop",
            ease: "linear",
          },
        },
      };

  // Secondary wave: glides horizontally in opposite direction at a different rhythm
  const wave2Animation: TargetAndTransition = shouldReduceMotion
    ? {}
    : {
        x: ["-50%", "0%"],
        transition: {
          x: {
            duration: 28,
            repeat: Infinity,
            repeatType: "loop",
            ease: "linear",
          },
        },
      };

  // Ambient horizontal glow: sweeps across the whole section while colors fluctuate
  const ambientAnimation: TargetAndTransition = shouldReduceMotion
    ? {}
    : {
        x: ["-15%", "15%", "-15%"],
        opacity: [0.7, 0.95, 0.7],
        transition: {
          x: { duration: 18, repeat: Infinity, ease: "easeInOut" },
          opacity: { duration: 10, repeat: Infinity, ease: "easeInOut" },
        },
      };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden select-none",
        className
      )}
      aria-hidden="true"
    >
      {/* Full-section container with soft perimeter mask for seamless section blending */}
      <div
        className={cn(
          "absolute inset-0 [mask-image:radial-gradient(ellipse_95%_95%_at_50%_50%,black_70%,transparent_100%)]",
          opacityClassName
        )}
      >
        {/* Full-section Fluctuating Ambient Light Mesh (Grey <-> White <-> Subtle Current Indigo) */}
        <motion.div
          animate={ambientAnimation}
          className="absolute -inset-x-[30%] -inset-y-[15%] h-[130%] w-[160%] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 75% 75% at 50% 50%, rgba(99, 51, 238, 0.28) 0%, rgba(203, 213, 225, 0.42) 45%, rgba(255, 255, 255, 0.65) 75%, transparent 100%)",
          }}
        />

        {/* Full-height Wave Layer 1: Background flowing wave */}
        <motion.div
          animate={wave2Animation}
          className="absolute inset-0 h-full w-[200%] pointer-events-none will-change-transform"
        >
          <svg
            viewBox="0 0 2880 600"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id={backGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
                <stop offset="20%" stopColor="#CBD5E1" stopOpacity="0.45" />
                <stop offset="45%" stopColor="#6366F1" stopOpacity="0.28" />
                <stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.6" />
                <stop offset="85%" stopColor="#94A3B8" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.45" />
              </linearGradient>
            </defs>
            <path
              d="M 0,340 C 360,440 720,240 1080,340 C 1440,440 1800,240 2160,340 C 2520,440 2880,240 2880,600 L 0,600 Z"
              fill={`url(#${backGradId})`}
            />
          </svg>
        </motion.div>

        {/* Full-height Wave Layer 2: Foreground rhythmic wave */}
        <motion.div
          animate={wave1Animation}
          className="absolute inset-0 h-full w-[200%] pointer-events-none will-change-transform"
        >
          <svg
            viewBox="0 0 2880 600"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id={frontGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366F1" stopOpacity="0.3" />
                <stop offset="22%" stopColor="#FFFFFF" stopOpacity="0.7" />
                <stop offset="48%" stopColor="#94A3B8" stopOpacity="0.42" />
                <stop offset="72%" stopColor="#6366F1" stopOpacity="0.24" />
                <stop offset="88%" stopColor="#FFFFFF" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#6366F1" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            <path
              d="M 0,220 C 360,110 720,330 1080,220 C 1440,110 1800,330 2160,220 C 2520,110 2880,330 2880,600 L 0,600 Z"
              fill={`url(#${frontGradId})`}
            />
          </svg>
        </motion.div>
      </div>

      {children}
    </div>
  );
};

// Aliased as Hero for backward compatibility with the original snippet
export const Hero = RadialGradientBackground;
export default RadialGradientBackground;
