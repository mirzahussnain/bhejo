import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BhejoLogo } from "@/shared/components/ui/BhejoLogo";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata: Metadata = {
  title: "Update Password | Bhejo",
  description: "Set a new secure password for your Bhejo account.",
};

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If there is no active session from the password recovery callback, redirect to forgot-password
  if (!user) {
    redirect("/auth/forgot-password");
  }

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

        <UpdatePasswordForm />
      </div>
    </div>
  );
}
