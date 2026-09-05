"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BhejoLogo } from "./BhejoLogo";

interface BhejoWordmarkProps {
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
  readonly href?: string;
}

const TAGLINE_WORDS = [
  { word: "Scan", dot: "." },
  { word: "Send", dot: "." },
  { word: "Done", dot: "." },
] as const;

/**
 * Animated Bhejo Wordmark.
 * Matches the user-provided brand identity with animated "Scan. Send. Done." tagline.
 */
export function BhejoWordmark({
  size = "md",
  className = "",
  href = "/",
}: BhejoWordmarkProps) {
  const shouldReduceMotion = useReducedMotion();

  const logoSize = size === "sm" ? 28 : size === "lg" ? 44 : 34;
  const titleSizeClass =
    size === "sm"
      ? "text-lg tracking-tight"
      : size === "lg"
      ? "text-3xl tracking-tight"
      : "text-2xl tracking-tight";
  const taglineSizeClass =
    size === "sm"
      ? "text-[9px] tracking-wider"
      : size === "lg"
      ? "text-xs tracking-wider"
      : "text-[10.5px] tracking-wider";

  const content = (
    <motion.div
      className={`group inline-flex items-center gap-2.5 sm:gap-3 select-none ${className}`}
      initial={false}
      animate="animate"
      whileHover="hover"
    >
      {/* Brand Vector Symbol with gentle spring entrance */}
      <motion.div
        variants={{
          initial: { scale: 0.9, opacity: 0 },
          animate: {
            scale: 1,
            opacity: 1,
            transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
          },
          hover: {
            scale: 1.05,
            rotate: [0, -2, 2, 0],
            transition: { duration: 0.4 },
          },
        }}
        className="flex items-center justify-center shrink-0"
      >
        <BhejoLogo size={logoSize} priority />
      </motion.div>

      {/* Typography Column */}
      <div className="flex flex-col justify-center leading-none">
        {/* Brand Logotype "Bhejo" */}
        <motion.span
          variants={{
            initial: { y: 4, opacity: 0 },
            animate: {
              y: 0,
              opacity: 1,
              transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
            },
          }}
          className={`font-bold text-brand font-sans ${titleSizeClass}`}
        >
          Bhejo
        </motion.span>

        {/* Animated Subtitle "Scan. Send. Done." */}
        <div
          className={`mt-0.5 flex items-center gap-1 font-semibold uppercase text-brand-muted/90 ${taglineSizeClass}`}
        >
          {TAGLINE_WORDS.map((item, index) => (
            <motion.span
              key={item.word}
              className="inline-flex items-baseline"
              variants={{
                initial: { opacity: 0, y: 3 },
                animate: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    delay: 0.15 + index * 0.08,
                    duration: 0.4,
                    ease: "easeOut",
                  },
                },
                hover: {
                  y: [0, -1.5, 0],
                  transition: {
                    delay: index * 0.06,
                    duration: 0.3,
                  },
                },
              }}
            >
              <span>{item.word}</span>
              <motion.span
                className="text-brand font-bold"
                variants={{
                  hover: {
                    scale: [1, 1.4, 1],
                    color: ["#394D66", "#10325B", "#394D66"],
                    transition: { duration: 0.35, delay: index * 0.07 },
                  },
                }}
              >
                {item.dot}
              </motion.span>
            </motion.span>
          ))}
        </div>
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-xl"
        aria-label="Bhejo Home"
      >
        {content}
      </Link>
    );
  }

  return content;
}
