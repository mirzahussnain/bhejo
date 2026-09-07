import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BhejoLogo } from "@/shared/components/ui/BhejoLogo";
import { VerifyEmailCard } from "./VerifyEmailCard";

export const metadata: Metadata = {
  title: "Confirm Your Email | Bhejo",
  description: "Please confirm your email address to access your Bhejo account.",
};

export default async function VerifyEmailPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (user.email_confirmed_at) {
    redirect("/dashboard");
  }

  const email = user.email || "your email address";

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

        <VerifyEmailCard email={email} />
      </div>
    </div>
  );
}
