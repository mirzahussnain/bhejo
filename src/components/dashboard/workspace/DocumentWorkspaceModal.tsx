"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { UploadedPageRecord } from "@/types/remote-scan";
import {
  toWorkspacePageInfo,
  type PageEditState,
  type WorkspaceMode,
  type WorkspacePageInfo,
} from "@/types/workspace";
import { isPageEdited } from "@/lib/workspace/state";
import { DEFAULT_EXPORT_JPEG_QUALITY } from "@/lib/workspace/constants";
import { WorkspaceToolbar } from "./WorkspaceToolbar";
import { ThumbnailBar } from "./ThumbnailBar";
import { DocumentPreviewView } from "./DocumentPreviewView";

// Lazy-load the heavy editor view so the main dashboard never pays the bundle cost upfront
const LazyDocumentEditorView = dynamic(
  () =>
    import("./DocumentEditorView").then((mod) => ({
      default: mod.DocumentEditorView,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-950 text-white">
        <span className="size-8 animate-spin rounded-full border-3 border-slate-600 border-t-white" />
        <p className="mt-3 text-xs font-medium text-slate-400">Loading Document Editor…</p>
      </div>
    ),
  },
);

interface DocumentWorkspaceModalProps {
  readonly sessionId: string;
  readonly sessionTitle?: string;
  readonly pages: readonly UploadedPageRecord[];
  readonly initialPageIndex?: number;
  readonly onClose: () => void;
}

export function DocumentWorkspaceModal({
  sessionId,
  sessionTitle,
  pages,
  initialPageIndex = 0,
  onClose,
}: DocumentWorkspaceModalProps) {
  const [activePageIndex, setActivePageIndex] = useState(initialPageIndex);
  const [mode, setMode] = useState<WorkspaceMode>("preview");
  const [pageEdits, setPageEdits] = useState<Record<string, PageEditState>>({});
  const [editedCanvases, setEditedCanvases] = useState<Record<string, HTMLCanvasElement>>({});
  const [isExporting, setIsExporting] = useState(false);

  // Map to workspace pages
  const workspacePages: readonly WorkspacePageInfo[] = useMemo(() => {
    return pages.map((p) => toWorkspacePageInfo(sessionId, p));
  }, [sessionId, pages]);

  const activePage = workspacePages[activePageIndex] || workspacePages[0];
  const activeEditState = activePage ? pageEdits[activePage.id] : undefined;
  const activeEditedCanvas = activePage ? editedCanvases[activePage.id] : null;
  const hasEdits = activeEditState ? isPageEdited(activeEditState) : false;

  // Keyboard shortcut to close (ESC)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Handle downloading the pristine original scan directly
  const handleDownloadOriginal = () => {
    if (!activePage) return;
    const link = document.createElement("a");
    link.href = activePage.downloadUrl;
    link.download = `scan-${sessionId.slice(0, 8)}-page-${activePage.pageNumber}-original.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle exporting and downloading the edited scan
  const handleDownloadEdited = async () => {
    if (!activePage) return;

    // If no edits have been made, fallback to downloading original
    if (!hasEdits || !activeEditedCanvas) {
      handleDownloadOriginal();
      return;
    }

    setIsExporting(true);
    let blobUrl: string | null = null;
    try {
      activeEditedCanvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsExporting(false);
            return;
          }
          blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = `scan-${sessionId.slice(0, 8)}-page-${activePage.pageNumber}-edited.jpg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Revoke immediately after download initiation
          setTimeout(() => {
            if (blobUrl) {
              URL.revokeObjectURL(blobUrl);
            }
            setIsExporting(false);
          }, 100);
        },
        "image/jpeg",
        DEFAULT_EXPORT_JPEG_QUALITY,
      );
    } catch {
      setIsExporting(false);
    }
  };

  const handleApplyEdits = (state: PageEditState, canvas: HTMLCanvasElement | null) => {
    if (!activePage) return;

    setPageEdits((prev) => ({
      ...prev,
      [activePage.id]: state,
    }));

    if (canvas) {
      setEditedCanvases((prev) => ({
        ...prev,
        [activePage.id]: canvas,
      }));
    }
  };

  if (!activePage) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-0 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="flex h-full w-full flex-col overflow-hidden sm:rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
        {/* Workspace Toolbar */}
        <WorkspaceToolbar
          title={sessionTitle || "Document Workspace"}
          pageNumber={activePage.pageNumber}
          totalPages={workspacePages.length}
          mode={mode}
          isPageEdited={hasEdits}
          isExporting={isExporting}
          onChangeMode={(newMode) => setMode(newMode)}
          onDownloadOriginal={handleDownloadOriginal}
          onDownloadEdited={handleDownloadEdited}
          onClose={onClose}
        />

        {/* Viewport: Preview View or Editor View */}
        <div className="relative flex flex-1 overflow-hidden">
          {mode === "preview" ? (
            <DocumentPreviewView
              page={activePage}
              pageIndex={activePageIndex}
              totalPages={workspacePages.length}
              editState={activeEditState}
              editedCanvas={activeEditedCanvas}
              onPrevPage={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
              onNextPage={() =>
                setActivePageIndex((prev) =>
                  Math.min(workspacePages.length - 1, prev + 1),
                )
              }
              onEnterEditMode={() => setMode("edit")}
            />
          ) : (
            <LazyDocumentEditorView
              page={activePage}
              initialEditState={activeEditState}
              onApplyEdits={handleApplyEdits}
              onBackToPreview={() => setMode("preview")}
            />
          )}
        </div>

        {/* Multipage Thumbnail Strip - only visible in Preview mode */}
        {mode === "preview" && (
          <ThumbnailBar
            pages={workspacePages}
            activePageIndex={activePageIndex}
            pageEdits={pageEdits}
            onSelectPage={(index) => setActivePageIndex(index)}
          />
        )}
      </div>
    </div>
  );
}
