import type { ScannedPage } from "@/types/document";

interface PageThumbnailStripProps {
  readonly pages: readonly ScannedPage[];
  readonly activeIndex: number;
  readonly onSelectPage: (index: number) => void;
}

export function PageThumbnailStrip({
  pages,
  activeIndex,
  onSelectPage,
}: PageThumbnailStripProps) {
  if (pages.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Pages navigation"
      className="flex w-full items-center gap-2.5 overflow-x-auto px-1 py-2 scrollbar-none"
    >
      {pages.map((page, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelectPage(index)}
            aria-label={`Page ${page.pageNumber}`}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex-shrink-0 overflow-hidden rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              isActive
                ? "ring-2 ring-white shadow-md scale-105"
                : "opacity-70 hover:opacity-100 ring-1 ring-white/20"
            }`}
          >
            <div className="h-16 w-12 bg-slate-800 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.previewUrl}
                alt={`Thumbnail of page ${page.pageNumber}`}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="absolute bottom-0.5 right-0.5 rounded bg-slate-950/80 px-1 py-0.2 text-[10px] font-semibold text-white">
              {page.pageNumber}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
