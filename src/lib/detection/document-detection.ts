import type { OpenCV } from "@opencvjs/web";
import type { AnalysisFrame } from "@/lib/camera/frame-sampler";
import {
  DEFAULT_CONTAINMENT_TOLERANCE_PX,
  calculateBoundingBoxIoU,
  cornersBoundingBox,
  distance,
  isContainedWithin,
  isConvexQuadrilateral,
  orderCorners,
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
  readonly coarseBlurKernelSize?: number;
  readonly minContainmentAreaRatio: number;
  readonly containmentTolerancePx: number;
}

export type DocumentCandidateStrategy =
  | "standard-edge-contour"
  | "adaptive-edge-contour"
  | "open-spread-hypothesis"
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
  coarseBlurKernelSize: 9,
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

export interface AdaptiveThresholds {
  readonly cannyLow: number;
  readonly cannyHigh: number;
  readonly macroCutoff: number;
}

/**
 * Derives adaptive Canny thresholds and macro boundary cutoff from the Otsu
 * threshold computed on the morphological gradient of the coarse-blurred frame.
 *
 * This provides contrast-adaptive edge sensitivity:
 * - Low-contrast scenes: thresholds scale down gracefully (safe minimums 15/35)
 * - Textured / high-contrast scenes: thresholds elevate to suppress clutter
 */
export function computeAdaptiveEdgeThresholds(
  gradOtsu: number,
): AdaptiveThresholds {
  const safeOtsu = Math.max(10, Math.min(120, Number.isFinite(gradOtsu) ? gradOtsu : 30));
  const cannyHigh = Math.max(35, Math.min(120, Math.round(safeOtsu * 1.25)));
  const cannyLow = Math.max(15, Math.round(cannyHigh * 0.40));
  const macroCutoff = Math.max(8, Math.round(safeOtsu * 0.45));
  return { cannyLow, cannyHigh, macroCutoff };
}

/**
 * Checks whether a candidate represents a confident, full-sized document with strong
 * boundary support on all sides, justifying immediate acceptance without running
 * multi-scale edge fusion.
 */
