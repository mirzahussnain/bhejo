"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraPreview } from "@/components/scanner/CameraPreview";
import { DocumentComplete } from "@/components/scanner/DocumentComplete";
import { DocumentOverlay } from "@/components/scanner/DocumentOverlay";
import { MultipageReview } from "@/components/scanner/MultipageReview";
import { ScannerGuidance } from "@/components/scanner/ScannerGuidance";
import { ScanPreview } from "@/components/scanner/ScanPreview";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useCamera } from "@/hooks/useCamera";
import { useDocumentDetection, type ProcessedDocumentFrame } from "@/hooks/useDocumentDetection";
import { useDocumentSession } from "@/hooks/useDocumentSession";
import { useFrameSampler } from "@/hooks/useFrameSampler";
import {
  captureStillPhoto,
  captureVideoFrame,
  type CapturedStillPhoto,
} from "@/lib/camera/camera";
import { CaptureController } from "@/lib/capture/capture-controller";
import {
  evaluateCaptureQuality,
  type CaptureQualityEvaluation,
} from "@/lib/capture/capture-quality";
import { RecentFrameBuffer } from "@/lib/capture/recent-frame-buffer";
import {
  type ScannerWorkflowState,
  isFrameAnalysisAllowed,
} from "@/lib/scanner/scanner-workflow-state";
import { processCapturedFrame } from "@/lib/capture-processing/processing-pipeline";
import type { DocumentDetection } from "@/lib/detection/document-detection";
import { analyseDocumentQuality, type DocumentQuality } from "@/lib/quality/document-quality";
import { deriveScannerState, type ScannerState } from "@/lib/scanner/scanner-state";
import { DocumentStabilityTracker, type DocumentStability } from "@/lib/stability/document-stability";
import type { ScannedDocument } from "@/types/document";

interface LiveAnalysis {
  readonly detection: DocumentDetection | null;
  readonly quality: DocumentQuality | null;
  readonly stability: DocumentStability | null;
  readonly analysisDimensions: { readonly width: number; readonly height: number } | null;
  readonly displayCorners: DocumentDetection["corners"] | null;
}

export interface CaptureDiagnostics {
  readonly method: "image-capture" | "video-frame";
  readonly sourceDimensions: { readonly width: number; readonly height: number };
  readonly sourceAspectRatio: number;
  readonly captureLatencyMs: number;
  readonly processingLatencyMs: number;
  readonly initialSharpness: number;
  readonly outputDimensions: { readonly width: number; readonly height: number };
  readonly jpegSizeBytes: number;
  readonly retried: boolean;
  readonly usedFallback: boolean;
}

declare global {
  interface Window {
    __bhejoCaptureDiagnostics?: () => CaptureDiagnostics | null;
  }
}

export interface CurrentCapture {
  readonly blob: Blob;
  readonly previewUrl: string;
  readonly correctionFallback: boolean;
}

export type ScannerUIMode = "camera" | "page-preview" | "multipage-review" | "complete";

export interface CameraScannerProps {
  readonly onComplete?: (document: ScannedDocument) => void;
  readonly onCancel?: () => void;
  readonly suppressDefaultComplete?: boolean;
}

const INITIAL_LIVE_ANALYSIS: LiveAnalysis = {
  detection: null,
  quality: null,
  stability: null,
  analysisDimensions: null,
  displayCorners: null,
};

// Empirically tuned via settle-delay benchmark (100 vs 120 vs 130 vs 150 vs 180ms):
// 120ms provides the shortest capture delay that guarantees complete autofocus/optical settling
// while firing well before human reaction movement onset (~140-160ms) after visual trigger.
const AUTO_CAPTURE_DELAY_MS = 120;

