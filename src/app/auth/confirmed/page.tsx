import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { BhejoLogo } from "@/shared/components/ui/BhejoLogo";
import { Button } from "@/shared/components/ui/Button";

export const metadata: Metadata = {
  title: "Email Confirmed | Bhejo",
  description: "Your Bhejo account email has been successfully confirmed.",
};

export default function ConfirmedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <Link
            href="/"
            className="group flex items-center gap-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-xl p-1"
          >
            <BhejoLogo size={36} />
            <span className="text-xl font-bold tracking-tight text-canvas-text group-hover:text-brand transition-colors">
              Bhejo
            </span>
          </Link>
        </div>

        {/* Confirmation Success Card */}
        <div className="rounded-3xl border border-canvas-border bg-canvas-card p-8 text-center shadow-xs sm:p-10 space-y-6">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle size={40} weight="fill" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-canvas-text sm:text-3xl">
              Congratulations!
            </h1>
            <p className="text-sm leading-relaxed text-canvas-muted max-w-xs mx-auto">
              Your email has been successfully confirmed. Your Bhejo account is now ready to use.
            </p>
          </div>

          <div className="pt-2">
            <Button href="/login" variant="primary" size="lg" fullWidth>
              Sign In
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
