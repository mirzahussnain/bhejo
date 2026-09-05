"use client";

import React, { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { FAQ_ITEMS } from "@/shared/constants/landing";
import { cn } from "@/shared/utils/cn";
import { RadialGradientBackground } from "@/components/ui/tailwind-css-background-snippet";

/**
 * FAQ Accordion Section.
 * Accessible, zero em-dashes, concise answers.
 */
export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="faq" className="relative scroll-mt-20 overflow-hidden border-t border-canvas-border bg-canvas-card py-20 lg:py-28">
      {/* Subtle Blended Radial Gradient Background */}
      <RadialGradientBackground opacityClassName="opacity-[0.16]" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-canvas-text sm:text-4xl">
            Frequently Answered Questions
          </h2>
          <p className="mt-4 text-base leading-relaxed text-canvas-muted sm:text-lg">
            Everything you need to know about link-based scanning and recipient security.
          </p>
        </div>

        {/* Accordion List */}
        <div className="mt-12 space-y-4">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={item.question}
                className={cn(
                  "overflow-hidden rounded-3xl border transition-all duration-200",
                  isOpen
                    ? "border-brand bg-canvas-card shadow-sm ring-1 ring-brand/10"
                    : "border-canvas-border bg-canvas-subtle/50 hover:bg-canvas-subtle"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="flex w-full items-center justify-between p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-bold text-canvas-text pr-4">
                    {item.question}
                  </span>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
                      isOpen
                        ? "rotate-180 bg-brand text-white shadow-xs"
                        : "bg-canvas-subtle text-canvas-muted"
                    )}
                  >
                    <CaretDown size={16} weight="bold" />
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      <div className="border-t border-canvas-border px-6 pt-3 pb-6 text-sm leading-relaxed text-canvas-muted">
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
