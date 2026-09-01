import type { OpenCV } from "@opencvjs/web";
import type { AnalysisFrame } from "@/lib/camera/frame-sampler";
import {
  validateQuadrilateral,
  type DocumentCorners,
  type Point,
  type QuadrilateralValidationConfig,
  type ValidQuadrilateral,
} from "./geometry.ts";

export interface DocumentDetection {
  readonly corners: DocumentCorners;
  readonly confidence: number;
  readonly areaRatio: number;
}

export interface DocumentDetectorConfig
  extends QuadrilateralValidationConfig {
  readonly blurKernelSize: number;
  readonly cannyLowThreshold: number;
  readonly cannyHighThreshold: number;
  readonly morphologyKernelSize: number;
  readonly polygonApproximationRatios: readonly number[];
  readonly targetAreaRatio: number;
}

export interface DocumentDetectionRun {
  readonly detection: DocumentDetection | null;
  readonly contourCount: number;
  readonly quadrilateralCount: number;
}

export const DEFAULT_DOCUMENT_DETECTOR_CONFIG: DocumentDetectorConfig = {
  blurKernelSize: 5,
  cannyLowThreshold: 30,
  cannyHighThreshold: 100,
  morphologyKernelSize: 3,
  polygonApproximationRatios: [0.015, 0.02, 0.03],
  minAreaRatio: 0.02,
  maxAreaRatio: 0.96,
  minEdgeRatio: 0.06,
  minInteriorAngleDegrees: 25,
  maxInteriorAngleDegrees: 155,
  minAngleScore: 0.4,
  minEdgeConsistency: 0.16,
  boundaryTargetRatio: 0.035,
  targetAreaRatio: 0.6,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreDocumentCandidate(
  candidate: ValidQuadrilateral,
  targetAreaRatio = DEFAULT_DOCUMENT_DETECTOR_CONFIG.targetAreaRatio,
): number {
  const areaScore = clampScore(candidate.metrics.areaRatio / targetAreaRatio);

  return clampScore(
    areaScore * 0.38 +
      candidate.metrics.angleScore * 0.3 +
      candidate.metrics.edgeConsistency * 0.17 +
      candidate.metrics.boundaryScore * 0.15,
  );
}

function readContourPoints(contour: OpenCV.Mat): Point[] {
  const points: Point[] = [];

  for (let index = 0; index < contour.data32S.length; index += 2) {
    points.push({ x: contour.data32S[index], y: contour.data32S[index + 1] });
  }

  return points;
}

export function runDocumentDetection(
  cv: typeof OpenCV,
  frame: AnalysisFrame,
  config: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
): DocumentDetectionRun {
  const source = cv.imread(frame.canvas);
  const grayscale = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const morphologyKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(config.morphologyKernelSize, config.morphologyKernelSize),
  );

  try {
    cv.cvtColor(source, grayscale, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(
      grayscale,
      blurred,
      new cv.Size(config.blurKernelSize, config.blurKernelSize),
      0,
      0,
      cv.BORDER_DEFAULT,
    );
    cv.Canny(
      blurred,
      edges,
      config.cannyLowThreshold,
      config.cannyHighThreshold,
      3,
      true,
    );
    cv.morphologyEx(
      edges,
      edges,
      cv.MORPH_CLOSE,
      morphologyKernel,
      new cv.Point(-1, -1),
      1,
    );
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
    );

    let bestDetection: DocumentDetection | null = null;
    let quadrilateralCount = 0;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const approximation = new cv.Mat();

      try {
        const contourAreaRatio =
          Math.abs(cv.contourArea(contour)) / (frame.width * frame.height);
        if (
          contourAreaRatio < config.minAreaRatio ||
          contourAreaRatio > config.maxAreaRatio
        ) {
          continue;
        }

        const perimeter = cv.arcLength(contour, true);
        for (const approximationRatio of config.polygonApproximationRatios) {
          cv.approxPolyDP(
            contour,
            approximation,
            perimeter * approximationRatio,
            true,
          );

          if (
            approximation.rows !== 4 ||
            !cv.isContourConvex(approximation)
          ) {
            continue;
          }

          quadrilateralCount += 1;
          const candidate = validateQuadrilateral(
            readContourPoints(approximation),
            frame.width,
            frame.height,
            config,
          );
          if (!candidate) {
            continue;
          }

          const confidence = scoreDocumentCandidate(
            candidate,
            config.targetAreaRatio,
          );
          if (!bestDetection || confidence > bestDetection.confidence) {
            bestDetection = {
              corners: candidate.corners,
              confidence,
              areaRatio: candidate.metrics.areaRatio,
            };
          }
        }
      } finally {
        approximation.delete();
        contour.delete();
      }
    }

    return {
      detection: bestDetection,
      contourCount: contours.size(),
      quadrilateralCount,
    };
  } finally {
    morphologyKernel.delete();
    hierarchy.delete();
    contours.delete();
    edges.delete();
    blurred.delete();
    grayscale.delete();
    source.delete();
  }
}

export function detectDocument(
  cv: typeof OpenCV,
  frame: AnalysisFrame,
  config: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
): DocumentDetection | null {
  return runDocumentDetection(cv, frame, config).detection;
}
