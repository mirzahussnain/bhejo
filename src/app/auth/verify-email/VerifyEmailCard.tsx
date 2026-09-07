"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeSimple, ArrowClockwise, SignOut } from "@phosphor-icons/react";
import { Button } from "@/shared/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

interface VerifyEmailCardProps {
  readonly email: string;
}

export function VerifyEmailCard({ email }: VerifyEmailCardProps) {
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();

  async function handleResend() {
    setIsResending(true);
    setResendStatus(null);
    setResendError(null);

    try {
      const supabase = createClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/auth/confirmed`,
        },
      });

      if (error) {
        setResendError(error.message);
      } else {
        setResendStatus("A new confirmation email has been sent. Please check your inbox and spam folder.");
      }
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Failed to resend confirmation email.");
    } finally {
      setIsResending(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="rounded-3xl border border-canvas-border bg-canvas-card p-8 text-center shadow-xs sm:p-10 space-y-6">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
        <EnvelopeSimple size={40} weight="duotone" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-canvas-text sm:text-3xl">
          Please confirm your email
        </h1>
        <p className="text-sm leading-relaxed text-canvas-muted max-w-sm mx-auto">
          We&apos;ve sent a confirmation link to{" "}
          <span className="font-semibold text-canvas-text">{email}</span>. Please check your inbox and spam folder.
        </p>
      </div>

      {resendStatus && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs font-medium text-emerald-800 leading-relaxed text-left animate-in fade-in duration-200"
        >
          {resendStatus}
        </div>
      )}

      {resendError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-xs font-medium text-red-800 leading-relaxed text-left animate-in fade-in duration-200"
        >
          {resendError}
        </div>
      )}

      <div className="pt-2 space-y-3">
        <Button
          type="button"
          variant="primary"
          size="md"
          fullWidth
          isLoading={isResending}
          onClick={handleResend}
          iconPlacement="left"
          icon={<ArrowClockwise size={18} weight="bold" />}
        >
          Resend confirmation email
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="md"
          fullWidth
          isLoading={isSigningOut}
          onClick={handleSignOut}
          iconPlacement="left"
          icon={<SignOut size={18} weight="bold" />}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
