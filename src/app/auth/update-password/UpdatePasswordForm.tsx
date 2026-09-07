"use client";

import React, { useState } from "react";
import { Eye, EyeSlash, CheckCircle, LockKey } from "@phosphor-icons/react";
import { Button } from "@/shared/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage("Password is required.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update password.");
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="rounded-3xl border border-canvas-border bg-canvas-card p-8 text-center shadow-xs sm:p-10 space-y-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle size={40} weight="fill" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-canvas-text sm:text-3xl">
            Password updated
          </h1>
          <p className="text-sm leading-relaxed text-canvas-muted max-w-sm mx-auto">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
        </div>

        <div className="pt-2">
          <Button href="/login" variant="primary" size="md" fullWidth>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-canvas-border bg-canvas-card p-8 shadow-xs sm:p-10">
      <div className="text-center space-y-2">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-subtle text-brand mb-4">
          <LockKey size={32} weight="duotone" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-canvas-text sm:text-3xl">
          Set new password
        </h1>
        <p className="text-sm text-canvas-muted max-w-sm mx-auto">
          Please enter your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-xs font-medium text-red-800 leading-relaxed animate-in fade-in duration-200"
          >
            {errorMessage}
          </div>
        )}

        {/* New Password Field */}
        <div>
          <label htmlFor="new-password" className="block text-xs font-semibold text-canvas-text">
            New Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="new-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              placeholder="At least 6 characters"
              className="block w-full rounded-2xl border border-canvas-border bg-canvas-subtle/50 px-4 py-3 pr-11 text-sm text-canvas-text placeholder:text-canvas-muted focus:border-brand focus:bg-canvas-card focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-canvas-muted hover:text-brand transition-colors focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
            </button>
          </div>
        </div>

        {/* Confirm New Password Field */}
        <div>
          <label htmlFor="confirm-password" className="block text-xs font-semibold text-canvas-text">
            Confirm New Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              placeholder="Repeat your new password"
              className="block w-full rounded-2xl border border-canvas-border bg-canvas-subtle/50 px-4 py-3 pr-11 text-sm text-canvas-text placeholder:text-canvas-muted focus:border-brand focus:bg-canvas-card focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 transition"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-canvas-muted hover:text-brand transition-colors focus:outline-none"
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <Button type="submit" variant="primary" size="md" fullWidth isLoading={isLoading}>
            Update password
          </Button>
        </div>
      </form>
    </div>
  );
}
