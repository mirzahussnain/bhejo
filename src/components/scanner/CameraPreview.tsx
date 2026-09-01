import type { RefObject } from "react";
import type { CameraStatus } from "@/types/camera";

const cameraMessages: Record<
  Exclude<CameraStatus, "ready">,
  { title: string; detail: string; action?: string }
> = {
  initial: {
    title: "Ready to scan?",
    detail: "Allow camera access, then hold your phone over the document.",
    action: "Allow camera",
  },
  requesting: {
    title: "Starting camera…",
    detail: "Your browser may ask for camera permission.",
  },
  "permission-denied": {
    title: "Camera access is blocked",
    detail:
      "Allow camera access in your browser settings, then come back and try again.",
    action: "Try again",
  },
  unsupported: {
    title: "Camera not supported",
    detail: "Open this link in a recent version of Chrome or Safari.",
  },
  "no-camera": {
    title: "No camera found",
    detail: "Check that this device has an available camera, then try again.",
    action: "Try again",
  },
  error: {
    title: "Camera couldn’t start",
    detail:
      "Close other apps using the camera, check browser permission, and try again.",
    action: "Try again",
  },
};

interface CameraPreviewProps {
  status: CameraStatus;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStart: () => void;
}

export function CameraPreview({
  status,
  videoRef,
  onStart,
}: CameraPreviewProps) {
  const cameraReady = status === "ready";
  const message = cameraReady ? null : cameraMessages[status];

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-900">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label="Live camera preview"
        className={`h-full w-full object-cover ${cameraReady ? "block" : "invisible"}`}
      />

      {cameraReady ? (
        <div className="pointer-events-none absolute inset-[8%] rounded-2xl border-2 border-white/80 shadow-[0_2px_18px_rgba(0,0,0,0.28)]" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div
            className="max-w-sm text-center text-white"
            role={status === "requesting" ? "status" : "alert"}
            aria-live="polite"
          >
            {status === "requesting" && (
              <span className="mx-auto mb-5 block size-9 animate-spin rounded-full border-4 border-white/30 border-t-white motion-reduce:animate-none" />
            )}
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">
              {message?.title}
            </h2>
            <p className="mt-3 text-base leading-6 text-slate-200">
              {message?.detail}
            </p>
            {message?.action && (
              <button
                type="button"
                onClick={onStart}
                className="mt-7 min-h-14 rounded-xl bg-white px-7 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-wait disabled:opacity-60"
              >
                {message.action}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

