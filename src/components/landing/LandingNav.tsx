"use client";

import React, { useState } from "react";
import { List, X, ArrowRight, Camera } from "@phosphor-icons/react";
import { BhejoWordmark } from "@/shared/components/ui/BhejoWordmark";
import { Button } from "@/shared/components/ui/Button";
import { NAV_LINKS } from "@/shared/constants/landing";

/**
 * Landing Page Navigation.
 * Single line on desktop, max height 72px, sticky with backdrop blur.
 */
export function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? "bg-white/95 backdrop-blur-xl border-b border-canvas-border shadow-xs"
          : "bg-white/80 backdrop-blur-md border-b border-canvas-border/60 shadow-none"
      }`}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logomark */}
        <BhejoWordmark size="md" />

        {/* Desktop Navigation Links (Single Line) */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main Navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-canvas-muted transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-lg px-1.5 py-1"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop Action CTAs */}
        <div className="hidden items-center gap-2 md:flex">
          <Button href="/login" variant="ghost" size="sm">
            Sign In
          </Button>

          <Button
            href="/scan/demo"
            variant="secondary"
            size="sm"
            icon={<Camera size={15} weight="bold" className="text-brand-muted" />}
            iconPlacement="left"
          >
            Try Scanner
          </Button>

          <Button
            href="/signup"
            variant="primary"
            size="sm"
            icon={<ArrowRight size={14} weight="bold" />}
          >
            Try Free
          </Button>
        </div>

        {/* Mobile Menu Toggle Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-canvas-border bg-canvas-card text-canvas-text transition hover:bg-canvas-subtle md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle Menu"
        >
          {mobileMenuOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-canvas-border bg-canvas-card px-4 pt-3 pb-6 md:hidden shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col gap-2.5" aria-label="Mobile Navigation">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-canvas-text hover:bg-canvas-subtle hover:text-brand transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2.5 border-t border-canvas-border pt-4">
              <Button
                href="/login"
                variant="ghost"
                size="md"
                fullWidth
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Button>

              <Button
                href="/scan/demo"
                variant="secondary"
                size="md"
                fullWidth
                icon={<Camera size={18} weight="bold" className="text-brand-muted" />}
                iconPlacement="left"
                onClick={() => setMobileMenuOpen(false)}
              >
                Try Scanner Demo
              </Button>

              <Button
                href="/signup"
                variant="primary"
                size="md"
                fullWidth
                icon={<ArrowRight size={16} weight="bold" />}
                onClick={() => setMobileMenuOpen(false)}
              >
                Try Free
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
