import type { DocumentCorners } from "../detection/geometry.ts";
import { loadOpenCv } from "../detection/opencv-loader.ts";
import {
  createFullFrameCoordinateMapping,
  mapAnalysisCornersToCapture,
  type FrameDimensions,
} from "./coordinate-mapping.ts";
import {
  enhanceCanvasWithOpenCv,
  enhanceCanvas,
  resolveEnhancementConfig,
  type ScanEnhancementConfig,
  type ScanQualityProfile,
} from "./enhancement.ts";
import {
  DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
  warpPerspectiveToCanvas,
  type PerspectiveOutputDimensions,
  type PerspectiveTransformConfig,
} from "./perspective-transform.ts";

export const DEFAULT_JPEG_QUALITY = 0.94;

export interface CapturedFrame {
  readonly canvas: HTMLCanvasElement;
  readonly sourceDimensions: FrameDimensions;
}

export interface ProcessingPipelineOptions {
  readonly profile?: ScanQualityProfile;
  readonly enhancementConfig?: Partial<ScanEnhancementConfig>;
  readonly perspectiveConfig?: Partial<PerspectiveTransformConfig>;
  readonly jpegQuality?: number;
}

export interface CaptureProcessingInput extends ProcessingPipelineOptions {
  readonly capturedFrame: CapturedFrame;
  readonly analysisCorners: DocumentCorners | null;
  readonly analysisDimensions: FrameDimensions | null;
}

export interface CaptureProcessingResult {
  readonly image: Blob;
  readonly dimensions: PerspectiveOutputDimensions;
  readonly usedFallback: boolean;
  readonly correctionFailed: boolean;
  readonly enhancementFailed: boolean;
  readonly durationMs: number;
}

export function resolveJpegQuality(quality?: number): number {
  if (typeof quality !== "number" || !Number.isFinite(quality)) {
    return DEFAULT_JPEG_QUALITY;
  }
  return Math.max(0.1, Math.min(1.0, quality));
}

export function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number = DEFAULT_JPEG_QUALITY,
): Promise<Blob> {
  const resolvedQuality = resolveJpegQuality(quality);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("The scan could not be prepared."));
      },
      "image/jpeg",
      resolvedQuality,
    );
  });
}

function getFallbackDimensions(frame: CapturedFrame): PerspectiveOutputDimensions {
  return {
    width: frame.canvas.width,
    height: frame.canvas.height,
  };
}

export async function processCapturedFrame(
  input: CaptureProcessingInput,
): Promise<CaptureProcessingResult> {
  const startedAt = performance.now();
  const {
    capturedFrame,
    analysisCorners,
    analysisDimensions,
    profile = "photo-document",
    enhancementConfig,
    perspectiveConfig,
    jpegQuality = DEFAULT_JPEG_QUALITY,
  } = input;

  const resolvedEnhancement = resolveEnhancementConfig(
    { profile, ...enhancementConfig },
    profile,
  );
  const resolvedPerspective: PerspectiveTransformConfig = {
    ...DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
    ...perspectiveConfig,
  };
  const resolvedQuality = resolveJpegQuality(jpegQuality);

  if (!analysisCorners || !analysisDimensions) {
    return {
      image: await canvasToJpeg(capturedFrame.canvas, resolvedQuality),
      dimensions: getFallbackDimensions(capturedFrame),
      usedFallback: true,
      correctionFailed: true,
      enhancementFailed: false,
      durationMs: performance.now() - startedAt,
    };
  }

  try {
    const mapping = createFullFrameCoordinateMapping(
      analysisDimensions,
      capturedFrame.sourceDimensions,
      getFallbackDimensions(capturedFrame),
    );
    const captureCorners = mapAnalysisCornersToCapture(analysisCorners, mapping);
    if (!captureCorners) {
      throw new Error("The detected document position is not usable.");
    }

    const outputCanvas = document.createElement("canvas");
    const cv = await loadOpenCv();
    const dimensions = warpPerspectiveToCanvas(
      cv,
      capturedFrame.canvas,
      captureCorners,
      outputCanvas,
      resolvedPerspective,
    );

    let enhancementFailed = false;
    try {
      enhanceCanvasWithOpenCv(cv, outputCanvas, resolvedEnhancement);
    } catch {
      try {
        enhanceCanvas(outputCanvas, resolvedEnhancement);
      } catch {
        enhancementFailed = true;
      }
    }

    return {
      image: await canvasToJpeg(outputCanvas, resolvedQuality),
      dimensions,
      usedFallback: false,
      correctionFailed: false,
      enhancementFailed,
      durationMs: performance.now() - startedAt,
    };
  } catch {
    return {
      image: await canvasToJpeg(capturedFrame.canvas, resolvedQuality),
      dimensions: getFallbackDimensions(capturedFrame),
      usedFallback: true,
      correctionFailed: true,
      enhancementFailed: false,
      durationMs: performance.now() - startedAt,
    };
  }
}
