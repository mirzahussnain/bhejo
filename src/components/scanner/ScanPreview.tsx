interface ScanPreviewProps {
  readonly imageUrl: string;
  readonly pageNumber: number;
  readonly isRetakeMode?: boolean;
  readonly correctionFallback: boolean;
  readonly onAddNextPage?: () => void;
  readonly onReview?: () => void;
  readonly onSaveReplacement?: () => void;
  readonly onRetake: () => void;
  readonly onCancel?: () => void;
}

export function ScanPreview({
  imageUrl,
  pageNumber,
  isRetakeMode = false,
  correctionFallback,
  onAddNextPage,
  onReview,
  onSaveReplacement,
  onRetake,
  onCancel,
}: ScanPreviewProps) {
  return (
    <main className="flex h-dvh flex-col bg-slate-950 text-white">
      <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {isRetakeMode ? "Check replacement" : `Page ${pageNumber} captured`}
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            {isRetakeMode
              ? `Replace Page ${pageNumber} with this scan.`
              : "Review this scan before continuing."}
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Cancel
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`Page ${pageNumber} scan`}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <footer className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {correctionFallback && (
          <p className="mb-3 text-center text-sm leading-5 text-amber-200" role="status">
            We couldn&apos;t straighten this page. Retake it if you need a cleaner edge.
          </p>
        )}

        {isRetakeMode ? (
          <div className="flex flex-col gap-2.5">
            {onSaveReplacement && (
              <button
                type="button"
                onClick={onSaveReplacement}
                className="min-h-14 w-full rounded-xl bg-white px-6 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              >
                Use this replacement
              </button>
            )}
            <button
              type="button"
              onClick={onRetake}
              className="min-h-14 w-full rounded-xl border border-slate-600 px-6 text-base font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            >
              Retake again
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2.5">
              {onAddNextPage && (
                <button
                  type="button"
                  onClick={onAddNextPage}
                  className="min-h-14 flex-1 rounded-xl bg-white px-4 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  + Add page
                </button>
              )}
              {onReview && (
                <button
                  type="button"
                  onClick={onReview}
                  className="min-h-14 flex-1 rounded-xl border border-slate-500 bg-slate-900 px-4 text-base font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  Review
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onRetake}
              className="min-h-12 w-full rounded-xl border border-slate-700 px-6 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            >
              Retake this page
            </button>
          </div>
        )}
      </footer>
    </main>
  );
}
