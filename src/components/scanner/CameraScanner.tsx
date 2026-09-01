"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraPreview } from "@/components/scanner/CameraPreview";
import { DocumentOverlay } from "@/components/scanner/DocumentOverlay";
import { ScannerGuidance } from "@/components/scanner/ScannerGuidance";
import { ScanPreview } from "@/components/scanner/ScanPreview";
import { useCamera } from "@/hooks/useCamera";
import {
  useDocumentDetection,
  type ProcessedDocumentFrame,
} from "@/hooks/useDocumentDetection";
import { useFrameSampler } from "@/hooks/useFrameSampler";
import { captureVideoFrame } from "@/lib/camera/camera";
import { CaptureController } from "@/lib/capture/capture-controller";
import { processCapturedFrame } from "@/lib/capture-processing/processing-pipeline";
import type { DocumentDetection } from "@/lib/detection/document-detection";
import {
  analyseDocumentQuality,
  type DocumentQuality,
} from "@/lib/quality/document-quality";
import {
  deriveScannerState,
  type ScannerState,
} from "@/lib/scanner/scanner-state";
import {
  DocumentStabilityTracker,
  type DocumentStability,
} from "@/lib/stability/document-stability";

interface LiveAnalysis {
  readonly detection: DocumentDetection | null;
  readonly quality: DocumentQuality | null;
  readonly stability: DocumentStability | null;
  readonly analysisDimensions: { readonly width: number; readonly height: number } | null;
}

interface ProcessedScan {
  readonly url: string;
  readonly correctionFallback: boolean;
}

type ScanProcessingState = "scanning" | "processing" | "preview" | "error";

const INITIAL_LIVE_ANALYSIS: LiveAnalysis = {
  detection: null,
  quality: null,
  stability: null,
  analysisDimensions: null,
};

const AUTO_CAPTURE_DELAY_MS = 180;

