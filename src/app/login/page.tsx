import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Log In | Bhejo",
  description: "Sign in to access your Bhejo scan dashboard.",
};

interface LoginPageProps {
  readonly searchParams: Promise<{ redirectTo?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = params?.redirectTo || "/dashboard";

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
          Sign in to your account
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Manage your scan requests, documents, and recipient sessions.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xs rounded-3xl border border-slate-200/80 sm:px-10">
          <LoginForm redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  );
}
