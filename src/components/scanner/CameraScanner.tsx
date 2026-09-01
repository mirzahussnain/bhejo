"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraPreview } from "@/components/scanner/CameraPreview";
import { ScannerGuidance } from "@/components/scanner/ScannerGuidance";
import { ScanPreview } from "@/components/scanner/ScanPreview";
import { useCamera } from "@/hooks/useCamera";
import { useDocumentDetection } from "@/hooks/useDocumentDetection";
import { useFrameSampler } from "@/hooks/useFrameSampler";
import { captureVideoFrame } from "@/lib/camera/camera";

export function CameraScanner() {
  const { status, videoRef, startCamera, stopCamera } = useCamera();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturePending, setCapturePending] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const restartOnLiveViewRef = useRef(false);
  const analysisActive = status === "ready" && !previewUrl && !capturePending;
  const processDocumentFrame = useDocumentDetection(analysisActive);

  useFrameSampler({
    active: analysisActive,
    videoRef,
    onFrame: processDocumentFrame,
  });

  const replacePreviewUrl = useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!previewUrl && restartOnLiveViewRef.current) {
      restartOnLiveViewRef.current = false;
      void startCamera();
    }
  }, [previewUrl, startCamera]);

  const handleCapture = async () => {
    if (capturePending || status !== "ready" || !videoRef.current) {
      return;
    }

    setCapturePending(true);
    setCaptureFailed(false);

    try {
      const image = await captureVideoFrame(videoRef.current);
      if (!mountedRef.current) {
        return;
      }

      replacePreviewUrl(URL.createObjectURL(image));
      stopCamera();
    } catch {
      if (mountedRef.current) {
        setCaptureFailed(true);
      }
    } finally {
      if (mountedRef.current) {
        setCapturePending(false);
      }
    }
  };

  const handleRetake = () => {
    restartOnLiveViewRef.current = true;
    replacePreviewUrl(null);
    setCaptureFailed(false);
  };

  if (previewUrl) {
    return <ScanPreview imageUrl={previewUrl} onRetake={handleRetake} />;
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-white">
      <header className="shrink-0 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <ScannerGuidance />
      </header>

      <CameraPreview
        status={status}
        videoRef={videoRef}
        onStart={() => void startCamera()}
      />

      <footer className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {captureFailed && (
          <p className="mb-3 text-center text-sm text-amber-200" role="alert">
            The photo wasn&apos;t captured. Hold still and try again.
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleCapture()}
          disabled={status !== "ready" || capturePending}
          className="min-h-16 w-full rounded-xl bg-white px-6 text-lg font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {capturePending ? "Capturing…" : "Capture"}
        </button>
      </footer>
    </main>
  );
}
