import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
import { OwnerSessionManager } from "@/components/dashboard/OwnerSessionManager";
import { BhejoLogo } from "@/shared/components/ui/BhejoLogo";

export const metadata: Metadata = {
  title: "Dashboard | Bhejo",
  description: "Create and manage secure document scan requests.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Server-side route protection layer
  if (!user) {
    redirect("/login");
  }

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.email ? user.email.split("@")[0] : "User");
  const email = user.email || "No email provided";
  const userId = user.id;

  return (
    <div className="min-h-screen bg-canvas pb-16">
      {/* Top Navbar */}
      <header className="border-b border-canvas-border bg-canvas-card/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <BhejoLogo size={28} />
            <div>
              <span className="text-sm font-bold tracking-tight text-canvas-text">Bhejo</span>
              <span className="hidden sm:inline text-xs text-canvas-muted ml-2 border-l border-canvas-border pl-2">
                Scan Management
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 space-y-6">
        {/* User Identity Profile Card */}
        <div className="rounded-3xl border border-canvas-border bg-canvas-card p-6 shadow-xs sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-canvas-text sm:text-2xl">
                Welcome, {fullName}
              </h1>
              <div className="mt-2 flex flex-col sm:flex-row sm:gap-6 text-xs text-canvas-muted font-mono">
                <p>
                  <span className="font-semibold text-canvas-text">Email:</span> {email}
                </p>
                <p>
                  <span className="font-semibold text-canvas-text">User ID:</span> {userId}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Remote Scan Manager */}
        <div className="rounded-3xl border border-canvas-border bg-canvas-card p-6 shadow-xs sm:p-8">
          <OwnerSessionManager />
        </div>
      </main>
    </div>
  );
}
