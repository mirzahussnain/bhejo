"use client";

import type { WorkspaceMode } from "@/types/workspace";

interface WorkspaceToolbarProps {
  readonly title: string;
  readonly pageNumber: number;
  readonly totalPages: number;
  readonly mode: WorkspaceMode;
  readonly isPageEdited: boolean;
  readonly isExporting: boolean;
  readonly onChangeMode: (mode: WorkspaceMode) => void;
  readonly onDownloadOriginal: () => void;
  readonly onDownloadEdited: () => void;
  readonly onClose: () => void;
}

export function WorkspaceToolbar({
  title,
  pageNumber,
  totalPages,
  mode,
  isPageEdited,
  isExporting,
  onChangeMode,
  onDownloadOriginal,
  onDownloadEdited,
  onClose,
}: WorkspaceToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 sm:px-6">
      {/* Title & Page Counter */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition sm:hidden"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 truncate">
              {title}
            </h2>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 shrink-0">
              Page {pageNumber} of {totalPages}
            </span>
            {isPageEdited && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 shrink-0">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Edited
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center Mode Switcher: Preview / Edit */}
      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-200/60 p-1">
        <button
          type="button"
          onClick={() => onChangeMode("preview")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            mode === "preview"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span>Preview</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeMode("edit")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            mode === "edit"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>Edit</span>
        </button>
      </div>

      {/* Right Download & Close Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDownloadOriginal}
          title="Download original untouched scan directly from storage"
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-2xs"
        >
          Download Original
        </button>

        <button
          type="button"
          onClick={onDownloadEdited}
          disabled={isExporting}
          title="Export and download the client-side edited scan"
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition shadow-2xs ${
            isPageEdited
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          } disabled:opacity-50`}
        >
          {isExporting ? "Exporting…" : "Download Edited"}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="hidden sm:flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition ml-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
