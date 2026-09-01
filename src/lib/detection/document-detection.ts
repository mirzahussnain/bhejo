import type { OpenCV } from "@opencvjs/web";
import type { AnalysisFrame } from "@/lib/camera/frame-sampler";
import {
  polygonArea,
  validateQuadrilateral,
  type DocumentCorners,
  type Point,
  type QuadrilateralValidationConfig,
  type ValidQuadrilateral,
} from "./geometry.ts";
import {
  calculateCandidateBoundaryEvidence,
  createBoundaryEvidence,
  hasBalancedBoundaryEvidence,
  type CandidateBoundaryEvidence,
  type CandidateEvidenceConfig,
  type EdgeMap,
} from "./candidate-evidence.ts";

export interface DocumentDetection {
  readonly corners: DocumentCorners;
  readonly confidence: number;
  readonly areaRatio: number;
  readonly edgeSupport: number;
  readonly geometryScore: number;
}

export interface DocumentDetectorConfig
  extends QuadrilateralValidationConfig {
  readonly blurKernelSize: number;
  readonly cannyLowThreshold: number;
  readonly cannyHighThreshold: number;
  readonly morphologyKernelSize: number;
  readonly fallbackCannyLowThreshold: number;
  readonly fallbackCannyHighThreshold: number;
  readonly fallbackMorphologyKernelSize: number;
  readonly polygonApproximationRatios: readonly number[];
  readonly targetAreaRatio: number;
  readonly maxReconstructedAreaRatio: number;
  readonly minReconstructedContourFill: number;
  readonly minReconstructedEdgeSupport: number;
  readonly standardEvidence: CandidateEvidenceConfig;
  readonly reconstructionEvidence: CandidateEvidenceConfig;
}

export type DocumentCandidateStrategy =
  | "standard-edge-contour"
  | "weak-edge-contour"
  | "weak-edge-reconstruction";

export interface DocumentDetectionRun {
  readonly detection: DocumentDetection | null;
  readonly contourCount: number;
  readonly quadrilateralCount: number;
  readonly strategy: DocumentCandidateStrategy | null;
}

