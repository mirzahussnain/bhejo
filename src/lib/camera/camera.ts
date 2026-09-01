import type { CameraStatus } from "@/types/camera";

const preferredCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
  },
};

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

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available.");
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return {
    canvas,
    sourceDimensions: { width: video.videoWidth, height: video.videoHeight },
  };
}
