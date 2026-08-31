import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Bhejo
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Send a link. Hold the document. Done.
        </h1>
        <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
          Simple, private document scanning without installing an app.
        </p>
        <Link
          href="/scan/demo"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-900 px-6 text-base font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          Try Scanner
        </Link>
      </div>
    </main>
  );
}
