import React from "react";
import { ArrowRight, Camera } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/shared/components/ui/Badge";
import { Button } from "@/shared/components/ui/Button";
import { RadialGradientBackground } from "@/components/ui/tailwind-css-background-snippet";

/**
 * CTA Conversion Section.
 * Strictly adheres to semantic token colors and the centralized Button component
 * to guarantee 100% color consistency with auth pages and hero CTAs.
 */
export function CtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-canvas-border bg-canvas py-20 lg:py-28">
      {/* Subtle Blended Radial Gradient Background */}
      <RadialGradientBackground opacityClassName="opacity-[0.16]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[36px] border border-canvas-border bg-canvas-card px-6 py-16 text-center shadow-lg sm:px-12 md:py-20 lg:px-16">
          {/* Subtle ambient light highlight using semantic brand subtle */}
          <div
            className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-subtle blur-3xl"
            aria-hidden="true"
          />

          <div className="mx-auto max-w-2xl">
            <Badge variant="brand" hasDot className="mb-4">
              Private • Link-Based • Client-Side
            </Badge>

            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-canvas-text sm:text-4xl lg:text-5xl">
              Ready to Eliminate Scanning Friction?
            </h2>

            <p className="mt-4 text-base leading-relaxed text-canvas-muted sm:text-lg">
              Generate your first secure scan link in under 30 seconds. No credit card required.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                href="/signup"
                variant="primary"
                size="lg"
                icon={<ArrowRight size={16} weight="bold" />}
              >
                Try Free
              </Button>

              <Button
                href="/scan/demo"
                variant="secondary"
                size="lg"
                icon={<Camera size={18} weight="bold" className="text-brand-muted" />}
                iconPlacement="left"
              >
                Try Live Scanner
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