export const DEFAULT_DOCUMENT_DETECTOR_CONFIG: DocumentDetectorConfig = {
  blurKernelSize: 5,
  cannyLowThreshold: 30,
  cannyHighThreshold: 100,
  morphologyKernelSize: 3,
  fallbackCannyLowThreshold: 12,
  fallbackCannyHighThreshold: 55,
  fallbackMorphologyKernelSize: 5,
  polygonApproximationRatios: [0.015, 0.02, 0.03],
  minAreaRatio: 0.02,
  maxAreaRatio: 0.96,
  minEdgeRatio: 0.06,
  minInteriorAngleDegrees: 25,
  maxInteriorAngleDegrees: 155,
  minAngleScore: 0.4,
  minEdgeConsistency: 0.16,
  boundaryTargetRatio: 0.035,
  targetAreaRatio: 0.3,
  maxReconstructedAreaRatio: 0.5,
  minReconstructedContourFill: 0.42,
  minReconstructedEdgeSupport: 0.46,
  standardEvidence: {
    samplesPerSide: 18,
    edgeSearchRadiusPx: 2,
    minimumSideSupport: 0.12,
    minimumAverageSupport: 0.38,
    strongSideSupport: 0.32,
    minimumStrongSideCount: 3,
  },
  reconstructionEvidence: {
    samplesPerSide: 22,
    edgeSearchRadiusPx: 2,
    // Lowered from 0.2/0.54 to allow passport pages where the outer edge
    // (away from the fold) has modest contrast against the surface.
    // The other reconstruction guards (maxReconstructedAreaRatio,
    // minReconstructedContourFill, strongSideSupport, minimumStrongSideCount)
    // remain strict and continue to reject false positives.
    minimumSideSupport: 0.14,
    minimumAverageSupport: 0.46,
    strongSideSupport: 0.45,
    minimumStrongSideCount: 3,
  },
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreDocumentCandidate(
  candidate: ValidQuadrilateral,
  targetAreaRatio = DEFAULT_DOCUMENT_DETECTOR_CONFIG.targetAreaRatio,
  boundaryEvidence: CandidateBoundaryEvidence = createBoundaryEvidence([
    1, 1, 1, 1,
  ]),
): number {
  const areaScore = clampScore(
    Math.sqrt(candidate.metrics.areaRatio / targetAreaRatio),
  );

  return clampScore(
    areaScore * 0.14 +
      candidate.metrics.angleScore * 0.17 +
      candidate.metrics.edgeConsistency * 0.1 +
      candidate.metrics.boundaryScore * 0.07 +
      boundaryEvidence.averageSupport * 0.38 +
      boundaryEvidence.weakestSideSupport * 0.14,
  );
}

function readContourPoints(contour: OpenCV.Mat): Point[] {
  const points: Point[] = [];

  for (let index = 0; index < contour.data32S.length; index += 2) {
    points.push({ x: contour.data32S[index], y: contour.data32S[index + 1] });
  }

  return points;
}

interface ScoredDocumentCandidate {
  readonly detection: DocumentDetection;
  readonly strategy: DocumentCandidateStrategy;
}

interface ContourSearchResult {
  readonly candidate: ScoredDocumentCandidate | null;
  readonly contourCount: number;
  readonly quadrilateralCount: number;
}

export function hasSufficientReconstructionEvidence(
  contourArea: number,
  corners: DocumentCorners,
  boundaryEvidence: CandidateBoundaryEvidence,
  config: Pick<
    DocumentDetectorConfig,
    | "minReconstructedContourFill"
    | "minReconstructedEdgeSupport"
    | "reconstructionEvidence"
  > = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
): boolean {
  const rectangleArea = polygonArea(corners);
  if (rectangleArea <= 0) {
    return false;
  }

  const contourFill = Math.abs(contourArea) / rectangleArea;
  return (
    contourFill >= config.minReconstructedContourFill &&
    boundaryEvidence.averageSupport >= config.minReconstructedEdgeSupport &&
    hasBalancedBoundaryEvidence(boundaryEvidence, config.reconstructionEvidence)
  );
}

export function isReconstructedCandidateEligible(
  candidate: ValidQuadrilateral,
  contourArea: number,
  boundaryEvidence: CandidateBoundaryEvidence,
  config: Pick<
    DocumentDetectorConfig,
    | "maxReconstructedAreaRatio"
    | "minReconstructedContourFill"
    | "minReconstructedEdgeSupport"
    | "reconstructionEvidence"
  > = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
): boolean {
  return (
    candidate.metrics.areaRatio <= config.maxReconstructedAreaRatio &&
    hasSufficientReconstructionEvidence(
      contourArea,
      candidate.corners,
      boundaryEvidence,
      config,
    )
  );
}

function createScoredCandidate(
  candidate: ValidQuadrilateral,
  boundaryEvidence: CandidateBoundaryEvidence,
  strategy: DocumentCandidateStrategy,
  config: DocumentDetectorConfig,
): ScoredDocumentCandidate {
  return {
    strategy,
    detection: {
      corners: candidate.corners,
      confidence: scoreDocumentCandidate(
        candidate,
        config.targetAreaRatio,
        boundaryEvidence,
      ),
      areaRatio: candidate.metrics.areaRatio,
      edgeSupport: boundaryEvidence.averageSupport,
      geometryScore:
        candidate.metrics.angleScore * 0.5 +
        candidate.metrics.edgeConsistency * 0.3 +
        candidate.metrics.boundaryScore * 0.2,
    },
  };
}

function chooseCandidate(
  current: ScoredDocumentCandidate | null,
  next: ScoredDocumentCandidate,
): ScoredDocumentCandidate {
  return !current || next.detection.confidence > current.detection.confidence
    ? next
    : current;
}

function findContourCandidates(
  cv: typeof OpenCV,
  edges: OpenCV.Mat,
  frame: AnalysisFrame,
  config: DocumentDetectorConfig,
  strategy: Exclude<DocumentCandidateStrategy, "weak-edge-reconstruction">,
  allowReconstruction: boolean,
): ContourSearchResult {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
    );

    let candidate: ScoredDocumentCandidate | null = null;
    let quadrilateralCount = 0;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const approximation = new cv.Mat();

      try {
        const contourArea = Math.abs(cv.contourArea(contour));
        const contourAreaRatio = contourArea / (frame.width * frame.height);
        const contourPerimeter = cv.arcLength(contour, true);
        if (contourAreaRatio < config.minAreaRatio * 0.5) {
          continue;
        }

        for (const approximationRatio of config.polygonApproximationRatios) {
          cv.approxPolyDP(
            contour,
            approximation,
            contourPerimeter * approximationRatio,
            true,
          );

          if (
            approximation.rows !== 4 ||
            !cv.isContourConvex(approximation)
          ) {
            continue;
          }

          quadrilateralCount += 1;
          const quadrilateral = validateQuadrilateral(
            readContourPoints(approximation),
            frame.width,
            frame.height,
            config,
          );
          if (!quadrilateral) {
            continue;
          }

          const boundaryEvidence = calculateCandidateBoundaryEvidence(
            {
              data: edges.data,
              width: frame.width,
              height: frame.height,
            } satisfies EdgeMap,
            quadrilateral.corners,
            config.standardEvidence,
          );
          if (!hasBalancedBoundaryEvidence(boundaryEvidence, config.standardEvidence)) {
            continue;
          }

          candidate = chooseCandidate(
            candidate,
            createScoredCandidate(quadrilateral, boundaryEvidence, strategy, config),
          );
        }

        if (!allowReconstruction) {
          continue;
        }

        const reconstructedCorners = cv
          .boxPoints(cv.minAreaRect(contour))
          .map((point) => ({ x: point.x, y: point.y }));
        const reconstructed = validateQuadrilateral(
          reconstructedCorners,
          frame.width,
          frame.height,
          config,
        );

        const boundaryEvidence = reconstructed
          ? calculateCandidateBoundaryEvidence(
              {
                data: edges.data,
                width: frame.width,
                height: frame.height,
              } satisfies EdgeMap,
              reconstructed.corners,
              config.reconstructionEvidence,
            )
          : null;
        if (
          !reconstructed ||
          !boundaryEvidence ||
          !isReconstructedCandidateEligible(
            reconstructed,
            contourArea,
            boundaryEvidence,
            config,
          )
        ) {
          continue;
        }

        quadrilateralCount += 1;
        candidate = chooseCandidate(
          candidate,
          createScoredCandidate(
            reconstructed,
            boundaryEvidence,
            "weak-edge-reconstruction",
            config,
          ),
        );
      } finally {
        approximation.delete();
        contour.delete();
      }
    }

    return {
      candidate,
      contourCount: contours.size(),
      quadrilateralCount,
    };
  } finally {
    hierarchy.delete();
    contours.delete();
  }
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
  const standardKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(config.morphologyKernelSize, config.morphologyKernelSize),
  );
  const fallbackKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(
      config.fallbackMorphologyKernelSize,
      config.fallbackMorphologyKernelSize,
    ),
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
      standardKernel,
      new cv.Point(-1, -1),
      1,
    );
    const standardResult = findContourCandidates(
      cv,
      edges,
      frame,
      config,
      "standard-edge-contour",
      false,
    );

    if (standardResult.candidate) {
      return {
        detection: standardResult.candidate.detection,
        contourCount: standardResult.contourCount,
        quadrilateralCount: standardResult.quadrilateralCount,
        strategy: standardResult.candidate.strategy,
      };
    }

    cv.Canny(
      blurred,
      edges,
      config.fallbackCannyLowThreshold,
      config.fallbackCannyHighThreshold,
      3,
      true,
    );
    cv.morphologyEx(
      edges,
      edges,
      cv.MORPH_CLOSE,
      fallbackKernel,
      new cv.Point(-1, -1),
      1,
    );
    const fallbackResult = findContourCandidates(
      cv,
      edges,
      frame,
      config,
      "weak-edge-contour",
      true,
    );

    return {
      detection: fallbackResult.candidate?.detection ?? null,
      contourCount: standardResult.contourCount + fallbackResult.contourCount,
      quadrilateralCount:
        standardResult.quadrilateralCount + fallbackResult.quadrilateralCount,
      strategy: fallbackResult.candidate?.strategy ?? null,
    };
  } finally {
    fallbackKernel.delete();
    standardKernel.delete();
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
