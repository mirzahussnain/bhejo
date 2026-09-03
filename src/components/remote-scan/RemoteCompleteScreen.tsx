interface RemoteCompleteScreenProps {
  readonly pageCount: number;
}

export function RemoteCompleteScreen({ pageCount }: RemoteCompleteScreenProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          <svg
            className="size-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white">
          Document sent!
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {pageCount} {pageCount === 1 ? "page" : "pages"} uploaded directly to the sender.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-medium text-slate-400">
            ✓ Upload encrypted &amp; verified
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ✓ Local memory cleared for privacy
          </p>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          You can safely close this browser window.
        </p>
      </div>
    </main>
  );
}