export function isStrongDocumentWinner(
  winner: ScoredDocumentCandidate | null,
): boolean {
  if (!winner) {
    return false;
  }
  return (
    winner.detection.areaRatio >= 0.18 &&
    winner.detection.confidence >= 0.65 &&
    winner.boundaryEvidence.weakestSideSupport >= 0.25 &&
    winner.boundaryEvidence.averageSupport >= 0.45
  );
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
    | "minContainmentAreaRatio"
    | "standardEvidence"
    | "reconstructionEvidence"
    | "containmentTolerancePx"
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
    const evidenceConfig =
      candidateA.strategy === "weak-edge-reconstruction"
        ? config.reconstructionEvidence
        : config.standardEvidence;

    if (
      !hasBalancedBoundaryEvidence(
        candidateA.boundaryEvidence,
        evidenceConfig,
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

/**
 * Detects pairs of adjacent page-like candidates that plausibly form one physical
 * open-book or open-passport spread, constructing an enclosing spread quadrilateral.
 *
 * Requirements (P0.2):
 * - Detect pairs of adjacent page-like quadrilaterals that plausibly form one physical spread
 * - Similar vertical extent, adjacent relationship, compatible scale
 * - Shared central spine with close proximity
 * - Approximately collinear top and bottom outer boundaries
 * - Non-overlapping adjacent pages (IoU <= 0.18)
 * - Resulting spread represents the OUTER PHYSICAL BOUNDARY (omitting center fold)
 * - Evaluated against balanced boundary evidence on the outer edges
 * - Strong rejection rules against unrelated documents, cards, barcodes, MRZ, photos
 */
export function generateSpreadCandidates(
  candidates: readonly ScoredDocumentCandidate[],
  edgeMap: EdgeMap,
  frameWidth: number,
  frameHeight: number,
  config: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
): readonly ScoredDocumentCandidate[] {
  if (candidates.length < 2) {
    return [];
  }

  const spreadCandidates: ScoredDocumentCandidate[] = [];

  // Filter out candidates that cannot plausibly be a page of an open document spread
  // (e.g. tiny barcodes, thin MRZ strips, or full-frame enclosing documents)
  const pageCandidates = candidates.filter((c) => {
    // Area ratio of a single page in an open spread is typically between 0.08 and 0.60
    if (c.detection.areaRatio < 0.08 || c.detection.areaRatio > 0.60) {
      return false;
    }
    // Single page aspect ratio (ISO B7 passport page: 125x88mm => 1.42; allowed range [1.15, 1.90])
    const corners = c.detection.corners;
    const w = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2;
    const h = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2;
    if (w <= 0 || h <= 0) return false;
    const ratio = Math.max(w, h) / Math.min(w, h);
    return ratio >= 1.15 && ratio <= 1.90;
  });

  for (let i = 0; i < pageCandidates.length; i += 1) {
    const candA = pageCandidates[i];
    for (let j = i + 1; j < pageCandidates.length; j += 1) {
      const candB = pageCandidates[j];

      // 1. Scale compatibility: area ratio between 0.55 and 1.80
      const areaA = candA.detection.areaRatio;
      const areaB = candB.detection.areaRatio;
      const areaRatio = Math.min(areaA, areaB) / Math.max(areaA, areaB);
      if (areaRatio < 0.55) {
        continue;
      }

      // 2. Bounding box IoU must be small (adjacent, not overlapping)
      const boxA = cornersBoundingBox(candA.detection.corners);
      const boxB = cornersBoundingBox(candB.detection.corners);
      const iou = calculateBoundingBoxIoU(boxA, boxB);
      if (iou > 0.18) {
        continue;
      }

      // 3. Determine adjacency orientation (horizontal or vertical)
      const centerA = {
        x: (candA.detection.corners[0].x + candA.detection.corners[2].x) / 2,
        y: (candA.detection.corners[0].y + candA.detection.corners[2].y) / 2,
      };
      const centerB = {
        x: (candB.detection.corners[0].x + candB.detection.corners[2].x) / 2,
        y: (candB.detection.corners[0].y + candB.detection.corners[2].y) / 2,
      };

      const dx = centerB.x - centerA.x;
      const dy = centerB.y - centerA.y;

      let mergedCorners: DocumentCorners | null = null;

      if (Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal adjacency: left page and right page
        const left = dx > 0 ? candA.detection.corners : candB.detection.corners;
        const right = dx > 0 ? candB.detection.corners : candA.detection.corners;

        // Spine edges: left right-edge (left[1] -> left[2]) and right left-edge (right[0] -> right[3])
        const spineHeightLeft = distance(left[1], left[2]);
        const spineHeightRight = distance(right[0], right[3]);
        if (Math.min(spineHeightLeft, spineHeightRight) / Math.max(spineHeightLeft, spineHeightRight) < 0.75) {
          continue;
        }

        const pageWidth = (distance(left[0], left[1]) + distance(right[0], right[1])) / 2;
        const maxSpineGap = Math.max(18, 0.14 * pageWidth);

        // Gap at spine top and bottom
        const topGap = distance(left[1], right[0]);
        const botGap = distance(left[2], right[3]);
        if (topGap > maxSpineGap || botGap > maxSpineGap) {
          continue;
        }

        // Top corners Y alignment and bottom corners Y alignment
        const meanSpineH = (spineHeightLeft + spineHeightRight) / 2;
        if (Math.abs(left[1].y - right[0].y) > Math.max(14, 0.12 * meanSpineH)) {
          continue;
        }
        if (Math.abs(left[2].y - right[3].y) > Math.max(14, 0.12 * meanSpineH)) {
          continue;
        }

        // Top edges collinearity
        const dTopL = distance(left[0], left[1]);
        const dTopR = distance(right[0], right[1]);
        if (dTopL < 1 || dTopR < 1) continue;
        const uTopL = { x: (left[1].x - left[0].x) / dTopL, y: (left[1].y - left[0].y) / dTopL };
        const uTopR = { x: (right[1].x - right[0].x) / dTopR, y: (right[1].y - right[0].y) / dTopR };
        if (uTopL.x * uTopR.x + uTopL.y * uTopR.y < 0.90) {
          continue;
        }

        // Bottom edges collinearity
        const dBotL = distance(left[3], left[2]);
        const dBotR = distance(right[3], right[2]);
        if (dBotL < 1 || dBotR < 1) continue;
        const uBotL = { x: (left[2].x - left[3].x) / dBotL, y: (left[2].y - left[3].y) / dBotL };
        const uBotR = { x: (right[2].x - right[3].x) / dBotR, y: (right[2].y - right[3].y) / dBotR };
        if (uBotL.x * uBotR.x + uBotL.y * uBotR.y < 0.90) {
          continue;
        }

        // Construct outer spread quadrilateral
        mergedCorners = orderCorners([left[0], right[1], right[2], left[3]]);
      } else {
        // Vertical adjacency: top page and bottom page
        const top = dy > 0 ? candA.detection.corners : candB.detection.corners;
        const bottom = dy > 0 ? candB.detection.corners : candA.detection.corners;

        // Spine edges: top bottom-edge (top[3] -> top[2]) and bottom top-edge (bottom[0] -> bottom[1])
        const spineWidthTop = distance(top[3], top[2]);
        const spineWidthBot = distance(bottom[0], bottom[1]);
        if (Math.min(spineWidthTop, spineWidthBot) / Math.max(spineWidthTop, spineWidthBot) < 0.75) {
          continue;
        }

        const pageHeight = (distance(top[0], top[3]) + distance(bottom[0], bottom[3])) / 2;
        const maxSpineGap = Math.max(18, 0.14 * pageHeight);

        const leftGap = distance(top[3], bottom[0]);
        const rightGap = distance(top[2], bottom[1]);
        if (leftGap > maxSpineGap || rightGap > maxSpineGap) {
          continue;
        }

        const meanSpineW = (spineWidthTop + spineWidthBot) / 2;
        if (Math.abs(top[3].x - bottom[0].x) > Math.max(14, 0.12 * meanSpineW)) {
          continue;
        }
        if (Math.abs(top[2].x - bottom[1].x) > Math.max(14, 0.12 * meanSpineW)) {
          continue;
        }

        // Left edges collinearity
        const dLeftT = distance(top[0], top[3]);
        const dLeftB = distance(bottom[0], bottom[3]);
        if (dLeftT < 1 || dLeftB < 1) continue;
        const uLeftT = { x: (top[3].x - top[0].x) / dLeftT, y: (top[3].y - top[0].y) / dLeftT };
        const uLeftB = { x: (bottom[3].x - bottom[0].x) / dLeftB, y: (bottom[3].y - bottom[0].y) / dLeftB };
        if (uLeftT.x * uLeftB.x + uLeftT.y * uLeftB.y < 0.90) {
          continue;
        }

        // Right edges collinearity
        const dRightT = distance(top[1], top[2]);
        const dRightB = distance(bottom[1], bottom[2]);
        if (dRightT < 1 || dRightB < 1) continue;
        const uRightT = { x: (top[2].x - top[1].x) / dRightT, y: (top[2].y - top[1].y) / dRightT };
        const uRightB = { x: (bottom[2].x - bottom[1].x) / dRightB, y: (bottom[2].y - bottom[1].y) / dRightB };
        if (uRightT.x * uRightB.x + uRightT.y * uRightB.y < 0.90) {
          continue;
        }

        // Construct outer spread quadrilateral
        mergedCorners = orderCorners([top[0], top[1], bottom[2], bottom[3]]);
      }

      if (!mergedCorners || !isConvexQuadrilateral(mergedCorners)) {
        continue;
      }

      // Check spread aspect ratio (typical open passport B6 is 176x125mm => 1.41)
      const sw = (distance(mergedCorners[0], mergedCorners[1]) + distance(mergedCorners[3], mergedCorners[2])) / 2;
      const sh = (distance(mergedCorners[0], mergedCorners[3]) + distance(mergedCorners[1], mergedCorners[2])) / 2;
      if (sw <= 0 || sh <= 0) continue;
      const spreadAspect = Math.max(sw, sh) / Math.min(sw, sh);
      if (spreadAspect < 1.05 || spreadAspect > 2.20) {
        continue;
      }

      // Validate merged quadrilateral
      const validated = validateQuadrilateral(
        mergedCorners,
        frameWidth,
        frameHeight,
        config,
      );
      if (!validated) {
        continue;
      }

      // Measure boundary evidence along the outer physical perimeter of the spread
      const evidence = calculateCandidateBoundaryEvidence(
        edgeMap,
        validated.corners,
        config.standardEvidence,
      );

      // Must have balanced boundary evidence on all outer edges
      if (!hasBalancedBoundaryEvidence(evidence, config.standardEvidence)) {
        continue;
      }

      const spreadCandidate = createScoredCandidate(
        validated,
        evidence,
        "open-spread-hypothesis",
        config,
      );

      spreadCandidates.push(spreadCandidate);
    }
  }

  return spreadCandidates;
}

function findContourCandidates(
  cv: typeof OpenCV,
  edges: OpenCV.Mat,
  frame: AnalysisFrame,
  config: DocumentDetectorConfig,
  strategy: Exclude<DocumentCandidateStrategy, "weak-edge-reconstruction" | "open-spread-hypothesis">,
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
  let coarseBlurred: OpenCV.Mat | null = null;
  let coarseGrad: OpenCV.Mat | null = null;
  let coarseGradMask: OpenCV.Mat | null = null;
  let adaptiveEdges: OpenCV.Mat | null = null;
  let fusedEdges: OpenCV.Mat | null = null;
  let otsuDummy: OpenCV.Mat | null = null;

  try {
    cv.cvtColor(source, grayscale, cv.COLOR_RGBA2GRAY);
    claheResult = preprocessFrame(cv, grayscale, blurred, config);

    // Pass 1: Standard fixed-threshold Canny (30 / 100)
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

    const standardEdgeMap: EdgeMap = {
      data: edges.data,
      width: frame.width,
      height: frame.height,
    };

    const standardSpreads =
      standardResult.candidates.length >= 2
        ? generateSpreadCandidates(
            standardResult.candidates,
            standardEdgeMap,
            frame.width,
            frame.height,
            config,
          )
        : [];

    const standardPool = [...standardResult.candidates, ...standardSpreads];
    let totalContourCount = standardResult.contourCount;
    let totalQuadrilateralCount =
      standardResult.quadrilateralCount + standardSpreads.length;

    const standardWinner = selectBestCandidate(
      standardPool,
      config,
      previousCorners,
    );

    // Fast-path: When standard Canny produces a decisive, high-confidence document
    // detection with strong 4-sided support, return it immediately.
    if (isStrongDocumentWinner(standardWinner)) {
      return {
        detection: refineDetection(
          cv,
          standardWinner!.detection,
          standardEdgeMap,
          grayscale,
          config,
        ),
        contourCount: totalContourCount,
        quadrilateralCount: totalQuadrilateralCount,
        strategy: standardWinner!.strategy,
      };
    }

    // Pass 2: Adaptive & Multi-Scale Edge Fusion (P0.1)
    // Runs when standard Canny is inconclusive (faint edges, missing side, or internal feature).
    let adaptiveCandidates: readonly ScoredDocumentCandidate[] = [];
    const coarseBlurSize = config.coarseBlurKernelSize ?? 9;

    try {
      coarseBlurred = new cv.Mat();
      cv.GaussianBlur(
        blurred,
        coarseBlurred,
        new cv.Size(coarseBlurSize, coarseBlurSize),
        0,
        0,
        cv.BORDER_DEFAULT,
      );

      coarseGrad = new cv.Mat();
      cv.morphologyEx(
        coarseBlurred,
        coarseGrad,
        cv.MORPH_GRADIENT,
        standardKernel,
      );

      otsuDummy = new cv.Mat();
      const rawOtsu = cv.threshold(
        coarseGrad,
        otsuDummy,
        0,
        255,
        cv.THRESH_BINARY | cv.THRESH_OTSU,
      );
      const thresholds = computeAdaptiveEdgeThresholds(rawOtsu as number);

      adaptiveEdges = new cv.Mat();
      cv.Canny(
        blurred,
        adaptiveEdges,
        thresholds.cannyLow,
        thresholds.cannyHigh,
        3,
        true,
      );

      // Reconnect fragmented boundaries via morphological closing
      cv.morphologyEx(
        adaptiveEdges,
        adaptiveEdges,
        cv.MORPH_CLOSE,
        fallbackKernel,
        new cv.Point(-1, -1),
        1,
      );

      // Macro-scale gradient mask suppresses high-frequency wood grain and text lines
      coarseGradMask = new cv.Mat();
      cv.threshold(
        coarseGrad,
        coarseGradMask,
        thresholds.macroCutoff,
        255,
        cv.THRESH_BINARY,
      );

      // Multi-scale evidence fusion: keep closed Canny edges confirmed by macro boundary gradient
      fusedEdges = new cv.Mat();
      cv.bitwise_and(adaptiveEdges, coarseGradMask, fusedEdges);
      cv.morphologyEx(
        fusedEdges,
        fusedEdges,
        cv.MORPH_CLOSE,
        standardKernel,
        new cv.Point(-1, -1),
        1,
      );

      const adaptiveResult = findContourCandidates(
        cv,
        fusedEdges,
        frame,
        config,
        "adaptive-edge-contour",
        false,
      );

      totalContourCount += adaptiveResult.contourCount;
      totalQuadrilateralCount += adaptiveResult.quadrilateralCount;
      adaptiveCandidates = adaptiveResult.candidates;
    } catch {
      // In case adaptive/multi-scale operations encounter unsupported WASM calls,
      // gracefully fall through to standard/fallback candidates.
    }

    // Pool candidates from standard and adaptive passes
    const pooledCandidates = [
      ...standardResult.candidates,
      ...adaptiveCandidates,
    ];

    const winningEdgeData = fusedEdges ? fusedEdges.data : edges.data;
    const currentEdgeMap: EdgeMap = {
      data: winningEdgeData,
      width: frame.width,
      height: frame.height,
    };

    const spreadCandidates =
      pooledCandidates.length >= 2
        ? generateSpreadCandidates(
            pooledCandidates,
            currentEdgeMap,
            frame.width,
            frame.height,
            config,
          )
        : [];

    totalQuadrilateralCount += spreadCandidates.length;
    const allCandidates = [...pooledCandidates, ...spreadCandidates];

    const pooledWinner = selectBestCandidate(
      allCandidates,
      config,
      previousCorners,
    );

    if (pooledWinner) {
      return {
        detection: refineDetection(
          cv,
          pooledWinner.detection,
          currentEdgeMap,
          grayscale,
          config,
        ),
        contourCount: totalContourCount,
        quadrilateralCount: totalQuadrilateralCount,
        strategy: pooledWinner.strategy,
      };
    }

    // Pass 3: Fallback weak reconstruction (minAreaRect for rounded/clipped contours)
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

    totalContourCount += fallbackResult.contourCount;
    totalQuadrilateralCount += fallbackResult.quadrilateralCount;

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
      contourCount: totalContourCount,
      quadrilateralCount: totalQuadrilateralCount,
      strategy: fallbackWinner?.strategy ?? null,
    };
  } finally {
    claheResult?.delete();
    otsuDummy?.delete();
    fusedEdges?.delete();
    adaptiveEdges?.delete();
    coarseGradMask?.delete();
    coarseGrad?.delete();
    coarseBlurred?.delete();
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
