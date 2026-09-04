import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign Up | Bhejo",
  description: "Create your Bhejo account to manage remote document scanning.",
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-slate-50/60 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-xs">
            B
          </span>
          <span className="text-2xl font-bold tracking-tight text-slate-900">Bhejo</span>
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          Create your account
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Start generating secure, link-based document scan requests.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xs rounded-3xl border border-slate-200/80 sm:px-10">
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
