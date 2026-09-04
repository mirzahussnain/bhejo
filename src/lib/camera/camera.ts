import type { CameraStatus } from "@/types/camera";

const preferredCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

export function getVideoTrackSettings(
  stream: MediaStream,
): MediaTrackSettings | null {
  const [videoTrack] = stream.getVideoTracks();
  return videoTrack ? videoTrack.getSettings() : null;
}

const fallbackCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: true,
};

function canRetryWithoutFacingMode(error: unknown) {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return [
    "NotFoundError",
    "OverconstrainedError",
    "ConstraintNotSatisfiedError",
  ].includes(error.name);
}

export function isCameraSupported() {
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function",
  );
}

export async function requestCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia(
      preferredCameraConstraints,
    );
  } catch (error) {
    if (!canRetryWithoutFacingMode(error)) {
      throw error;
    }

    return navigator.mediaDevices.getUserMedia(fallbackCameraConstraints);
  }
}

export function stopMediaStream(stream: MediaStream) {
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

export const MAX_CAPTURE_CANVAS_DIMENSION = 2560;

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
