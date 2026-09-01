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

const INITIAL_LIVE_ANALYSIS: LiveAnalysis = {
  detection: null,
  quality: null,
  stability: null,
  analysisDimensions: null,
};

const AUTO_CAPTURE_DELAY_MS = 180;

export function CameraScanner() {
  const { status, videoRef, startCamera, stopCamera } = useCamera();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturePending, setCapturePending] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [liveAnalysis, setLiveAnalysis] =
    useState<LiveAnalysis>(INITIAL_LIVE_ANALYSIS);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const restartOnLiveViewRef = useRef(false);
  const captureControllerRef = useRef(new CaptureController());
  const stabilityTrackerRef = useRef(new DocumentStabilityTracker());
  const autoCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisActive = status === "ready" && !previewUrl && !capturePending;

  const replacePreviewUrl = useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
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

      clearAutoCaptureTimer();
      setCapturePending(true);
      setCaptureFailed(false);

      try {
        const image = await captureVideoFrame(videoRef.current);
        if (!mountedRef.current) {
          return;
        }

        controller.completeCapture(performance.now());
        replacePreviewUrl(URL.createObjectURL(image));
        stopCamera();
      } catch {
        controller.failCapture();
        if (mountedRef.current) {
          setCaptureFailed(true);
        }
      } finally {
        if (mountedRef.current) {
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
      setLiveAnalysis({
        detection,
        quality,
        stability,
        analysisDimensions: { width: frame.width, height: frame.height },
      });

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
      clearAutoCaptureTimer();
      controller.reset();
      stabilityTracker.reset();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, [clearAutoCaptureTimer]);

  useEffect(() => {
    if (!analysisActive && !capturePending && !previewUrl) {
      clearAutoCaptureTimer();
      captureControllerRef.current.reset();
      stabilityTrackerRef.current.reset();
    }
  }, [analysisActive, capturePending, clearAutoCaptureTimer, previewUrl]);

  useEffect(() => {
    const resetForBackgrounding = () => {
      if (!document.hidden) {
        return;
      }

      clearAutoCaptureTimer();
      captureControllerRef.current.reset();
      stabilityTrackerRef.current.reset();
      setLiveAnalysis(INITIAL_LIVE_ANALYSIS);
    };

    document.addEventListener("visibilitychange", resetForBackgrounding);
    return () => {
      document.removeEventListener("visibilitychange", resetForBackgrounding);
    };
  }, [clearAutoCaptureTimer]);

  useEffect(() => {
    if (!previewUrl && restartOnLiveViewRef.current) {
      restartOnLiveViewRef.current = false;
      void startCamera();
    }
  }, [previewUrl, startCamera]);

  const handleRetake = () => {
    clearAutoCaptureTimer();
    captureControllerRef.current.reset();
    stabilityTrackerRef.current.reset();
    restartOnLiveViewRef.current = true;
    replacePreviewUrl(null);
    setCaptureFailed(false);
  };

  const displayedAnalysis = analysisActive ? liveAnalysis : INITIAL_LIVE_ANALYSIS;
  const scannerState: ScannerState = previewUrl
    ? "preview"
    : deriveScannerState({
        detection: displayedAnalysis.detection,
        quality: displayedAnalysis.quality,
        stability: displayedAnalysis.stability,
        capturing: capturePending,
      });

  if (previewUrl) {
    return <ScanPreview imageUrl={previewUrl} onRetake={handleRetake} />;
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
