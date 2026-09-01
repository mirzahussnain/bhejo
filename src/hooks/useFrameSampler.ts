"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  createFrameSampler,
  type AnalysisFrame,
  type FrameSamplerConfig,
  type FrameSamplerDiagnostics,
} from "@/lib/camera/frame-sampler";

declare global {
  interface Window {
    __bhejoFrameSamplerDiagnostics?: () => FrameSamplerDiagnostics;
  }
}

interface UseFrameSamplerOptions {
  readonly active: boolean;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly onFrame?: (frame: AnalysisFrame) => void;
  readonly config?: Partial<FrameSamplerConfig>;
}

const ignoreFrame = () => undefined;

export function useFrameSampler({
  active,
  videoRef,
  onFrame = ignoreFrame,
  config,
}: UseFrameSamplerOptions) {
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!active || !videoRef.current) {
      return;
    }

    const sampler = createFrameSampler(
      videoRef.current,
      (frame) => onFrameRef.current(frame),
      config,
    );

    const syncWithPageVisibility = () => {
      if (document.hidden) {
        sampler.stop();
      } else {
        sampler.start();
      }
    };

    document.addEventListener("visibilitychange", syncWithPageVisibility);
    syncWithPageVisibility();

    if (process.env.NODE_ENV === "development") {
      window.__bhejoFrameSamplerDiagnostics = sampler.getDiagnostics;
    }

    return () => {
      document.removeEventListener("visibilitychange", syncWithPageVisibility);
      sampler.stop();

      if (
        process.env.NODE_ENV === "development" &&
        window.__bhejoFrameSamplerDiagnostics === sampler.getDiagnostics
      ) {
        delete window.__bhejoFrameSamplerDiagnostics;
      }
    };
  }, [active, config, videoRef]);
}
