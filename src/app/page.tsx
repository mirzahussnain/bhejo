import React from "react";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FeatureBentoSection } from "@/components/landing/FeatureBentoSection";
import { PrivacyArchitectureSection } from "@/components/landing/PrivacyArchitectureSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function HomePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas text-canvas-text selection:bg-brand selection:text-white">
      <LandingNav />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
        <FeatureBentoSection />
        <PrivacyArchitectureSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
