import type { OpenCV } from "@opencvjs/web";
import type { AnalysisFrame } from "@/lib/camera/frame-sampler";
import {
  DEFAULT_CONTAINMENT_TOLERANCE_PX,
  calculateBoundingBoxIoU,
  cornersBoundingBox,
  isContainedWithin,
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
import {
  refineCorners,
  type CornerRefinementConfig,
  DEFAULT_CORNER_REFINEMENT_CONFIG,
} from "./corner-refinement.ts";

export interface DocumentDetection {
  readonly corners: DocumentCorners;
  readonly confidence: number;
  readonly areaRatio: number;
  readonly edgeSupport: number;
  readonly geometryScore: number;
}

export interface DocumentDetectorConfig
  extends QuadrilateralValidationConfig {
  readonly claheClipLimit: number;
  readonly claheTileSize: number;
  readonly useBilateralFilter: boolean;
  readonly bilateralDiameter: number;
  readonly bilateralSigmaColor: number;
  readonly bilateralSigmaSpace: number;
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
  readonly cornerRefinement: CornerRefinementConfig;
  readonly minContainmentAreaRatio: number;
  readonly containmentTolerancePx: number;
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
  claheClipLimit: 2.0,
  claheTileSize: 8,
  useBilateralFilter: false,
  bilateralDiameter: 7,
  bilateralSigmaColor: 50,
  bilateralSigmaSpace: 50,
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
  // Permits close/fully-framed documents occupying up to ~88% of the analysis frame
  // to be reconstructed when rounded corners or lighting prevent an exact 4-vertex polygon.
  maxReconstructedAreaRatio: 0.88,
  minReconstructedContourFill: 0.42,
  minReconstructedEdgeSupport: 0.46,
  standardEvidence: {
    samplesPerSide: 18,
    edgeSearchRadiusPx: 3,
    minimumSideSupport: 0.12,
    minimumAverageSupport: 0.38,
    strongSideSupport: 0.32,
    minimumStrongSideCount: 3,
  },
  reconstructionEvidence: {
    samplesPerSide: 22,
    edgeSearchRadiusPx: 3,
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
  cornerRefinement: DEFAULT_CORNER_REFINEMENT_CONFIG,
  minContainmentAreaRatio: 1.5,
  containmentTolerancePx: DEFAULT_CONTAINMENT_TOLERANCE_PX,
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
  readonly boundaryEvidence: CandidateBoundaryEvidence;
}

interface ContourSearchResult {
  readonly candidates: readonly ScoredDocumentCandidate[];
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
    boundaryEvidence,
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

/**
 * Selects the best candidate from a set using containment-aware reasoning.
 *
 * When the highest-confidence candidate is geometrically contained inside
 * another candidate that has sufficient boundary evidence, the enclosing
 * candidate is preferred — it likely represents the physical document
 * boundary rather than internal content (photo, chip, barcode, MRZ).
 *
 * The enclosing candidate must:
 * - be at least minContainmentAreaRatio × the inner candidate's area
 * - pass balanced boundary evidence checks
 *
 * If multiple enclosing candidates qualify, the one with the highest
 * confidence is chosen (most plausible, not blindly largest).
 */
const CONTINUITY_IOU_THRESHOLD = 0.60;
const CONTINUITY_CONFIDENCE_BOOST = 0.06;

function getCandidateConfidence(
  candidate: ScoredDocumentCandidate,
  previousCorners?: DocumentCorners | null,
): number {
  if (!previousCorners) {
    return candidate.detection.confidence;
  }

  const prevBox = cornersBoundingBox(previousCorners);
  const candBox = cornersBoundingBox(candidate.detection.corners);
  const iou = calculateBoundingBoxIoU(candBox, prevBox);

  if (iou >= CONTINUITY_IOU_THRESHOLD) {
    return clampScore(candidate.detection.confidence + CONTINUITY_CONFIDENCE_BOOST);
  }

  return candidate.detection.confidence;
}

/**
 * Selects the winning document candidate using a 3-Tier Semantic Hierarchy with Temporal Continuity:
 *
 * Tier 1: Identify all candidate containment relationships across the pool.
 * A candidate B is classified as an "internal feature" if a significantly larger candidate A
 * with balanced boundary evidence geometrically encloses B.
 *
 * Tier 2: Separate candidates into outer document candidates vs. internal feature candidates.
 *
 * Tier 3: If one or more plausible enclosing outer candidates exist, choose the highest effective-confidence
 * candidate among the outer candidates (ensuring the enclosing physical boundary always defeats
 * internal photos/chips/barcodes).
 *
 * Temporal Continuity: When previousCorners is provided (from the preceding frame's detection),
 * candidates with high geometric continuity (IoU >= 0.60) receive a modest confidence boost (+0.06),
 * preventing frame-to-frame candidate flickering between outer card and internal features.
 *
 * If no containment exists (e.g. single standalone receipt or separate pages), the highest-confidence
 * candidate wins normally.
 */
export function selectBestCandidate(
  candidates: readonly ScoredDocumentCandidate[],
  config: Pick<
    DocumentDetectorConfig,
    "minContainmentAreaRatio" | "standardEvidence" | "containmentTolerancePx"
  > = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  previousCorners?: DocumentCorners | null,
): ScoredDocumentCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const tolerance =
    config.containmentTolerancePx ?? DEFAULT_CONTAINMENT_TOLERANCE_PX;
  const minContainmentAreaRatio = config.minContainmentAreaRatio ?? 1.35;

  // Identify all containment relationships across the entire candidate pool.
  const internalFeatureCandidates = new Set<ScoredDocumentCandidate>();

  for (const candidateA of candidates) {
    // An enclosing candidate must have balanced boundary evidence.
    if (
      !hasBalancedBoundaryEvidence(
        candidateA.boundaryEvidence,
        config.standardEvidence,
      )
    ) {
      continue;
    }

    for (const candidateB of candidates) {
      if (candidateA === candidateB) {
        continue;
      }

      // Check if A is significantly larger than B
      const areaThreshold =
        candidateB.detection.areaRatio * minContainmentAreaRatio;
      if (candidateA.detection.areaRatio + 1e-9 < areaThreshold) {
        continue;
      }

      // Check if A geometrically encloses B
      if (
        isContainedWithin(
          candidateB.detection.corners,
          candidateA.detection.corners,
          tolerance,
        )
      ) {
        internalFeatureCandidates.add(candidateB);
      }
    }
  }

  // Outer candidates are those not enclosed as an internal feature of another candidate
  const outerCandidates = candidates.filter(
    (c) => !internalFeatureCandidates.has(c),
  );

  // If there are valid outer candidates, choose the highest effective-confidence one among them
  if (outerCandidates.length > 0) {
    return outerCandidates.reduce((best, current) =>
      getCandidateConfidence(current, previousCorners) >
      getCandidateConfidence(best, previousCorners)
        ? current
        : best,
    );
  }

  // Fallback: If all candidates are nested inside each other, choose the highest confidence candidate.
  return candidates.reduce((best, current) =>
    getCandidateConfidence(current, previousCorners) >
    getCandidateConfidence(best, previousCorners)
      ? current
      : best,
  );
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

    const candidates: ScoredDocumentCandidate[] = [];
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

          candidates.push(
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
        candidates.push(
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
      candidates,
      contourCount: contours.size(),
      quadrilateralCount,
    };
  } finally {
    hierarchy.delete();
    contours.delete();
  }
}

/**
 * Applies CLAHE + blur preprocessing, returning the blurred grayscale mat.
 * The caller must delete the returned claheResult mat.
 */
function preprocessFrame(
  cv: typeof OpenCV,
  grayscale: OpenCV.Mat,
  blurred: OpenCV.Mat,
  config: DocumentDetectorConfig,
): OpenCV.Mat | null {
  let claheResult: OpenCV.Mat | null = null;

  try {
    const clahe = new cv.CLAHE(config.claheClipLimit, new cv.Size(config.claheTileSize, config.claheTileSize));
    claheResult = new cv.Mat();
    clahe.apply(grayscale, claheResult);
    clahe.delete();
  } catch {
    // CLAHE may not be available in some OpenCV WASM builds.
    // Fall back to raw grayscale.
    claheResult?.delete();
    claheResult = null;
  }

  const blurSource = claheResult ?? grayscale;

  if (config.useBilateralFilter) {
    try {
      cv.bilateralFilter(
        blurSource,
        blurred,
        config.bilateralDiameter,
        config.bilateralSigmaColor,
        config.bilateralSigmaSpace,
      );
    } catch {
      // bilateralFilter may not be available or may fail on some inputs.
      cv.GaussianBlur(
        blurSource,
        blurred,
        new cv.Size(config.blurKernelSize, config.blurKernelSize),
        0,
        0,
        cv.BORDER_DEFAULT,
      );
    }
  } else {
    cv.GaussianBlur(
      blurSource,
      blurred,
      new cv.Size(config.blurKernelSize, config.blurKernelSize),
      0,
      0,
      cv.BORDER_DEFAULT,
    );
  }

  return claheResult;
}

/**
 * Refines the corners of a detection result using line-fitting and
 * sub-pixel refinement. Returns the original detection unchanged if
 * refinement produces a worse result.
 */
function refineDetection(
  cv: typeof OpenCV,
  detection: DocumentDetection,
  edgeMap: EdgeMap,
  grayscale: OpenCV.Mat,
  config: DocumentDetectorConfig,
): DocumentDetection {
  const refined = refineCorners(
    cv,
    detection.corners,
    edgeMap,
    edgeMap.width,
    edgeMap.height,
    config,
    config.cornerRefinement,
  );

  if (refined === detection.corners) {
    return detection;
  }

  return {
    ...detection,
    corners: refined,
  };
}

export function runDocumentDetection(
  cv: typeof OpenCV,
  frame: AnalysisFrame,
  config: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  previousCorners?: DocumentCorners | null,
): DocumentDetectionRun {
  const source = cv.imread(frame.canvas);

  const grayscale = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const standardKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(
      config.morphologyKernelSize,
      config.morphologyKernelSize,
    ),
  );
  const fallbackKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(
      config.fallbackMorphologyKernelSize,
      config.fallbackMorphologyKernelSize,
    ),
  );

  let claheResult: OpenCV.Mat | null = null;

  try {
    cv.cvtColor(source, grayscale, cv.COLOR_RGBA2GRAY);
    claheResult = preprocessFrame(cv, grayscale, blurred, config);
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

    const standardWinner = selectBestCandidate(
      standardResult.candidates,
      config,
      previousCorners,
    );

    if (standardWinner) {
      const edgeMap: EdgeMap = {
        data: edges.data,
        width: frame.width,
        height: frame.height,
      };
      return {
        detection: refineDetection(
          cv,
          standardWinner.detection,
          edgeMap,
          grayscale,
          config,
        ),
        contourCount: standardResult.contourCount,
        quadrilateralCount: standardResult.quadrilateralCount,
        strategy: standardWinner.strategy,
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

    const fallbackWinner = selectBestCandidate(
      fallbackResult.candidates,
      config,
      previousCorners,
    );
    const fallbackDetection = fallbackWinner?.detection ?? null;
    const refinedFallback = fallbackDetection
      ? refineDetection(
          cv,
          fallbackDetection,
          { data: edges.data, width: frame.width, height: frame.height },
          grayscale,
          config,
        )
      : null;

    return {
      detection: refinedFallback,
      contourCount: standardResult.contourCount + fallbackResult.contourCount,
      quadrilateralCount:
        standardResult.quadrilateralCount + fallbackResult.quadrilateralCount,
      strategy: fallbackWinner?.strategy ?? null,
    };
  } finally {
    claheResult?.delete();
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
  previousCorners?: DocumentCorners | null,
): DocumentDetection | null {
  return runDocumentDetection(cv, frame, config, previousCorners).detection;
}
