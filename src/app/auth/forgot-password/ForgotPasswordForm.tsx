"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "@/shared/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Email is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
      });

      if (error) {
        // Handle rate limit error gracefully
        if (error.message.toLowerCase().includes("rate limit") || error.status === 429) {
          setErrorMessage("Too many requests. Please wait a moment before trying again.");
          setIsLoading(false);
          return;
        }
      }

      // Avoid revealing whether an email address exists in the system (security best practice)
      setIsSubmitted(true);
    } catch {
      // Still show success state or generic error to prevent email enumeration
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="rounded-3xl border border-canvas-border bg-canvas-card p-8 text-center shadow-xs sm:p-10 space-y-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle size={40} weight="fill" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-canvas-text sm:text-3xl">
            Check your email
          </h1>
          <p className="text-sm leading-relaxed text-canvas-muted max-w-sm mx-auto">
            If an account exists for <span className="font-semibold text-canvas-text">{email}</span>, we&apos;ve sent a password reset link. Please check your inbox and spam folder.
          </p>
        </div>

        <div className="pt-2">
          <Button href="/login" variant="primary" size="md" fullWidth>
            Return to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-canvas-border bg-canvas-card p-8 shadow-xs sm:p-10">
      <div className="text-center space-y-2">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-subtle text-brand mb-4">
          <EnvelopeSimple size={32} weight="duotone" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-canvas-text sm:text-3xl">
          Reset password
        </h1>
        <p className="text-sm text-canvas-muted max-w-sm mx-auto">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-xs font-medium text-red-800 leading-relaxed animate-in fade-in duration-200"
          >
            {errorMessage}
          </div>
        )}

        <div>
          <label htmlFor="reset-email" className="block text-xs font-semibold text-canvas-text">
            Email Address
          </label>
          <div className="mt-1.5">
            <input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              placeholder="name@company.com"
              className="block w-full rounded-2xl border border-canvas-border bg-canvas-subtle/50 px-4 py-3 text-sm text-canvas-text placeholder:text-canvas-muted focus:border-brand focus:bg-canvas-card focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 transition"
            />
          </div>
        </div>

        <div className="pt-2">
          <Button type="submit" variant="primary" size="md" fullWidth isLoading={isLoading}>
            Send reset link
          </Button>
        </div>

        <div className="text-center pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-canvas-muted hover:text-canvas-text transition-colors"
          >
            <ArrowLeft size={14} weight="bold" />
            Back to Sign In
          </Link>
        </div>
      </form>
    </div>
  );
}
