import type { CameraStatus } from "@/types/camera";

export const MAX_CAPTURE_CANVAS_DIMENSION = 2560;
export const MAX_STILL_CAPTURE_CANVAS_DIMENSION = 4096;

export const PREFERRED_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 4032, min: 1280 },
    height: { ideal: 3024, min: 720 },
    aspectRatio: { ideal: 4 / 3 },
  },
};

export const RELAXED_HIGH_RES_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 3840 },
    height: { ideal: 2160 },
    aspectRatio: { ideal: 4 / 3 },
  },
};

export const STANDARD_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

export const FALLBACK_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: true,
};

export function getVideoTrackSettings(
  stream: MediaStream,
): MediaTrackSettings | null {
  const [videoTrack] = stream.getVideoTracks();
  return videoTrack ? videoTrack.getSettings() : null;
}

export interface CameraTrackDiagnostics {
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: number;
  readonly frameRate?: number;
  readonly facingMode?: string;
  readonly focusMode?: string;
  readonly supportedFocusModes?: readonly string[];
  readonly capabilities?: MediaTrackCapabilities;
}

export function getCameraTrackDiagnostics(
  stream: MediaStream,
): CameraTrackDiagnostics | null {
  const [videoTrack] = stream.getVideoTracks();
  if (!videoTrack) {
    return null;
  }
  const settings = videoTrack.getSettings();
  const capabilities =
    typeof videoTrack.getCapabilities === "function"
      ? (videoTrack.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
        })
      : undefined;

  return {
    width: settings.width,
    height: settings.height,
    aspectRatio: settings.aspectRatio ?? (settings.width && settings.height ? settings.width / settings.height : undefined),
    frameRate: settings.frameRate,
    facingMode: settings.facingMode,
    focusMode: (settings as { focusMode?: string }).focusMode,
    supportedFocusModes: capabilities?.focusMode,
    capabilities,
  };
}

export async function applyOptimalCameraTrackSettings(
  track: MediaStreamTrack,
): Promise<void> {
  if (typeof track.getCapabilities !== "function") {
    return;
  }

  try {
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
    };
    const advanced: Record<string, unknown>[] = [];

    if (
      Array.isArray(capabilities.focusMode) &&
      capabilities.focusMode.includes("continuous")
    ) {
      advanced.push({ focusMode: "continuous" });
    }

    if (advanced.length > 0) {
      await track.applyConstraints({ advanced });
    }
  } catch {
    // Non-fatal: graceful fallback if browser/driver doesn't allow setting focusMode
  }
}

function isOverconstrainedError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  return [
    "NotFoundError",
    "OverconstrainedError",
    "ConstraintNotSatisfiedError",
  ].includes(error.name);
}

export function isCameraSupported(): boolean {
  return Boolean(
    typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function",
  );
}

export async function requestCameraStream(): Promise<MediaStream> {
  // Tier 1: Preferred 4:3 high-resolution with minimum bounds
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      PREFERRED_CAMERA_CONSTRAINTS,
    );
    const [track] = stream.getVideoTracks();
    if (track) {
      await applyOptimalCameraTrackSettings(track);
    }
    return stream;
  } catch (err1) {
    if (!isOverconstrainedError(err1)) {
      throw err1;
    }
  }

  // Tier 2: Relaxed high-resolution without strict minimum bounds
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      RELAXED_HIGH_RES_CONSTRAINTS,
    );
    const [track] = stream.getVideoTracks();
    if (track) {
      await applyOptimalCameraTrackSettings(track);
    }
    return stream;
  } catch (err2) {
    if (!isOverconstrainedError(err2)) {
      throw err2;
    }
  }

  // Tier 3: Standard 1080p environment camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      STANDARD_CAMERA_CONSTRAINTS,
    );
    const [track] = stream.getVideoTracks();
    if (track) {
      await applyOptimalCameraTrackSettings(track);
    }
    return stream;
  } catch (err3) {
    if (!isOverconstrainedError(err3)) {
      throw err3;
    }
  }

  // Tier 4: Basic video fallback
  return navigator.mediaDevices.getUserMedia(FALLBACK_CAMERA_CONSTRAINTS);
}

export function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export function getCameraErrorStatus(error: unknown): CameraStatus {
  if (!(error instanceof DOMException)) {
    return "error";
  }

  if (["NotAllowedError", "SecurityError"].includes(error.name)) {
    return "permission-denied";
  }

  if (
    [
      "NotFoundError",
      "DevicesNotFoundError",
      "OverconstrainedError",
      "ConstraintNotSatisfiedError",
    ].includes(error.name)
  ) {
    return "no-camera";
  }

  return "error";
}

