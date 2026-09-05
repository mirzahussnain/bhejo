"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash, CheckCircle } from "@phosphor-icons/react";
import { Button } from "@/shared/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [confirmationNotice, setConfirmationNotice] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSocialNotice(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage("Full name is required.");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Email is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

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
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: trimmedName,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      // Check if session was created or email confirmation is required
      if (data.user && !data.session) {
        setConfirmationNotice(true);
        setIsLoading(false);
        return;
      }

      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
      setIsLoading(false);
    }
  }

  const handleSocialClick = (provider: string) => {
    setSocialNotice(`${provider} sign up will be available in an upcoming update. Please sign up with email.`);
  };

  if (confirmationNotice) {
    return (
      <div className="mt-8 rounded-3xl border border-canvas-border bg-canvas-card p-8 text-center space-y-4 shadow-xs">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle size={32} weight="fill" />
        </div>
        <h2 className="text-xl font-bold text-canvas-text">Check Your Email</h2>
        <p className="text-sm text-canvas-muted leading-relaxed max-w-sm mx-auto">
          We sent a verification link to <span className="font-semibold text-canvas-text">{email}</span>. Please verify your email to access your Bhejo dashboard.
        </p>
        <div className="pt-2">
          <Button href="/login" variant="primary" size="md">
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-xs font-medium text-red-800 leading-relaxed animate-in fade-in duration-200"
        >
          {errorMessage}
        </div>
      )}

      {socialNotice && (
        <div
          role="status"
          className="rounded-2xl border border-brand-border bg-brand-subtle p-3.5 text-xs font-medium text-brand leading-relaxed animate-in fade-in duration-200"
        >
          {socialNotice}
        </div>
      )}

      {/* Full Name Field */}
      <div>
        <label
          htmlFor="fullName"
          className="block text-xs font-semibold text-canvas-text"
        >
          Full Name
        </label>
        <div className="mt-1.5">
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isLoading}
            placeholder="Jane Doe"
            className="block w-full rounded-2xl border border-canvas-border bg-canvas-subtle/50 px-4 py-3 text-sm text-canvas-text placeholder:text-canvas-muted focus:border-brand focus:bg-canvas-card focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 transition"
          />
        </div>
      </div>

      {/* Email Address Field */}
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-semibold text-canvas-text"
        >
          Email Address
        </label>
        <div className="mt-1.5">
          <input
            id="email"
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

      {/* Password Field with Show/Hide Toggle */}
      <div>
        <label
          htmlFor="password"
          className="block text-xs font-semibold text-canvas-text"
        >
          Password
        </label>
        <div className="relative mt-1.5">
          <input
            id="password"
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
            {showPassword ? (
              <EyeSlash size={18} weight="bold" />
            ) : (
              <Eye size={18} weight="bold" />
            )}
          </button>
        </div>
      </div>

      {/* Confirm Password Field with Show/Hide Toggle */}
      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-xs font-semibold text-canvas-text"
        >
          Confirm Password
        </label>
        <div className="relative mt-1.5">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            placeholder="Repeat your password"
            className="block w-full rounded-2xl border border-canvas-border bg-canvas-subtle/50 px-4 py-3 pr-11 text-sm text-canvas-text placeholder:text-canvas-muted focus:border-brand focus:bg-canvas-card focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 transition"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-canvas-muted hover:text-brand transition-colors focus:outline-none"
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
          >
            {showConfirmPassword ? (
              <EyeSlash size={18} weight="bold" />
            ) : (
              <Eye size={18} weight="bold" />
            )}
          </button>
        </div>
      </div>

      {/* Create Account Action Button: 100% consistent with landing page buttons */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          isLoading={isLoading}
        >
          Create Account
        </Button>
      </div>

      {/* Divider */}
      <div className="relative my-6 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-canvas-border" />
        </div>
        <div className="relative bg-canvas-card px-3 text-xs text-canvas-muted">
          or
        </div>
      </div>

      {/* Social Providers Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => handleSocialClick("Google")}
          iconPlacement="left"
          icon={
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.97 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.93 6.72-4.93z"
              />
            </svg>
          }
        >
          Google
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => handleSocialClick("GitHub")}
          iconPlacement="left"
          icon={
            <svg className="size-4 shrink-0 fill-canvas-text" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          }
        >
          GitHub
        </Button>
      </div>
    </form>
  );
}
