"use client";

import { useRef, useState } from "react";
import type { EnhancementPreset, PageEditState, WorkspacePageInfo } from "@/types/workspace";
import { DocumentCropper, type DocumentCropperRef } from "./DocumentCropper";
import { PresetSelector } from "./PresetSelector";
import {
  createInitialHistory,
  isPageEdited,
  pushEditState,
  resetEditState,
  rotateClockwise,
  rotateCounterClockwise,
  undoEditState,
  type EditHistoryState,
} from "@/lib/workspace/state";
import { applyPresetToCanvas } from "@/lib/workspace/enhancement-presets";

interface DocumentEditorViewProps {
  readonly page: WorkspacePageInfo;
  readonly initialEditState?: PageEditState;
  readonly onApplyEdits: (state: PageEditState, editedCanvas: HTMLCanvasElement | null) => void;
  readonly onBackToPreview: () => void;
}

export function DocumentEditorView({
  page,
  initialEditState,
  onApplyEdits,
  onBackToPreview,
}: DocumentEditorViewProps) {
  const cropperRef = useRef<DocumentCropperRef | null>(null);

  const [history, setHistory] = useState<EditHistoryState>(() =>
    createInitialHistory(initialEditState),
  );
  const [isApplying, setIsApplying] = useState(false);

  const currentState = history.present;
  const canUndo = history.past.length > 0;
  const isDirty = isPageEdited(currentState);

  const handleRotateCW = () => {
    cropperRef.current?.rotateCW();
    const nextRotation = rotateClockwise(currentState.rotation);
    const nextState: PageEditState = {
      ...currentState,
      rotation: nextRotation,
    };
    setHistory((prev) => pushEditState(prev, nextState));
  };

  const handleRotateCCW = () => {
    cropperRef.current?.rotateCCW();
    const nextRotation = rotateCounterClockwise(currentState.rotation);
    const nextState: PageEditState = {
      ...currentState,
      rotation: nextRotation,
    };
    setHistory((prev) => pushEditState(prev, nextState));
  };

  const handleSelectPreset = (preset: EnhancementPreset) => {
    const nextState: PageEditState = {
      ...currentState,
      preset,
    };
    setHistory((prev) => pushEditState(prev, nextState));
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const previousHistory = undoEditState(history);
    setHistory(previousHistory);

    // If rotation changed, reflect it
    if (previousHistory.present.rotation !== currentState.rotation) {
      // If rotation reverted, reset cropper and re-apply target rotation
      cropperRef.current?.reset();
      const target = previousHistory.present.rotation;
      if (target === 90) cropperRef.current?.rotateCW();
      if (target === 180) {
        cropperRef.current?.rotateCW();
        cropperRef.current?.rotateCW();
      }
      if (target === 270) cropperRef.current?.rotateCCW();
    }
  };

  const handleReset = () => {
    cropperRef.current?.reset();
    setHistory(resetEditState());
  };

  const handleDone = async () => {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const croppedCanvas = await cropperRef.current?.getCroppedCanvas();
      const hasCrop = cropperRef.current?.hasCropChanged() ?? false;

      const finalState: PageEditState = {
        ...currentState,
        isCropped: hasCrop,
      };

      if (croppedCanvas && finalState.preset !== "original") {
        // Apply enhancement preset onto the canvas
        applyPresetToCanvas(croppedCanvas, finalState.preset);
      }

      onApplyEdits(finalState, croppedCanvas || null);
      onBackToPreview();
    } catch {
      onBackToPreview();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-950">
      {/* Top Editor Sub-header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 py-2.5 sm:px-6">
        <button
          type="button"
          onClick={onBackToPreview}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to Preview</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">
            Editing Page {page.pageNumber}
          </span>
          {isDirty && (
            <span className="size-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved edits" />
          )}
        </div>

        <button
          type="button"
          onClick={handleDone}
          disabled={isApplying}
          className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-slate-100 transition shadow-xs disabled:opacity-50"
        >
          {isApplying ? "Applying…" : "Done Editing"}
        </button>
      </div>

      {/* Main Interactive Cropper Canvas */}
      <div className="relative flex-1 p-2 sm:p-4 overflow-hidden">
        <DocumentCropper
          ref={cropperRef}
          imageUrl={page.downloadUrl}
          initialRotation={currentState.rotation}
          preset={currentState.preset}
          onTransformChange={(_delta, isCropActive) => {
            if (isCropActive && !currentState.isCropped) {
              setHistory((prev) =>
                pushEditState(prev, { ...prev.present, isCropped: true }),
              );
            }
          }}
        />
      </div>

      {/* Bottom Floating Tool Control Deck */}
      <div className="border-t border-slate-800/80 bg-slate-900/95 px-4 py-3 sm:px-6 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-4xl mx-auto">
          {/* Rotation Controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
              Rotate:
            </span>
            <button
              type="button"
              onClick={handleRotateCCW}
              disabled={isApplying}
              title="Rotate 90° counter-clockwise"
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-2xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2m0 0l-3-3m3 3l3-3M3 10l3 3M3 10l3-3" />
              </svg>
              <span>-90°</span>
            </button>

            <button
              type="button"
              onClick={handleRotateCW}
              disabled={isApplying}
              title="Rotate 90° clockwise"
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-2xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m0 0l3-3m-3 3l-3-3M21 10l-3 3m3-3l-3-3" />
              </svg>
              <span>+90°</span>
            </button>
          </div>

          {/* Enhancement Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
              Enhance:
            </span>
            <PresetSelector
              activePreset={currentState.preset}
              onSelectPreset={(p) => !isApplying && handleSelectPreset(p)}
            />
          </div>

          {/* Undo / Reset */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo || isApplying}
              title="Undo last edit"
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2m0 0l-3-3m3 3l3-3M3 10l3 3M3 10l3-3" />
              </svg>
              <span>Undo</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || isApplying}
              title="Reset all adjustments back to original scan"
              className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/60 hover:text-rose-100 transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