export function calculateSafeCaptureDimensions(
  videoWidth: number,
  videoHeight: number,
  maxDimension: number = MAX_CAPTURE_CANVAS_DIMENSION,
): { readonly width: number; readonly height: number } {
  const maxEdge = Math.max(videoWidth, videoHeight);
  if (maxEdge <= maxDimension) {
    return { width: videoWidth, height: videoHeight };
  }
  const scale = maxDimension / maxEdge;
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

export function releaseCanvasMemory(
  canvas: HTMLCanvasElement | null | undefined,
): void {
  if (!canvas) {
    return;
  }
  canvas.width = 0;
  canvas.height = 0;
}

export interface CapturedVideoFrame {
  readonly canvas: HTMLCanvasElement;
  readonly sourceDimensions: { readonly width: number; readonly height: number };
}

export function captureVideoFrame(
  video: HTMLVideoElement,
): CapturedVideoFrame {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("The camera frame is not ready.");
  }

  const { width, height } = calculateSafeCaptureDimensions(
    video.videoWidth,
    video.videoHeight,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available.");
  }

  context.drawImage(video, 0, 0, width, height);

  return {
    canvas,
    sourceDimensions: { width, height },
  };
}

export interface CapturedStillPhoto {
  readonly canvas: HTMLCanvasElement;
  readonly sourceDimensions: { readonly width: number; readonly height: number };
  readonly method: "image-capture" | "video-frame";
  readonly photoBlob?: Blob;
  readonly photoBlobDimensions?: { readonly width: number; readonly height: number };
  readonly videoDimensions?: { readonly width: number; readonly height: number };
  readonly captureLatencyMs: number;
}

export function isImageCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture ===
      "function"
  );
}

/**
 * High-quality still capture using ImageCapture.takePhoto() when supported,
 * with graceful fallback to video frame (e.g. on Safari/iOS or when takePhoto fails/times out).
 * Includes timeout safeguard and immediate resource disposal.
 */
export async function captureStillPhoto(
  stream: MediaStream,
  video: HTMLVideoElement,
  options: { readonly timeoutMs?: number } = {},
): Promise<CapturedStillPhoto> {
  const startTime = performance.now();
  const videoDimensions = {
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
  };
  const timeoutMs = options.timeoutMs ?? 2500;

  if (isImageCaptureSupported()) {
    try {
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack && videoTrack.readyState === "live") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imageCapture = new (window as any).ImageCapture(videoTrack);

        // Race takePhoto against timeout
        const blobPromise: Promise<Blob> = imageCapture.takePhoto();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("ImageCapture timeout")), timeoutMs),
        );

        const blob = await Promise.race([blobPromise, timeoutPromise]);

        let photoWidth = 0;
        let photoHeight = 0;
        let imgSource: CanvasImageSource | null = null;
        let closeBitmap: (() => void) | null = null;

        if (typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(blob);
          photoWidth = bitmap.width;
          photoHeight = bitmap.height;
          imgSource = bitmap;
          closeBitmap = () => bitmap.close();
        } else if (typeof Image !== "undefined" && typeof URL !== "undefined") {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            const url = URL.createObjectURL(blob);
            el.onload = () => {
              URL.revokeObjectURL(url);
              resolve(el);
            };
            el.onerror = (err) => {
              URL.revokeObjectURL(url);
              reject(err);
            };
            el.src = url;
          });
          photoWidth = img.naturalWidth;
          photoHeight = img.naturalHeight;
          imgSource = img;
        }

        if (imgSource && photoWidth > 0 && photoHeight > 0) {
          const { width, height } = calculateSafeCaptureDimensions(
            photoWidth,
            photoHeight,
            MAX_STILL_CAPTURE_CANVAS_DIMENSION,
          );
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (context) {
            context.drawImage(imgSource, 0, 0, width, height);
            if (closeBitmap) {
              closeBitmap();
            }
            return {
              canvas,
              sourceDimensions: { width, height },
              method: "image-capture",
              photoBlob: blob,
              photoBlobDimensions: { width: photoWidth, height: photoHeight },
              videoDimensions,
              captureLatencyMs: performance.now() - startTime,
            };
          }
        }

        if (closeBitmap) {
          closeBitmap();
        }
      }
    } catch {
      // Graceful fallback if takePhoto is not supported by camera driver or times out
    }
  }

  const frame = captureVideoFrame(video);
  return {
    canvas: frame.canvas,
    sourceDimensions: frame.sourceDimensions,
    method: "video-frame",
    videoDimensions,
    captureLatencyMs: performance.now() - startTime,
  };
}
