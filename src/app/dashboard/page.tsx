export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Bhejo Dashboard
        </h1>
        <p className="mt-4 text-base text-slate-600 sm:text-lg">
          Document requests will appear here.
        </p>
      </div>
    </main>
  );
}
