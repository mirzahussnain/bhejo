interface UploadErrorScreenProps {
  readonly errorMessage?: string;
  readonly onRetry: () => void;
  readonly onCancel?: () => void;
}

export function UploadErrorScreen({
  errorMessage,
  onRetry,
  onCancel,
}: UploadErrorScreenProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <svg
            className="size-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white">
          Upload was interrupted
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {errorMessage || "We couldn't reach the server. Don't worry, your scanned pages are saved on this phone."}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex min-h-14 w-full items-center justify-center rounded-xl bg-white px-6 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          >
            Retry Upload
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-700 bg-transparent px-6 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Back to review
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
