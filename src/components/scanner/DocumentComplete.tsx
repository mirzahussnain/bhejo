import type { ScannedDocument } from "@/types/document";

interface DocumentCompleteProps {
  readonly document: ScannedDocument;
  readonly onReset: () => void;
}

export function DocumentComplete({
  document,
  onReset,
}: DocumentCompleteProps) {
  const pageCount = document.pages.length;

  return (
    <main className="flex h-dvh flex-col bg-slate-950 text-white">
      <header className="px-5 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <svg
            className="size-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Document ready
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          {pageCount} {pageCount === 1 ? "page" : "pages"} scanned and stored locally.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {document.pages.map((page) => (
            <div
              key={page.id}
              className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm"
            >
              <div className="aspect-[3/4] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.previewUrl}
                  alt={`Scanned page ${page.pageNumber}`}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="p-2 text-center text-xs font-medium text-slate-300">
                Page {page.pageNumber}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={onReset}
          className="min-h-14 w-full rounded-xl bg-white px-6 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          Scan another document
        </button>
      </footer>
    </main>
  );
}
