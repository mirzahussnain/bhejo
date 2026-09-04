"use client";

import { useEffect, useRef, useState } from "react";
import type { PageEditState, WorkspacePageInfo } from "@/types/workspace";
import { isPageEdited } from "@/lib/workspace/state";

interface DocumentPreviewViewProps {
  readonly page: WorkspacePageInfo;
  readonly pageIndex: number;
  readonly totalPages: number;
  readonly editState?: PageEditState;
  readonly editedCanvas?: HTMLCanvasElement | null;
  readonly onPrevPage: () => void;
  readonly onNextPage: () => void;
  readonly onEnterEditMode: () => void;
}

export function DocumentPreviewView({
  page,
  pageIndex,
  totalPages,
  editState,
  editedCanvas,
  onPrevPage,
  onNextPage,
  onEnterEditMode,
}: DocumentPreviewViewProps) {
  const hasEdits = editState ? isPageEdited(editState) : false;
  const [showOriginal, setShowOriginal] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Synchronize canvas contents whenever edited canvas or display mode changes
  useEffect(() => {
    if (!showOriginal && editedCanvas && hasEdits && canvasRef.current) {
      const display = canvasRef.current;
      display.width = editedCanvas.width;
      display.height = editedCanvas.height;
      const ctx = display.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, display.width, display.height);
        ctx.drawImage(editedCanvas, 0, 0);
      }
    }
  }, [editedCanvas, hasEdits, showOriginal]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && pageIndex > 0) {
        e.preventDefault();
        onPrevPage();
      } else if (e.key === "ArrowRight" && pageIndex < totalPages - 1) {
        e.preventDefault();
        onNextPage();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pageIndex, totalPages, onPrevPage, onNextPage]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-slate-900/95 p-4 sm:p-6 select-none">
      {/* Top Banner with Compare & Zoom Controls */}
      <div className="absolute top-4 z-20 flex flex-wrap items-center justify-center gap-2">
        {hasEdits && (
          <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/90 px-3 py-1 text-xs text-white shadow-md backdrop-blur-xs">
            <span className="font-semibold text-amber-400">
              {showOriginal ? "Showing Original Scan" : "Showing Edited Preview"}
            </span>
            <button
              type="button"
              onClick={() => setShowOriginal(!showOriginal)}
              className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-600 transition"
            >
              {showOriginal ? "View Edited" : "Compare Original"}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsZoomed(!isZoomed)}
          title={isZoomed ? "Fit to screen" : "Zoom in to inspect text"}
          aria-label={isZoomed ? "Fit to screen" : "Zoom in to inspect text"}
          className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/90 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-md backdrop-blur-xs"
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isZoomed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            )}
          </svg>
          <span>{isZoomed ? "Fit to Screen" : "100% Zoom (Inspect Text)"}</span>
        </button>
      </div>

      {/* Main Preview Viewport */}
      <div
        className={`relative flex h-full w-full items-center justify-center transition-all ${
          isZoomed
            ? "overflow-auto p-4 cursor-zoom-out"
            : "overflow-hidden cursor-zoom-in"
        }`}
        onClick={() => setIsZoomed(!isZoomed)}
        title={isZoomed ? "Click to fit" : "Click to zoom into text"}
      >
        {hasEdits && editedCanvas && !showOriginal ? (
          <canvas
            ref={canvasRef}
            className={`rounded-lg shadow-2xl transition-transform ${
              isZoomed
                ? "w-auto max-w-none scale-150 sm:scale-175 origin-center my-auto"
                : "max-h-full max-w-full object-contain"
            }`}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={page.downloadUrl}
            alt={`Document Page ${page.pageNumber}`}
            className={`rounded-lg shadow-2xl transition-transform ${
              isZoomed
                ? "w-auto max-w-none scale-150 sm:scale-175 origin-center my-auto"
                : "max-h-full max-w-full object-contain"
            }`}
          />
        )}
      </div>

      {/* Previous Page Floating Arrow */}
      {pageIndex > 0 && (
        <button
          type="button"
          onClick={onPrevPage}
          title="Previous page (Left arrow)"
          className="absolute left-4 z-20 flex size-11 items-center justify-center rounded-full bg-slate-800/80 text-white shadow-lg backdrop-blur-xs transition hover:bg-slate-700 hover:scale-105 active:scale-95"
          aria-label="Previous Page"
        >
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next Page Floating Arrow */}
      {pageIndex < totalPages - 1 && (
        <button
          type="button"
          onClick={onNextPage}
          title="Next page (Right arrow)"
          className="absolute right-4 z-20 flex size-11 items-center justify-center rounded-full bg-slate-800/80 text-white shadow-lg backdrop-blur-xs transition hover:bg-slate-700 hover:scale-105 active:scale-95"
          aria-label="Next Page"
        >
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Floating Action Button to enter Edit mode */}
      <div className="absolute bottom-4 z-20">
        <button
          type="button"
          onClick={onEnterEditMode}
          className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-slate-950 shadow-xl transition hover:bg-slate-100 hover:scale-102 active:scale-98"
        >
          <svg className="size-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>Edit Page {page.pageNumber}</span>
        </button>
      </div>
    </div>
  );
}
