import type { DocumentCorners } from "@/lib/detection/geometry";
import { loadOpenCv } from "@/lib/detection/opencv-loader";
import {
  createFullFrameCoordinateMapping,
  mapAnalysisCornersToCapture,
  type FrameDimensions,
} from "./coordinate-mapping";
import { enhanceCanvas } from "./enhancement";
import {
  warpPerspectiveToCanvas,
  type PerspectiveOutputDimensions,
} from "./perspective-transform";

export interface CapturedFrame {
  readonly canvas: HTMLCanvasElement;
  readonly sourceDimensions: FrameDimensions;
}

export interface CaptureProcessingInput {
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

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
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
      0.92,
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
  const { capturedFrame, analysisCorners, analysisDimensions } = input;

  if (!analysisCorners || !analysisDimensions) {
    return {
      image: await canvasToJpeg(capturedFrame.canvas),
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
    );

    let enhancementFailed = false;
    try {
      enhanceCanvas(outputCanvas);
    } catch {
      enhancementFailed = true;
    }

    return {
      image: await canvasToJpeg(outputCanvas),
      dimensions,
      usedFallback: false,
      correctionFailed: false,
      enhancementFailed,
      durationMs: performance.now() - startedAt,
    };
  } catch {
    return {
      image: await canvasToJpeg(capturedFrame.canvas),
      dimensions: getFallbackDimensions(capturedFrame),
      usedFallback: true,
      correctionFailed: true,
      enhancementFailed: false,
      durationMs: performance.now() - startedAt,
    };
  }
}
