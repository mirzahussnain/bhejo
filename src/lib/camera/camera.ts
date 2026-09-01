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

export function captureVideoFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) {
    return Promise.reject(new Error("The camera frame is not ready."));
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("Canvas is not available."));
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("The camera frame could not be captured."));
      },
      "image/jpeg",
      0.92,
    );
  });
}

