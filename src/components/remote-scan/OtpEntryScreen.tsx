"use client";

import { useCallback, useRef, useState } from "react";

interface OtpEntryScreenProps {
  readonly title?: string;
  readonly onVerify: (otp: string) => Promise<{
    success: boolean;
    error?: string;
    attemptsRemaining?: number;
  }>;
}

export function OtpEntryScreen({ title, onVerify }: OtpEntryScreenProps) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const submitOtp = useCallback(
    async (fullOtp: string) => {
      if (fullOtp.length !== 6 || isVerifying) {
        return;
      }

      setIsVerifying(true);
      setErrorMessage(null);

      try {
        const result = await onVerify(fullOtp);
        if (!result.success) {
          if (result.error === "locked") {
            setErrorMessage("Too many incorrect attempts. Link is locked.");
          } else if (result.error === "expired") {
            setErrorMessage("This scan link has expired.");
          } else {
            const remaining = result.attemptsRemaining ?? null;
            setErrorMessage(
              remaining !== null
                ? `Incorrect code. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`
                : "Incorrect code. Please check and try again.",
            );
          }
          // Clear digits on error
          setDigits(["", "", "", "", "", ""]);
          inputRefs.current[0]?.focus();
        }
      } catch {
        setErrorMessage("Unable to verify code. Please check your internet connection.");
      } finally {
        setIsVerifying(false);
      }
    },
    [isVerifying, onVerify],
  );

  const handleDigitChange = useCallback(
    async (index: number, value: string) => {
      // Clean only numeric input
      const numeric = value.replace(/\D/g, "");

      if (numeric.length > 1) {
        // Handle multi-character paste into any field
        const pasted = numeric.slice(0, 6).split("");
        const nextDigits = [...digits];
        for (let i = 0; i < 6; i++) {
          nextDigits[i] = pasted[i] || "";
        }
        setDigits(nextDigits);
        const nextFocus = Math.min(pasted.length, 5);
        inputRefs.current[nextFocus]?.focus();

        if (pasted.length === 6) {
          const fullOtp = pasted.join("");
          await submitOtp(fullOtp);
        }
        return;
      }

      const nextDigits = [...digits];
      nextDigits[index] = numeric;
      setDigits(nextDigits);
      setErrorMessage(null);

      // Auto-advance to next box if digit entered
      if (numeric.length === 1 && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      // If all 6 digits entered, auto-submit
      if (numeric.length === 1 && index === 5) {
        const fullOtp = [...nextDigits.slice(0, 5), numeric].join("");
        if (fullOtp.length === 6) {
          await submitOtp(fullOtp);
        }
      }
    },
    [digits, submitOtp],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const isComplete = digits.every((d) => d.length === 1);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-5 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/70 p-7 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="mb-2 text-center">
          <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Secure Scan
          </span>
        </div>

        <h1 className="mt-4 text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Enter 6-digit code
        </h1>

        <p className="mt-3 text-center text-sm leading-relaxed text-slate-300">
          {title ? (
            <>
              To scan <strong className="text-white">{title}</strong>, enter the code sent to you.
            </>
          ) : (
            "Enter the 6-digit code sent by the person requesting this document."
          )}
        </p>

        {/* 6 Digit Input Group */}
        <div className="mt-8 flex justify-center gap-2 sm:gap-2.5">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              disabled={isVerifying}
              value={digit}
              onChange={(e) => void handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="size-12 rounded-xl border border-slate-700 bg-slate-950 text-center text-2xl font-bold tracking-tight text-white transition-all hover:border-slate-500 focus:border-white focus:outline-none focus:ring-4 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50 sm:size-13"
              aria-label={`Digit ${idx + 1}`}
            />
          ))}
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-center text-xs font-medium text-rose-300"
          >
            {errorMessage}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          disabled={!isComplete || isVerifying}
          onClick={() => void submitOtp(digits.join(""))}
          className="mt-8 flex min-h-14 w-full items-center justify-center rounded-xl bg-white px-6 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {isVerifying ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
              Verifying…
            </span>
          ) : (
            "Start Scanning"
          )}
        </button>

        <p className="mt-6 text-center text-xs text-slate-500">
          No app download or account creation required.
        </p>
      </div>
    </main>
  );
}
