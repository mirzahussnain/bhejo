import type { Metadata } from "next";
import { OwnerSessionManager } from "@/components/dashboard/OwnerSessionManager";

export const metadata: Metadata = {
  title: "Dashboard | Bhejo",
  description: "Create and manage secure document scan requests.",
};

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="border-b border-slate-200 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Bhejo
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Scan Requests
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Generate a secure link and code to request documents from someone remotely.
          </p>
        </div>

        <div className="mt-6">
          <OwnerSessionManager />
        </div>
      </div>
    </main>
  );
}
