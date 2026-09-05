"use client";

import React from "react";
import { ArrowRight, Camera, Check } from "@phosphor-icons/react";
import { Badge } from "@/shared/components/ui/Badge";
import { Button } from "@/shared/components/ui/Button";
import { UnderlinedText } from "@/shared/components/ui/UnderlinedText";
import ConstellationGrid from "@/components/ui/constellation-grid";
import { HERO_DATA } from "@/shared/constants/landing";
import { InteractiveScannerSimulator } from "./InteractiveScannerSimulator";

/**
 * Hero Section.
 * Asymmetric 50/50 split layout adhering strictly to anti-slop guidelines:
 * - Dynamic kinetic constellation mesh background reacting to cursor movement
 * - Headline max 2 lines on desktop
 * - Subtext max 20 words (currently 17 words)
 * - Top padding pt-16 md:pt-20 (fits in viewport without scroll)
 * - Max 4 text elements in stack
 */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-12">
      {/* Dynamic Constellation Kinetic Background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-80">
        <ConstellationGrid showOverlay={false} transparent={true} className="h-full w-full" />
      </div>

      {/* Subtle ambient gradient mesh in background */}
      <div
        className="pointer-events-none absolute top-0 right-1/4 z-0 h-96 w-96 rounded-full bg-brand-subtle/80 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Hero Text Stack (4 text elements max) */}
          <div className="flex flex-col items-start lg:col-span-7">
            {/* Element 1: Eyebrow Badge */}
            <Badge variant="brand" hasDot className="mb-5">
              {HERO_DATA.badge}
            </Badge>

            {/* Element 2: Headline (max 2 lines, Title Case) */}
            <h1 className="text-4xl font-extrabold tracking-tight text-canvas-text sm:text-5xl lg:text-6xl lg:leading-[1.1]">
              Request <UnderlinedText>Documents</UnderlinedText> from Anyone. No App Needed.
            </h1>

            {/* Element 3: Subtext (exactly 17 words, <= 20 words cap) */}
            <p className="mt-5 max-w-[54ch] text-base leading-relaxed text-canvas-muted sm:text-lg">
              {HERO_DATA.description}
            </p>

            {/* Element 4: Primary & Secondary Action CTAs */}
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Button
                href={HERO_DATA.primaryCta.href}
                variant="primary"
                size="lg"
                icon={<ArrowRight size={16} weight="bold" />}
              >
                {HERO_DATA.primaryCta.label}
              </Button>

              <Button
                href={HERO_DATA.secondaryCta.href}
                variant="secondary"
                size="lg"
                icon={<Camera size={18} weight="bold" className="text-brand-muted" />}
                iconPlacement="left"
              >
                {HERO_DATA.secondaryCta.label}
              </Button>
            </div>

            {/* Compatibility Highlights */}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-canvas-border/80 pt-6 text-xs text-canvas-muted">
              {HERO_DATA.compatibility.map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <Check size={14} weight="bold" className="text-brand" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Interactive Mobile Scanner Demonstration */}
          <div className="flex items-center justify-center lg:col-span-5">
            <InteractiveScannerSimulator />
          </div>
        </div>
      </div>
    </section>
  );
}
