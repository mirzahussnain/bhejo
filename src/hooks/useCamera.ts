"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCameraErrorStatus,
  isCameraSupported,
  requestCameraStream,
  stopMediaStream,
} from "@/lib/camera/camera";
import type { CameraStatus } from "@/types/camera";

export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>("initial");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackCleanupRef = useRef<(() => void) | null>(null);
  const requestIdRef = useRef(0);
  const requestPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const resumeWhenVisibleRef = useRef(false);

  const releaseCamera = useCallback((nextStatus?: CameraStatus) => {
    requestIdRef.current += 1;
    requestPendingRef.current = false;
    trackCleanupRef.current?.();
    trackCleanupRef.current = null;

    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (nextStatus && mountedRef.current) {
      setStatus(nextStatus);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (requestPendingRef.current || streamRef.current) {
      return;
    }

    if (!isCameraSupported()) {
      setStatus("unsupported");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestPendingRef.current = true;
    setStatus("requesting");

    try {
      const stream = await requestCameraStream();

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        stopMediaStream(stream);
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error("The camera preview is unavailable.");
      }

      const handleTrackEnded = () => {
        if (streamRef.current === stream) {
          releaseCamera("error");
        }
      };

      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", handleTrackEnded);
      });
      trackCleanupRef.current = () => {
        stream.getTracks().forEach((track) => {
          track.removeEventListener("ended", handleTrackEnded);
        });
      };

      video.srcObject = stream;
      await video.play();

      if (mountedRef.current && requestId === requestIdRef.current) {
        setStatus("ready");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      releaseCamera();
      if (mountedRef.current) {
        setStatus(getCameraErrorStatus(error));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        requestPendingRef.current = false;
      }
    }
  }, [releaseCamera]);

  const stopCamera = useCallback(() => {
    resumeWhenVisibleRef.current = false;
    releaseCamera("initial");
  }, [releaseCamera]);

  useEffect(() => {
    mountedRef.current = true;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const shouldResume = Boolean(
          streamRef.current || requestPendingRef.current,
        );
        resumeWhenVisibleRef.current = shouldResume;

        if (shouldResume) {
          releaseCamera("initial");
        }
        return;
      }

      if (resumeWhenVisibleRef.current) {
        resumeWhenVisibleRef.current = false;
        void startCamera();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseCamera();
    };
  }, [releaseCamera, startCamera]);

  return {
    status,
    videoRef,
    startCamera,
    stopCamera,
  };
}
