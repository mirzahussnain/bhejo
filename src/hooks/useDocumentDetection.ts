"use client";

import { useCallback, useEffect, useRef } from "react";
import type { OpenCV } from "@opencvjs/web";
import type { AnalysisFrame } from "@/lib/camera/frame-sampler";
import {
  runDocumentDetection,
  type DocumentDetection,
  type DocumentCandidateStrategy,
} from "@/lib/detection/document-detection";
import { loadOpenCv } from "@/lib/detection/opencv-loader";

type DocumentDetectorStatus = "idle" | "loading" | "ready" | "error";

export interface DocumentDetectionDiagnostics {
  readonly status: DocumentDetectorStatus;
  readonly documentDetected: boolean;
  readonly confidence: number | null;
  readonly areaRatio: number | null;
  readonly processingDurationMs: number | null;
  readonly corners: DocumentDetection["corners"] | null;
  readonly contourCount: number | null;
  readonly quadrilateralCount: number | null;
  readonly candidateStrategy: DocumentCandidateStrategy | null;
  readonly lastError: "initialization-failed" | "processing-failed" | null;
  readonly processedFrameCount: number;
  readonly skippedFrameCount: number;
}

export interface ProcessedDocumentFrame {
  readonly frame: AnalysisFrame;
  readonly detection: DocumentDetection | null;
}

declare global {
  interface Window {
    __bhejoDocumentDetectionDiagnostics?: () => DocumentDetectionDiagnostics;
  }
}

const INITIAL_DIAGNOSTICS: DocumentDetectionDiagnostics = {
  status: "idle",
  documentDetected: false,
  confidence: null,
  areaRatio: null,
  processingDurationMs: null,
  corners: null,
  contourCount: null,
  quadrilateralCount: null,
  candidateStrategy: null,
  lastError: null,
  processedFrameCount: 0,
  skippedFrameCount: 0,
};

export function useDocumentDetection(
  active: boolean,
  onProcessedFrame?: (result: ProcessedDocumentFrame) => void,
) {
  const activeRef = useRef(active);
  const cvRef = useRef<typeof OpenCV | null>(null);
  const processingRef = useRef(false);
  const onProcessedFrameRef = useRef(onProcessedFrame);
  const diagnosticsRef = useRef<DocumentDetectionDiagnostics>({
    ...INITIAL_DIAGNOSTICS,
  });

  useEffect(() => {
    activeRef.current = active;

    if (!active) {
      diagnosticsRef.current = {
        ...diagnosticsRef.current,
        status: "idle",
        documentDetected: false,
        confidence: null,
        areaRatio: null,
        corners: null,
      };
      return;
    }

    let cancelled = false;
    diagnosticsRef.current = {
      ...diagnosticsRef.current,
      status: cvRef.current ? "ready" : "loading",
    };

    if (!cvRef.current) {
      void loadOpenCv()
        .then((cv) => {
          if (!cancelled && activeRef.current) {
            cvRef.current = cv;
            diagnosticsRef.current = {
              ...diagnosticsRef.current,
              status: "ready",
            };
          }
        })
        .catch(() => {
          if (!cancelled && activeRef.current) {
            diagnosticsRef.current = {
              ...diagnosticsRef.current,
              status: "error",
              documentDetected: false,
              confidence: null,
              areaRatio: null,
              corners: null,
              candidateStrategy: null,
              lastError: "initialization-failed",
            };
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    onProcessedFrameRef.current = onProcessedFrame;
  }, [onProcessedFrame]);

  const processFrame = useCallback((frame: AnalysisFrame) => {
    const cv = cvRef.current;
    if (!activeRef.current || !cv) {
      return;
    }

    if (processingRef.current) {
      diagnosticsRef.current = {
        ...diagnosticsRef.current,
        skippedFrameCount: diagnosticsRef.current.skippedFrameCount + 1,
      };
      return;
    }

    processingRef.current = true;
    const startedAt = performance.now();

    try {
      const result = runDocumentDetection(cv, frame);
      const { detection } = result;
      diagnosticsRef.current = {
        status: "ready",
        documentDetected: detection !== null,
        confidence: detection?.confidence ?? null,
        areaRatio: detection?.areaRatio ?? null,
        processingDurationMs: performance.now() - startedAt,
        corners: detection?.corners ?? null,
        contourCount: result.contourCount,
        quadrilateralCount: result.quadrilateralCount,
        candidateStrategy: result.strategy,
        lastError: null,
        processedFrameCount:
          diagnosticsRef.current.processedFrameCount + 1,
        skippedFrameCount: diagnosticsRef.current.skippedFrameCount,
      };
      onProcessedFrameRef.current?.({ frame, detection });
    } catch {
      diagnosticsRef.current = {
        ...diagnosticsRef.current,
        status: "error",
        documentDetected: false,
        confidence: null,
        areaRatio: null,
        processingDurationMs: performance.now() - startedAt,
        corners: null,
        contourCount: null,
        quadrilateralCount: null,
        candidateStrategy: null,
        lastError: "processing-failed",
      };
    } finally {
      processingRef.current = false;
    }
  }, []);

  const getDiagnostics = useCallback(
    (): DocumentDetectionDiagnostics => diagnosticsRef.current,
    [],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    window.__bhejoDocumentDetectionDiagnostics = getDiagnostics;

    return () => {
      if (window.__bhejoDocumentDetectionDiagnostics === getDiagnostics) {
        delete window.__bhejoDocumentDetectionDiagnostics;
      }
    };
  }, [getDiagnostics]);

  return processFrame;
}
