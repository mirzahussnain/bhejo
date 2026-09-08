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
  readonly targetFps?: number;
}

const ignoreFrame = () => undefined;

export function useFrameSampler({
  active,
  videoRef,
  onFrame = ignoreFrame,
  config,
  targetFps,
}: UseFrameSamplerOptions) {
  const onFrameRef = useRef(onFrame);
  const samplerRef = useRef<ReturnType<typeof createFrameSampler> | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (samplerRef.current && targetFps !== undefined) {
      samplerRef.current.setAnalysisFps(targetFps);
    }
  }, [targetFps]);

  useEffect(() => {
    if (!active || !videoRef.current) {
      return;
    }

    const sampler = createFrameSampler(
      videoRef.current,
      (frame) => onFrameRef.current(frame),
      config,
    );
    samplerRef.current = sampler;

    if (targetFps !== undefined) {
      sampler.setAnalysisFps(targetFps);
    }

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
      samplerRef.current = null;

      if (
        process.env.NODE_ENV === "development" &&
        window.__bhejoFrameSamplerDiagnostics === sampler.getDiagnostics
      ) {
        delete window.__bhejoFrameSamplerDiagnostics;
      }
    };
  }, [active, config, targetFps, videoRef]);
}
