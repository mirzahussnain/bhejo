import { PageThumbnailStrip } from "@/components/scanner/PageThumbnailStrip";
import type { ScannedPage } from "@/types/document";

interface MultipageReviewProps {
  readonly pages: readonly ScannedPage[];
  readonly activeIndex: number;
  readonly onSelectPage: (index: number) => void;
  readonly onMovePage: (index: number, direction: "left" | "right") => void;
  readonly onRetakePage: (pageId: string) => void;
  readonly onDeletePage: (pageId: string) => void;
  readonly onAddPage: () => void;
  readonly onDone: () => void;
  readonly onCancel?: () => void;
}

export function MultipageReview({
  pages,
  activeIndex,
  onSelectPage,
  onMovePage,
  onRetakePage,
  onDeletePage,
  onAddPage,
  onDone,
  onCancel,
}: MultipageReviewProps) {
  const activePage = pages[activeIndex] ?? pages[0];
  const canMoveLeft = activeIndex > 0;
  const canMoveRight = activeIndex < pages.length - 1;

  if (!activePage) {
    return null;
  }

  return (
    <main className="flex h-dvh flex-col bg-slate-950 text-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">
            Review document
          </h1>
          <p className="text-sm text-slate-300">
            Page {activePage.pageNumber} of {pages.length}
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

      {/* Main Preview */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-black p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activePage.previewUrl}
          alt={`Page ${activePage.pageNumber}`}
          className="max-h-full max-w-full object-contain"
        />

        {activePage.correctionFallback && (
          <div
            className="absolute bottom-3 left-3 right-3 rounded-lg bg-slate-900/90 p-2.5 text-center text-xs leading-4 text-amber-200 backdrop-blur-sm"
            role="status"
          >
            We couldn&apos;t straighten this page. Retake it if you need a cleaner edge.
          </div>
        )}
      </div>

      {/* Multipage Navigation & Action Bar */}
      <div className="shrink-0 bg-slate-900/80 px-4 py-2 backdrop-blur">
        {/* Thumbnail strip */}
        <div className="flex items-center justify-center">
          <PageThumbnailStrip
            pages={pages}
            activeIndex={activeIndex}
            onSelectPage={onSelectPage}
          />
        </div>

        {/* Page Actions: Reorder & Single Page Operations */}
        <div className="mt-2 flex items-center justify-between gap-2">
          {/* Reorder controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onMovePage(activeIndex, "left")}
              disabled={!canMoveLeft}
              aria-label="Move page earlier"
              className="flex min-h-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              ◀ Move left
            </button>
            <button
              type="button"
              onClick={() => onMovePage(activeIndex, "right")}
              disabled={!canMoveRight}
              aria-label="Move page later"
              className="flex min-h-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Move right ▶
            </button>
          </div>

          {/* Page Mutation controls: Retake & Delete */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onRetakePage(activePage.id)}
              className="flex min-h-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() => onDeletePage(activePage.id)}
              aria-label={`Delete page ${activePage.pageNumber}`}
              className="flex min-h-10 items-center justify-center rounded-lg border border-rose-800/80 bg-rose-950/60 px-3 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Primary Session Footer Actions */}
      <footer className="shrink-0 bg-slate-950 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onAddPage}
            className="min-h-14 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-4 text-base font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          >
            + Add page
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={pages.length === 0}
            className="min-h-14 flex-1 rounded-xl bg-white px-4 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Done
          </button>
        </div>
      </footer>
    </main>
  );
}