export function CameraScanner({
  onComplete,
  onCancel,
  suppressDefaultComplete = false,
}: CameraScannerProps) {
  const { status, videoRef, startCamera, stopCamera, getMediaStream } = useCamera();
  const session = useDocumentSession();

  const [uiMode, setUiMode] = useState<ScannerUIMode>("camera");
  const [workflowState, setWorkflowState] = useState<ScannerWorkflowState>("SCANNING");
  const workflowStateRef = useRef<ScannerWorkflowState>(workflowState);
  const [currentCapture, setCurrentCapture] = useState<CurrentCapture | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingError, setIsProcessingError] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysis>(INITIAL_LIVE_ANALYSIS);

  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

  const liveAnalysisRef = useRef<LiveAnalysis>(INITIAL_LIVE_ANALYSIS);
  const mountedRef = useRef(true);
  const operationIdRef = useRef(0);
  const captureControllerRef = useRef(new CaptureController());
  const stabilityTrackerRef = useRef(new DocumentStabilityTracker());
  const autoCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentFrameBufferRef = useRef(new RecentFrameBuffer(2));
  const lastCaptureDiagnosticsRef = useRef<CaptureDiagnostics | null>(null);
  const currentCaptureRef = useRef(currentCapture);
  const sessionRef = useRef(session);

  useEffect(() => {
    currentCaptureRef.current = currentCapture;
  }, [currentCapture]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    window.__bhejoCaptureDiagnostics = () => lastCaptureDiagnosticsRef.current;
    return () => {
      delete window.__bhejoCaptureDiagnostics;
    };
  }, []);

  const isRetakeMode = session.retakeTarget !== null;
  const targetPageNumber = session.retakeTarget
    ? session.retakeTarget.pageNumber
    : session.pageCount + 1;

  const analysisActive =
    status === "ready" &&
    uiMode === "camera" &&
    !isProcessing &&
    !capturePending &&
    isFrameAnalysisAllowed(workflowState);

  const isDocumentTracked = liveAnalysis.detection !== null;
  const targetFps = isDocumentTracked ? 12 : 8;

  const clearAutoCaptureTimer = useCallback(() => {
    if (autoCaptureTimerRef.current !== null) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
  }, []);

  const resetDetectionAndController = useCallback(() => {
    clearAutoCaptureTimer();
    recentFrameBufferRef.current.releaseAll();
    captureControllerRef.current.reset();
    stabilityTrackerRef.current.reset();
    liveAnalysisRef.current = INITIAL_LIVE_ANALYSIS;
    setLiveAnalysis(INITIAL_LIVE_ANALYSIS);
    workflowStateRef.current = "SCANNING";
    setWorkflowState("SCANNING");
  }, [clearAutoCaptureTimer]);

  const performCapture = useCallback(
    async (source: "automatic" | "manual") => {
      const controller = captureControllerRef.current;
      const currentWorkflow = workflowStateRef.current;
      if (
        status !== "ready" ||
        !videoRef.current ||
        capturePending ||
        isProcessing ||
        currentWorkflow === "CAPTURING_HIGH_QUALITY" ||
        currentWorkflow === "PROCESSING" ||
        currentWorkflow === "COMPLETE"
      ) {
        return;
      }
      const captureAccepted =
        source === "automatic"
          ? controller.beginScheduledCapture()
          : controller.beginManualCapture();
      if (!captureAccepted) {
        return;
      }

      const operationId = operationIdRef.current + 1;
      operationIdRef.current = operationId;
      clearAutoCaptureTimer();
      workflowStateRef.current = "CAPTURING_HIGH_QUALITY";
      setWorkflowState("CAPTURING_HIGH_QUALITY");
      setCapturePending(true);
      setCaptureFailed(false);

      let capturedFrameCanvas: HTMLCanvasElement | null = null;

      try {
        const stream = getMediaStream();
        let capturedStill: CapturedStillPhoto | null = null;
        let qualityEval: CaptureQualityEvaluation | null = null;
        let retried = false;
        let usedFallback = false;

        // Capture settle window: brief 80ms settle if manual capture to allow camera focus/exposure stabilization
        if (source === "manual") {
          await new Promise<void>((resolve) => setTimeout(resolve, 80));
        }

        // Snapshot a fallback video frame at trigger moment before attempting ImageCapture.
        // If ImageCapture fails or times out, this provides a crisp pre-movement video backup
        // without running heavy canvas allocations continuously during live preview.
        if (videoRef.current && liveAnalysisRef.current.detection) {
          recentFrameBufferRef.current.recordFrame(
            videoRef.current,
            liveAnalysisRef.current.detection.confidence,
            performance.now(),
          );
        }

        // Attempt high-quality still capture using ImageCapture
        if (stream && videoRef.current) {
          try {
            capturedStill = await captureStillPhoto(stream, videoRef.current, {
              timeoutMs: 2200,
            });
            qualityEval = evaluateCaptureQuality(
              capturedStill.canvas,
              capturedStill.method,
            );

            // Bounded 1-shot retry if quality gate detects severe degradation
            if (!qualityEval.isAcceptable) {
              retried = true;
              capturedStill.canvas.width = 0;
              capturedStill.canvas.height = 0;
              capturedStill = null;

              // Brief settle pause before retry
              await new Promise<void>((resolve) => setTimeout(resolve, 150));

              if (mountedRef.current && stream && videoRef.current) {
                try {
                  capturedStill = await captureStillPhoto(stream, videoRef.current, {
                    timeoutMs: 2200,
                  });
                  qualityEval = evaluateCaptureQuality(
                    capturedStill.canvas,
                    capturedStill.method,
                  );
                  if (!qualityEval.isAcceptable) {
                    capturedStill.canvas.width = 0;
                    capturedStill.canvas.height = 0;
                    capturedStill = null;
                  }
                } catch {
                  capturedStill = null;
                }
              }
            }
          } catch {
            capturedStill = null;
          }
        }

        // Prepare captured frame canvas
        let sourceDimensions: { width: number; height: number };
        let videoDimensions: { width: number; height: number } | undefined;
        let captureMethod: "image-capture" | "video-frame" = "video-frame";
        let initialSharpness = qualityEval?.sharpness ?? 0;

        if (capturedStill) {
          capturedFrameCanvas = capturedStill.canvas;
          sourceDimensions = capturedStill.sourceDimensions;
          videoDimensions = capturedStill.videoDimensions;
          captureMethod = capturedStill.method;
        } else {
          // Fallback to best recent high-quality video frame or live video frame
          usedFallback = true;
          const bestCandidate = recentFrameBufferRef.current.getBestFrame();
          if (bestCandidate) {
            capturedFrameCanvas = bestCandidate.canvas;
            sourceDimensions = {
              width: bestCandidate.width,
              height: bestCandidate.height,
            };
            videoDimensions = videoRef.current
              ? {
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight,
                }
              : sourceDimensions;
            initialSharpness = bestCandidate.sharpness;
          } else if (videoRef.current) {
            const fallbackFrame = captureVideoFrame(videoRef.current);
            capturedFrameCanvas = fallbackFrame.canvas;
            sourceDimensions = fallbackFrame.sourceDimensions;
            videoDimensions = {
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            };
          } else {
            throw new Error("No video source available for capture.");
          }
        }

        const { detection, quality, analysisDimensions, displayCorners } =
          liveAnalysisRef.current;
        setIsProcessing(true);
        workflowStateRef.current = "PROCESSING";
        setWorkflowState("PROCESSING");
        stopCamera();

        // For manual capture: if detection is low-confidence or quality unacceptable (e.g. barcode-only),
        // gracefully fall back to full-frame uncropped capture rather than an aggressive bad crop.
        const isReliableDetection =
          detection !== null &&
          detection.confidence >= 0.45 &&
          (quality?.isAcceptable ?? false);

        const targetCorners =
          source === "automatic"
            ? (displayCorners ?? detection?.corners ?? null)
            : isReliableDetection
              ? (displayCorners ?? detection?.corners ?? null)
              : null;

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const procStart = performance.now();
        const result = await processCapturedFrame({
          capturedFrame: {
            canvas: capturedFrameCanvas,
            sourceDimensions,
            videoDimensions,
          },
          analysisCorners: targetCorners,
          analysisDimensions,
        });
        const processingLatencyMs = performance.now() - procStart;

        if (!mountedRef.current || operationId !== operationIdRef.current) {
          return;
        }

        // Record diagnostic metrics
        lastCaptureDiagnosticsRef.current = {
          method: captureMethod,
          sourceDimensions,
          sourceAspectRatio: sourceDimensions.width / sourceDimensions.height,
          captureLatencyMs: capturedStill?.captureLatencyMs ?? 0,
          processingLatencyMs,
          initialSharpness,
          outputDimensions: result.dimensions,
          jpegSizeBytes: result.image.size,
          retried,
          usedFallback,
        };

        controller.completeCapture(performance.now());
        const previewUrl = sessionRef.current.createPreviewUrl(result.image);

        setCurrentCapture({
          blob: result.image,
          previewUrl,
          correctionFallback: result.correctionFailed,
        });
        workflowStateRef.current = "COMPLETE";
        setWorkflowState("COMPLETE");
        setUiMode("page-preview");
      } catch (err) {
        console.error("[CameraScanner] Capture processing error:", err);
        controller.failCapture();
        if (mountedRef.current) {
          setIsProcessingError(true);
          setCaptureFailed(true);
          workflowStateRef.current = "SCANNING";
          setWorkflowState("SCANNING");
        }
      } finally {
        if (capturedFrameCanvas) {
          capturedFrameCanvas.width = 0;
          capturedFrameCanvas.height = 0;
        }
        recentFrameBufferRef.current.releaseAll();
        if (mountedRef.current) {
          setCapturePending(false);
          setIsProcessing(false);
        }
      }
    },
    [
      capturePending,
      clearAutoCaptureTimer,
      getMediaStream,
      isProcessing,
      status,
      stopCamera,
      videoRef,
    ],
  );

  const scheduleAutomaticCapture = useCallback(() => {
    if (workflowStateRef.current !== "SCANNING") {
      return;
    }
    clearAutoCaptureTimer();
    workflowStateRef.current = "CAPTURE_PREPARING";
    setWorkflowState("CAPTURE_PREPARING");
    autoCaptureTimerRef.current = setTimeout(() => {
      autoCaptureTimerRef.current = null;
      void performCapture("automatic");
    }, AUTO_CAPTURE_DELAY_MS);
  }, [clearAutoCaptureTimer, performCapture]);

  const handleProcessedFrame = useCallback(
    ({ frame, detection }: ProcessedDocumentFrame) => {
      const quality = detection ? analyseDocumentQuality(frame, detection) : null;
      const stability = stabilityTrackerRef.current.observe({
        corners: detection?.corners ?? null,
        qualityAcceptable: quality?.isAcceptable ?? false,
        timestamp: frame.timestamp,
      });
      const displayCorners = stability.smoothedCorners ?? detection?.corners ?? null;
      const nextAnalysis = {
        detection,
        quality,
        stability,
        analysisDimensions: { width: frame.width, height: frame.height },
        displayCorners,
      };
      liveAnalysisRef.current = nextAnalysis;
      setLiveAnalysis(nextAnalysis);

      const decision = captureControllerRef.current.observe(
        {
          documentDetected: detection !== null,
          qualityAcceptable: quality?.isAcceptable ?? false,
          stable: stability.isReady,
        },
        frame.timestamp,
      );
      if (decision.shouldCancel) {
        clearAutoCaptureTimer();
        workflowStateRef.current = "SCANNING";
        setWorkflowState((prev) => (prev === "CAPTURE_PREPARING" ? "SCANNING" : prev));
      }
      if (decision.shouldSchedule) {
        scheduleAutomaticCapture();
      }
    },
    [clearAutoCaptureTimer, scheduleAutomaticCapture],
  );

  const processDocumentFrame = useDocumentDetection(
    analysisActive,
    handleProcessedFrame,
  );

  useFrameSampler({
    active: analysisActive,
    videoRef,
    onFrame: processDocumentFrame,
    targetFps,
  });

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    const controller = captureControllerRef.current;
    const stabilityTracker = stabilityTrackerRef.current;
    const recentFrameBuffer = recentFrameBufferRef.current;

    return () => {
      mountedRef.current = false;
      operationIdRef.current += 1;
      clearAutoCaptureTimer();
      controller.reset();
      stabilityTracker.reset();
      recentFrameBuffer.releaseAll();
      if (currentCaptureRef.current?.previewUrl) {
        sessionRef.current.revokePreviewUrl(currentCaptureRef.current.previewUrl);
      }
    };
  }, [clearAutoCaptureTimer]);

  // Reset when analysis becomes inactive
  useEffect(() => {
    if (!analysisActive && !capturePending && uiMode === "camera") {
      clearAutoCaptureTimer();
      captureControllerRef.current.reset();
      stabilityTrackerRef.current.reset();
      recentFrameBufferRef.current.releaseAll();
      liveAnalysisRef.current = INITIAL_LIVE_ANALYSIS;
    }
  }, [analysisActive, capturePending, clearAutoCaptureTimer, uiMode]);

  // Reset for backgrounding
  useEffect(() => {
    const resetForBackgrounding = () => {
      if (!document.hidden) {
        return;
      }
      resetDetectionAndController();
    };

    document.addEventListener("visibilitychange", resetForBackgrounding);
    return () => {
      document.removeEventListener("visibilitychange", resetForBackgrounding);
    };
  }, [resetDetectionAndController]);

  // Actions for Page Preview mode
  const handleAddNextPage = useCallback(() => {
    if (currentCapture) {
      session.addPage({
        imageBlob: currentCapture.blob,
        correctionFallback: currentCapture.correctionFallback,
        previewUrl: currentCapture.previewUrl,
      });
      setCurrentCapture(null);
    }
    resetDetectionAndController();
    setUiMode("camera");
    void startCamera();
  }, [currentCapture, resetDetectionAndController, session, startCamera]);

  const handleGoToReviewFromPreview = useCallback(() => {
    if (currentCapture) {
      session.addPage({
        imageBlob: currentCapture.blob,
        correctionFallback: currentCapture.correctionFallback,
        previewUrl: currentCapture.previewUrl,
      });
      setCurrentCapture(null);
      session.setActivePageIndex(session.pageCount);
    }
    resetDetectionAndController();
    setUiMode("multipage-review");
  }, [currentCapture, resetDetectionAndController, session]);

  const handleSaveReplacement = useCallback(() => {
    if (currentCapture && session.retakeTarget) {
      session.replacePage(session.retakeTarget.pageId, {
        imageBlob: currentCapture.blob,
        correctionFallback: currentCapture.correctionFallback,
        previewUrl: currentCapture.previewUrl,
      });
      setCurrentCapture(null);
      session.setActivePageIndex(session.retakeTarget.index);
    }
    resetDetectionAndController();
    setUiMode("multipage-review");
  }, [currentCapture, resetDetectionAndController, session]);

  const handleRetakeSinglePage = useCallback(() => {
    if (currentCapture) {
      session.revokePreviewUrl(currentCapture.previewUrl);
      setCurrentCapture(null);
    }
    resetDetectionAndController();
    setIsProcessingError(false);
    setUiMode("camera");
    void startCamera();
  }, [currentCapture, resetDetectionAndController, session, startCamera]);

  const handleCancelRetakeFromPreview = useCallback(() => {
    if (currentCapture) {
      session.revokePreviewUrl(currentCapture.previewUrl);
      setCurrentCapture(null);
    }
    session.cancelRetake();
    resetDetectionAndController();
    setUiMode("multipage-review");
  }, [currentCapture, resetDetectionAndController, session]);

  // Actions for Multipage Review mode
  const handleStartRetake = useCallback(
    (pageId: string) => {
      session.startRetake(pageId);
      resetDetectionAndController();
      setUiMode("camera");
      void startCamera();
    },
    [resetDetectionAndController, session, startCamera],
  );

  const handleDeletePage = useCallback(
    (pageId: string) => {
      const isSolePage = session.pageCount <= 1;
      session.deletePage(pageId);
      if (isSolePage) {
        resetDetectionAndController();
        setUiMode("camera");
        void startCamera();
      }
    },
    [resetDetectionAndController, session, startCamera],
  );

  const handleAddPageFromReview = useCallback(() => {
    session.cancelRetake();
    resetDetectionAndController();
    setUiMode("camera");
    void startCamera();
  }, [resetDetectionAndController, session, startCamera]);

  const handleCompleteDocument = useCallback(() => {
    if (session.pages.length === 0) {
      return;
    }
    onComplete?.(session.document);
    if (!suppressDefaultComplete) {
      setUiMode("complete");
    }
  }, [onComplete, session.document, session.pages.length, suppressDefaultComplete]);

  const handleResetDocument = useCallback(() => {
    session.resetDocument();
    resetDetectionAndController();
    setUiMode("camera");
    void startCamera();
  }, [resetDetectionAndController, session, startCamera]);

  const handleCancelRetakeFromCamera = useCallback(() => {
    session.cancelRetake();
    stopCamera();
    resetDetectionAndController();
    setUiMode("multipage-review");
  }, [resetDetectionAndController, session, stopCamera]);

  // 1. Processing Screen
  if (isProcessing) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
        <span className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white motion-reduce:animate-none" />
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">
          Preparing your scan…
        </h1>
        <p className="mt-3 max-w-sm text-base leading-6 text-slate-300">
          Keeping everything on this device.
        </p>
        <button
          type="button"
          onClick={handleRetakeSinglePage}
          className="mt-8 min-h-14 rounded-xl border border-slate-500 px-6 text-base font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          Cancel and retake
        </button>
      </main>
    );
  }

  // 2. Error Screen
  if (isProcessingError) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          We couldn&apos;t prepare that scan
        </h1>
        <p className="mt-3 max-w-sm text-base leading-6 text-slate-300">
          Please try again with the document clearly in view.
        </p>
        <button
          type="button"
          onClick={handleRetakeSinglePage}
          className="mt-8 min-h-14 rounded-xl bg-white px-7 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          Try again
        </button>
      </main>
    );
  }

  // 3. Page Preview Screen (Single Page Check)
  if (uiMode === "page-preview" && currentCapture) {
    return (
      <ScanPreview
        imageUrl={currentCapture.previewUrl}
        pageNumber={targetPageNumber}
        isRetakeMode={isRetakeMode}
        correctionFallback={currentCapture.correctionFallback}
        onAddNextPage={isRetakeMode ? undefined : handleAddNextPage}
        onReview={isRetakeMode ? undefined : handleGoToReviewFromPreview}
        onSaveReplacement={isRetakeMode ? handleSaveReplacement : undefined}
        onRetake={handleRetakeSinglePage}
        onCancel={isRetakeMode ? handleCancelRetakeFromPreview : undefined}
      />
    );
  }

  // 4. Multipage Review Screen
  if (uiMode === "multipage-review" && session.pages.length > 0) {
    return (
      <MultipageReview
        pages={session.pages}
        activeIndex={session.activePageIndex}
        onSelectPage={session.setActivePageIndex}
        onMovePage={session.movePage}
        onRetakePage={handleStartRetake}
        onDeletePage={handleDeletePage}
        onAddPage={handleAddPageFromReview}
        onDone={handleCompleteDocument}
        onCancel={onCancel}
      />
    );
  }

  // 5. Document Complete Screen
  if (uiMode === "complete") {
    return (
      <DocumentComplete
        document={session.document}
        onReset={handleResetDocument}
      />
    );
  }

  // 6. Camera Scanner Mode
  const displayedAnalysis = analysisActive ? liveAnalysis : INITIAL_LIVE_ANALYSIS;
  const scannerState: ScannerState = deriveScannerState({
    detection: displayedAnalysis.detection,
    quality: displayedAnalysis.quality,
    stability: displayedAnalysis.stability,
    capturing: capturePending,
  });

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-white">
      {/* Header with Guidance and Page / Mode Indicators */}
      <header className="relative shrink-0 px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between pb-2">
          <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
            {isRetakeMode
              ? `Retaking Page ${session.retakeTarget?.pageNumber}`
              : `Page ${session.pageCount + 1}`}
          </span>

          <div className="flex items-center gap-2">
            {isRetakeMode ? (
              <button
                type="button"
                onClick={handleCancelRetakeFromCamera}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Cancel retake
              </button>
            ) : session.pageCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setUiMode("multipage-review");
                }}
                className="rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Review ({session.pageCount})
              </button>
            ) : onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        <ScannerGuidance
          scannerState={scannerState}
          qualityGuidance={displayedAnalysis.quality?.guidance ?? null}
          workflowState={workflowState}
        />
      </header>

      {/* Live Camera View with Document Detection Overlay */}
      <ErrorBoundary
        fallbackTitle="Camera unavailable"
        fallbackMessage="We encountered an issue preparing the camera preview. Tap below to retry."
        onReset={() => void startCamera()}
      >
        <CameraPreview
          status={status}
          videoRef={videoRef}
          onStart={() => void startCamera()}
          overlay={
            <DocumentOverlay
              videoRef={videoRef}
              corners={displayedAnalysis.displayCorners ?? null}
              analysisDimensions={displayedAnalysis.analysisDimensions}
              scannerState={scannerState}
            />
          }
        />
      </ErrorBoundary>

      {/* Bottom Manual Capture Button */}
      <footer className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {captureFailed && (
          <p className="mb-3 text-center text-sm text-amber-200" role="alert">
            The photo wasn&apos;t captured. Hold still and try again.
          </p>
        )}
        <button
          type="button"
          onClick={() => void performCapture("manual")}
          disabled={status !== "ready" || capturePending}
          className="min-h-16 w-full rounded-xl bg-white px-6 text-lg font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {capturePending ? "Capturing…" : "Capture"}
        </button>
      </footer>
    </main>
  );
}
