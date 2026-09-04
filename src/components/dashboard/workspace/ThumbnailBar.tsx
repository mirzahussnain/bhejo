"use client";

import { isPageEdited } from "@/lib/workspace/state";
import type { PageEditState, WorkspacePageInfo } from "@/types/workspace";

interface ThumbnailBarProps {
  readonly pages: readonly WorkspacePageInfo[];
  readonly activePageIndex: number;
  readonly pageEdits: Record<string, PageEditState>;
  readonly onSelectPage: (index: number) => void;
}

export function ThumbnailBar({
  pages,
  activePageIndex,
  pageEdits,
  onSelectPage,
}: ThumbnailBarProps) {
  if (pages.length <= 1) {
    return null;
  }

  return (
    <div className="flex w-full items-center gap-2.5 overflow-x-auto px-4 py-3 border-t border-slate-200/80 bg-slate-50/70 scrollbar-thin">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
        Pages:
      </span>

      <div className="flex items-center gap-2.5">
        {pages.map((page, index) => {
          const isActive = index === activePageIndex;
          const editState = pageEdits[page.id];
          const hasEdits = editState ? isPageEdited(editState) : false;

          return (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelectPage(index)}
              className={`group relative flex flex-col items-center shrink-0 rounded-xl border p-1 transition ${
                isActive
                  ? "border-slate-900 bg-white ring-2 ring-slate-900/10 shadow-xs"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="relative h-14 w-10 overflow-hidden rounded-lg bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.downloadUrl}
                  alt={`Page ${page.pageNumber}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />

                {hasEdits && (
                  <span
                    title="This page has unsaved client-side edits"
                    className="absolute top-1 right-1 size-2 rounded-full bg-amber-500 ring-2 ring-white"
                  />
                )}
              </div>

              <span
                className={`mt-1 text-[11px] font-medium leading-none ${
                  isActive ? "font-bold text-slate-900" : "text-slate-500 group-hover:text-slate-700"
                }`}
              >
                p. {page.pageNumber}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