export function CameraScanner() {
  const { status, videoRef, startCamera, stopCamera } = useCamera();
  const [processedScan, setProcessedScan] = useState<ProcessedScan | null>(null);
  const [processingState, setProcessingState] =
    useState<ScanProcessingState>("scanning");
  const [scanAccepted, setScanAccepted] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [liveAnalysis, setLiveAnalysis] =
    useState<LiveAnalysis>(INITIAL_LIVE_ANALYSIS);
  const previewUrlRef = useRef<string | null>(null);
  const liveAnalysisRef = useRef<LiveAnalysis>(INITIAL_LIVE_ANALYSIS);
  const mountedRef = useRef(true);
  const operationIdRef = useRef(0);
  const captureControllerRef = useRef(new CaptureController());
  const stabilityTrackerRef = useRef(new DocumentStabilityTracker());
  const autoCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisActive =
    status === "ready" && processingState === "scanning" && !capturePending;

  const replacePreviewUrl = useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    previewUrlRef.current = nextUrl;
  }, []);

  const clearAutoCaptureTimer = useCallback(() => {
    if (autoCaptureTimerRef.current !== null) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
  }, []);

  const performCapture = useCallback(
    async (source: "automatic" | "manual") => {
      const controller = captureControllerRef.current;
      if (status !== "ready" || !videoRef.current) {
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
      setCapturePending(true);
      setCaptureFailed(false);

      try {
        const capturedFrame = captureVideoFrame(videoRef.current);
        const { detection, analysisDimensions } = liveAnalysisRef.current;
        setProcessingState("processing");
        stopCamera();

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const result = await processCapturedFrame({
          capturedFrame,
          analysisCorners: detection?.corners ?? null,
          analysisDimensions,
        });
        if (!mountedRef.current || operationId !== operationIdRef.current) {
          return;
        }

        controller.completeCapture(performance.now());
        const url = URL.createObjectURL(result.image);
        replacePreviewUrl(url);
        setProcessedScan({
          url,
          correctionFallback: result.correctionFailed,
        });
        setScanAccepted(false);
        setProcessingState("preview");
      } catch {
        controller.failCapture();
        if (mountedRef.current && operationId === operationIdRef.current) {
          setProcessingState("error");
        }
      } finally {
        if (mountedRef.current && operationId === operationIdRef.current) {
          setCapturePending(false);
        }
      }
    },
    [clearAutoCaptureTimer, replacePreviewUrl, status, stopCamera, videoRef],
  );

  const scheduleAutomaticCapture = useCallback(() => {
    clearAutoCaptureTimer();
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
      const nextAnalysis = {
        detection,
        quality,
        stability,
        analysisDimensions: { width: frame.width, height: frame.height },
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
  });

  useEffect(() => {
    mountedRef.current = true;
    const controller = captureControllerRef.current;
    const stabilityTracker = stabilityTrackerRef.current;

    return () => {
      mountedRef.current = false;
      operationIdRef.current += 1;
      clearAutoCaptureTimer();
      controller.reset();
      stabilityTracker.reset();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [clearAutoCaptureTimer]);

  useEffect(() => {
    if (!analysisActive && !capturePending && processingState === "scanning") {
      clearAutoCaptureTimer();
      captureControllerRef.current.reset();
      stabilityTrackerRef.current.reset();
      liveAnalysisRef.current = INITIAL_LIVE_ANALYSIS;
    }
  }, [analysisActive, capturePending, clearAutoCaptureTimer, processingState]);

  useEffect(() => {
    const resetForBackgrounding = () => {
      if (!document.hidden) {
        return;
      }

      clearAutoCaptureTimer();
      captureControllerRef.current.reset();
      stabilityTrackerRef.current.reset();
      liveAnalysisRef.current = INITIAL_LIVE_ANALYSIS;
      setLiveAnalysis(INITIAL_LIVE_ANALYSIS);
    };

    document.addEventListener("visibilitychange", resetForBackgrounding);
    return () => {
      document.removeEventListener("visibilitychange", resetForBackgrounding);
    };
  }, [clearAutoCaptureTimer]);

  const handleRetake = useCallback(() => {
    operationIdRef.current += 1;
    clearAutoCaptureTimer();
    captureControllerRef.current.reset();
    stabilityTrackerRef.current.reset();
    liveAnalysisRef.current = INITIAL_LIVE_ANALYSIS;
    setLiveAnalysis(INITIAL_LIVE_ANALYSIS);
    setProcessedScan(null);
    setProcessingState("scanning");
    setScanAccepted(false);
    setCapturePending(false);
    setCaptureFailed(false);
    replacePreviewUrl(null);
    void startCamera();
  }, [clearAutoCaptureTimer, replacePreviewUrl, startCamera]);

  const displayedAnalysis = analysisActive ? liveAnalysis : INITIAL_LIVE_ANALYSIS;
  const scannerState: ScannerState = processedScan
    ? "preview"
    : deriveScannerState({
        detection: displayedAnalysis.detection,
        quality: displayedAnalysis.quality,
        stability: displayedAnalysis.stability,
        capturing: capturePending,
      });

  if (processedScan && processingState === "preview") {
    return (
      <ScanPreview
        imageUrl={processedScan.url}
        onRetake={handleRetake}
        onAccept={() => setScanAccepted(true)}
        accepted={scanAccepted}
        correctionFallback={processedScan.correctionFallback}
      />
    );
  }

  if (processingState === "processing") {
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
          onClick={handleRetake}
          className="mt-8 min-h-14 rounded-xl border border-slate-500 px-6 text-base font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          Cancel and retake
        </button>
      </main>
    );
  }

  if (processingState === "error") {
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
          onClick={handleRetake}
          className="mt-8 min-h-14 rounded-xl bg-white px-7 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-white">
      <header className="shrink-0 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <ScannerGuidance
          scannerState={scannerState}
          qualityGuidance={displayedAnalysis.quality?.guidance ?? null}
        />
      </header>

      <CameraPreview
        status={status}
        videoRef={videoRef}
        onStart={() => void startCamera()}
        overlay={
          <DocumentOverlay
            videoRef={videoRef}
            corners={displayedAnalysis.detection?.corners ?? null}
            analysisDimensions={displayedAnalysis.analysisDimensions}
            scannerState={scannerState}
          />
        }
      />

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
