import type { Metadata } from "next";
import { OwnerSessionManager } from "@/components/dashboard/OwnerSessionManager";

export const metadata: Metadata = {
  title: "Dashboard | Bhejo",
  description: "Create and manage secure document scan requests.",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Top Navbar */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white shadow-xs">
              B
            </span>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-900">Bhejo</span>
              <span className="hidden sm:inline text-xs text-slate-400 ml-2 border-l border-slate-200 pl-2">
                Remote Scan Management
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8">
          <OwnerSessionManager />
        </div>
      </main>
    </div>
  );
}
