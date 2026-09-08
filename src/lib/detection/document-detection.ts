import type { OpenCV } from "@opencvjs/web";
import type { AnalysisFrame } from "@/lib/camera/frame-sampler";
import {
  DEFAULT_CONTAINMENT_TOLERANCE_PX,
  calculateBoundingBoxIoU,
  calculateOppositeEdgeParallelism,
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
  type GrayscaleMap,
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
  readonly cornerExpansionRatio?: number;
}

export type DocumentCandidateStrategy =
  | "standard-edge-contour"
  | "adaptive-edge-contour"
  | "open-spread-hypothesis"
  | "weak-edge-contour"
  | "weak-edge-reconstruction"
  | "low-contrast-evidence-fusion"
  | "temporal-prior-verification";

export interface DocumentDetectionRun {
  readonly detection: DocumentDetection | null;
  readonly contourCount: number;
  readonly quadrilateralCount: number;
  readonly strategy: DocumentCandidateStrategy | null;
  readonly previousCorners?: DocumentCorners | null;
  readonly previousConfidence?: number | null;
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
  fallbackMorphologyKernelSize: 7,
  coarseBlurKernelSize: 9,
  polygonApproximationRatios: [0.008, 0.012, 0.016, 0.022, 0.03],
  cornerExpansionRatio: 0.008,
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

  const parallelism =
    boundaryEvidence.oppositeEdgeParallelism ??
    calculateOppositeEdgeParallelism(candidate.corners);
  const parallelismFactor = 0.35 + 0.65 * parallelism;

  const rc = boundaryEvidence.regionContrast;
  const normalAlign = boundaryEvidence.edgeNormalAlignment;
  const cornerScore = boundaryEvidence.cornerDirectionalScore;

  let baseScore: number;
  if (rc) {
    if (normalAlign !== undefined && cornerScore !== undefined) {
      baseScore =
        areaScore * 0.10 +
        candidate.metrics.angleScore * 0.13 +
        candidate.metrics.edgeConsistency * 0.08 +
        candidate.metrics.boundaryScore * 0.06 +
        boundaryEvidence.averageSupport * 0.25 +
        boundaryEvidence.weakestSideSupport * 0.10 +
        rc.regionContrastScore * 0.12 +
        normalAlign * 0.08 +
        cornerScore * 0.08;
    } else {
      baseScore =
        areaScore * 0.12 +
        candidate.metrics.angleScore * 0.15 +
        candidate.metrics.edgeConsistency * 0.10 +
        candidate.metrics.boundaryScore * 0.07 +
        boundaryEvidence.averageSupport * 0.30 +
        boundaryEvidence.weakestSideSupport * 0.12 +
        rc.regionContrastScore * 0.14;
    }
  } else {
    if (normalAlign !== undefined && cornerScore !== undefined) {
      baseScore =
        areaScore * 0.12 +
        candidate.metrics.angleScore * 0.15 +
        candidate.metrics.edgeConsistency * 0.09 +
        candidate.metrics.boundaryScore * 0.06 +
        boundaryEvidence.averageSupport * 0.32 +
        boundaryEvidence.weakestSideSupport * 0.12 +
        normalAlign * 0.07 +
        cornerScore * 0.07;
    } else {
      baseScore =
        areaScore * 0.14 +
        candidate.metrics.angleScore * 0.17 +
        candidate.metrics.edgeConsistency * 0.1 +
        candidate.metrics.boundaryScore * 0.07 +
        boundaryEvidence.averageSupport * 0.38 +
        boundaryEvidence.weakestSideSupport * 0.14;
    }
  }

  return clampScore(baseScore * parallelismFactor);
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
  const rcOk =
    !winner.boundaryEvidence.regionContrast ||
    winner.boundaryEvidence.regionContrast.regionContrastScore >= 0.20;
  return (
    rcOk &&
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

    // An enclosing candidate claiming to be the outer physical document boundary must have
    // genuine physical contrast against its exterior. If region contrast was measured and shows
    // negligible step (< 5 intensity) with very low score (< 0.20), candidate A is a background
    // texture artifact (e.g. tile seam / grid border) and cannot subordinate B.
    if (
      candidateA.boundaryEvidence.regionContrast &&
      candidateA.boundaryEvidence.regionContrast.averageStep < 5.0 &&
      candidateA.boundaryEvidence.regionContrast.regionContrastScore < 0.20
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
  grayMap?: GrayscaleMap,
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
        grayMap,
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
  grayMap?: GrayscaleMap,
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
            grayMap,
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
              grayMap,
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
 * Applies a subtle outward apex expansion (typically 0.8% ~ 1.5-2.5px)
 * to align corners with the outer physical boundary of the paper rather
 * than the midpoint inflection of the blurred Canny gradient transition,
 * preventing clipped corner tips.
 */
export function expandCornersOutward(
  corners: DocumentCorners,
  frameWidth: number,
  frameHeight: number,
  expansionRatio = 0.008,
): DocumentCorners {
  if (expansionRatio <= 0) {
    return corners;
  }

  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  return [
    {
      x: clamp(cx + (corners[0].x - cx) * (1 + expansionRatio), 0, frameWidth),
      y: clamp(cy + (corners[0].y - cy) * (1 + expansionRatio), 0, frameHeight),
    },
    {
      x: clamp(cx + (corners[1].x - cx) * (1 + expansionRatio), 0, frameWidth),
      y: clamp(cy + (corners[1].y - cy) * (1 + expansionRatio), 0, frameHeight),
    },
    {
      x: clamp(cx + (corners[2].x - cx) * (1 + expansionRatio), 0, frameWidth),
      y: clamp(cy + (corners[2].y - cy) * (1 + expansionRatio), 0, frameHeight),
    },
    {
      x: clamp(cx + (corners[3].x - cx) * (1 + expansionRatio), 0, frameWidth),
      y: clamp(cy + (corners[3].y - cy) * (1 + expansionRatio), 0, frameHeight),
    },
  ];
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

  const expansionRatio = config.cornerExpansionRatio ?? 0.008;
  const corners =
    expansionRatio > 0
      ? expandCornersOutward(refined, edgeMap.width, edgeMap.height, expansionRatio)
      : refined;

  return {
    ...detection,
    corners,
  };
}

/**
 * Lightweight temporal prior verification.
 * Directly samples boundary support and region contrast around previousCorners
 * using a resolution-scaled search margin.
 *
 * If boundary support remains valid and geometry is intact, refines corners
 * and returns the detection immediately (~1.5-3ms total).
 * If evidence is weak or contradictory, returns null to cascade to normal multi-pass detection.
 */
export function verifyTemporalPriorCandidate(
  cv: typeof OpenCV,
  frame: AnalysisFrame,
  edges: OpenCV.Mat,
  grayscale: OpenCV.Mat,
  previousCorners: DocumentCorners,
  config: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  previousConfidence?: number | null,
): ScoredDocumentCandidate | null {
  if (
    previousConfidence !== undefined &&
    previousConfidence !== null &&
    previousConfidence < 0.75
  ) {
    return null;
  }

  const quad = validateQuadrilateral(
    previousCorners,
    frame.width,
    frame.height,
    config,
  );
  if (!quad) {
    return null;
  }

  const parallelism = calculateOppositeEdgeParallelism(quad.corners);
  if (parallelism < 0.65) {
    return null;
  }

  const searchMargin = Math.max(
    3,
    Math.min(8, Math.round(Math.min(frame.width, frame.height) * 0.012)),
  );

  const edgeMap: EdgeMap = {
    data: edges.data,
    width: frame.width,
    height: frame.height,
  };

  const grayMap: GrayscaleMap = {
    data: grayscale.data,
    width: frame.width,
    height: frame.height,
  };

  const evidenceConfig: CandidateEvidenceConfig = {
    ...config.standardEvidence,
    edgeSearchRadiusPx: searchMargin,
  };

  const boundaryEvidence = calculateCandidateBoundaryEvidence(
    edgeMap,
    quad.corners,
    evidenceConfig,
    grayMap,
  );

  const isHighTex = boundaryEvidence.textureContext?.isHighTextureBackground ?? false;
  const minAvg = isHighTex ? 0.46 : 0.40;
  const minWeak = isHighTex ? 0.18 : 0.14;

  if (
    boundaryEvidence.averageSupport < minAvg ||
    boundaryEvidence.weakestSideSupport < minWeak ||
    boundaryEvidence.strongSideCount < 3
  ) {
    return null;
  }

  const confidence = scoreDocumentCandidate(
    quad,
    config.targetAreaRatio,
    boundaryEvidence,
  );

  if (confidence < 0.72) {
    return null;
  }

  const unrefinedDetection: DocumentDetection = {
    corners: quad.corners,
    confidence,
    areaRatio: quad.metrics.areaRatio,
    edgeSupport: boundaryEvidence.averageSupport,
    geometryScore:
      quad.metrics.angleScore * 0.5 +
      quad.metrics.edgeConsistency * 0.3 +
      quad.metrics.boundaryScore * 0.2,
  };

  // Return verified prior candidate directly.
  // Re-running recursive line-fitting refinement on every frame causes outward drift/expansion
  // on high-texture backgrounds (e.g. carpet fibers or wood grain).
  return {
    detection: unrefinedDetection,
    strategy: "temporal-prior-verification",
    boundaryEvidence,
  };
}

/**
 * Lightweight temporal prior verification.
 * Directly samples boundary support and region contrast around previousCorners
 * using a resolution-scaled search margin.
 *
 * If boundary support remains valid and geometry is intact, returns the detection.
 * If evidence is weak or contradictory, returns null to cascade to normal multi-pass detection.
 */
export function verifyTemporalPrior(
  cv: typeof OpenCV,
  frame: AnalysisFrame,
  edges: OpenCV.Mat,
  grayscale: OpenCV.Mat,
  previousCorners: DocumentCorners,
  config: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  previousConfidence?: number | null,
): DocumentDetection | null {
  const candidate = verifyTemporalPriorCandidate(
    cv,
    frame,
    edges,
    grayscale,
    previousCorners,
    config,
    previousConfidence,
  );
  return candidate?.detection ?? null;
}

export function runDocumentDetection(
  cv: typeof OpenCV,
  frame: AnalysisFrame,
  config: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  previousCorners?: DocumentCorners | null,
  previousConfidence?: number | null,
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
  let adaptiveEdges: OpenCV.Mat | null = null;
  let fusedEdges: OpenCV.Mat | null = null;
  let otsuDummy: OpenCV.Mat | null = null;
  let thresholds: AdaptiveThresholds | null = null;

  try {
    cv.cvtColor(source, grayscale, cv.COLOR_RGBA2GRAY);
    const grayMap: GrayscaleMap = {
      data: grayscale.data,
      width: frame.width,
      height: frame.height,
    };
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
      grayMap,
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
            grayMap,
          )
        : [];

    const standardPool = [...standardResult.candidates, ...standardSpreads];
    let totalContourCount = standardResult.contourCount;
    let totalQuadrilateralCount =
      standardResult.quadrilateralCount + standardSpreads.length;

    // Temporal Prior Candidate: Check if previously tracked confident document is verified on current edges
    let priorCandidate: ScoredDocumentCandidate | null = null;
    if (
      previousCorners &&
      (previousConfidence === undefined ||
        previousConfidence === null ||
        previousConfidence >= 0.75)
    ) {
      priorCandidate = verifyTemporalPriorCandidate(
        cv,
        frame,
        edges,
        grayscale,
        previousCorners,
        config,
        previousConfidence,
      );
    }

    // Dynamic Candidate Competition & Corner Upgrades:
    // Standard contour candidates come first so that dynamic contours fitted to live
    // image edges are preferred over static priors when scores are equal.
    // If prior corners were suboptimal or an inner feature, standard candidates that enclose
    // or score higher than the prior will defeat it and update corners.
    const pass1Candidates = priorCandidate
      ? [...standardPool, priorCandidate]
      : standardPool;

    const standardWinner = selectBestCandidate(
      pass1Candidates,
      config,
      previousCorners,
    );

    // Fast-path 1: When prior candidate wins and is decisive/confident, return it immediately
    // to preserve thermal and CPU efficiency without running expensive subsequent passes.
    if (
      standardWinner &&
      standardWinner.strategy === "temporal-prior-verification" &&
      (isStrongDocumentWinner(standardWinner) ||
        standardWinner.detection.confidence >= 0.76)
    ) {
      return {
        detection: standardWinner.detection,
        contourCount: totalContourCount,
        quadrilateralCount: totalQuadrilateralCount,
        strategy: "temporal-prior-verification",
        previousCorners: standardWinner.detection.corners,
        previousConfidence: standardWinner.detection.confidence,
      };
    }

    // Fast-path 2: When Pass 1 produces a decisive document winner (or improves upon prior),
    // refine corners against edge lines and return immediately.
    const isPass1WinnerDecisive =
      standardWinner !== null &&
      standardWinner.strategy !== "temporal-prior-verification" &&
      (isStrongDocumentWinner(standardWinner) ||
        (standardWinner.detection.confidence >= 0.82 &&
          standardWinner.detection.areaRatio >= 0.20) ||
        (priorCandidate !== null &&
          standardWinner.detection.confidence >= 0.75));

    if (isPass1WinnerDecisive) {
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
        previousCorners: standardWinner!.detection.corners,
        previousConfidence: standardWinner!.detection.confidence,
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
      thresholds = computeAdaptiveEdgeThresholds(rawOtsu as number);

      adaptiveEdges = new cv.Mat();
      cv.Canny(
        blurred,
        adaptiveEdges,
        thresholds.cannyLow,
        thresholds.cannyHigh,
        3,
        true,
      );

      // Reconnect fragmented boundaries via conservative morphological closing (3x3)
      fusedEdges = new cv.Mat();
      cv.morphologyEx(
        adaptiveEdges,
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
        grayMap,
      );

      totalContourCount += adaptiveResult.contourCount;
      totalQuadrilateralCount += adaptiveResult.quadrilateralCount;
      adaptiveCandidates = adaptiveResult.candidates;
    } catch {
      // In case adaptive/multi-scale operations encounter unsupported WASM calls,
      // gracefully fall through to standard/fallback candidates.
    }

    // Pool candidates from standard, temporal prior, and adaptive passes
    const pooledCandidates = [
      ...pass1Candidates,
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
            grayMap,
          )
        : [];

    totalQuadrilateralCount += spreadCandidates.length;
    const allCandidates = [...pooledCandidates, ...spreadCandidates];

    const pooledWinner = selectBestCandidate(
      allCandidates,
      config,
      previousCorners,
    );

    // If pooled candidates produced a decisive, full-sized document candidate, return it
    const isDecisiveFullDocument =
      pooledWinner !== null &&
      (isStrongDocumentWinner(pooledWinner) ||
        (pooledWinner.detection.confidence >= 0.82 &&
          pooledWinner.detection.areaRatio >= 0.20));

    if (isDecisiveFullDocument) {
      const isTemporalPrior =
        pooledWinner.strategy === "temporal-prior-verification";
      return {
        detection: isTemporalPrior
          ? pooledWinner.detection
          : refineDetection(
              cv,
              pooledWinner.detection,
              currentEdgeMap,
              grayscale,
              config,
            ),
        contourCount: totalContourCount,
        quadrilateralCount: totalQuadrilateralCount,
        strategy: pooledWinner.strategy,
        previousCorners: pooledWinner.detection.corners,
        previousConfidence: pooledWinner.detection.confidence,
      };
    }

    // Pass 3: Fallback weak reconstruction (minAreaRect for rounded/clipped contours)
    // Runs when no candidate was found or when only tiny internal features (area < 0.10) were found.
    // Derive safe adaptive thresholds for low-contrast scenes
    const safePass3High = Math.min(
      config.fallbackCannyHighThreshold,
      Math.max(18, Math.round((thresholds?.cannyHigh ?? 35) * 0.55)),
    );
    const safePass3Low = Math.max(8, Math.round(safePass3High * 0.40));

    cv.Canny(
      blurred,
      edges,
      safePass3Low,
      safePass3High,
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
      grayMap,
    );

    totalContourCount += fallbackResult.contourCount;
    totalQuadrilateralCount += fallbackResult.quadrilateralCount;

    // Combine fallback candidates with earlier candidates to allow containment resolution
    // (e.g. newly discovered outer document boundary enclosing internal photo/chip from Pass 1)
    const pass3EdgeMap: EdgeMap = {
      data: edges.data,
      width: frame.width,
      height: frame.height,
    };

    const pooledPass3 = [...allCandidates, ...fallbackResult.candidates];
    const fallbackSpreads =
      pooledPass3.length >= 2
        ? generateSpreadCandidates(
            pooledPass3,
            pass3EdgeMap,
            frame.width,
            frame.height,
            config,
            grayMap,
          )
        : [];

    totalQuadrilateralCount += fallbackSpreads.length;
    const finalPool = [...pooledPass3, ...fallbackSpreads];

    const fallbackWinner = selectBestCandidate(
      finalPool,
      config,
      previousCorners,
    );

    let finalWinner = fallbackWinner;

    // Pass 4: Low-Contrast Evidence-Fused Document Recovery (P0.5)
    // Executes when Passes 1–3 fail to find a decisive, full-sized document candidate.
    // Specifically recovers white paper on white desks, light wood, pale counters, or certificates
    // where physical edge gradient is subtle (3–10) and rejected by Canny's higher thresholds,
    // or when Passes 1-3 only found an internal feature (table, photo, chip) of a larger document.
    let pass4Winner: ScoredDocumentCandidate | null = null;
    const shouldRunLowContrastRecovery =
      !finalWinner ||
      finalWinner.detection.areaRatio < 0.25 ||
      finalWinner.detection.confidence < 0.80;

    if (shouldRunLowContrastRecovery) {
      let pass4Denoised: OpenCV.Mat | null = null;
      let pass4Grad: OpenCV.Mat | null = null;
      let pass4Binary: OpenCV.Mat | null = null;
      let pass4Closed: OpenCV.Mat | null = null;
      let pass4Contours: OpenCV.MatVector | null = null;
      let pass4Hierarchy: OpenCV.Mat | null = null;
      let pass4CloseKernel: OpenCV.Mat | null = null;

      try {
        pass4Denoised = new cv.Mat();
        cv.medianBlur(grayscale, pass4Denoised, 3);

        pass4Grad = new cv.Mat();
        cv.morphologyEx(pass4Denoised, pass4Grad, cv.MORPH_GRADIENT, standardKernel);

        pass4Binary = new cv.Mat();
        cv.threshold(pass4Grad, pass4Binary, 2, 255, cv.THRESH_BINARY);

        pass4CloseKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
        pass4Closed = new cv.Mat();
        cv.morphologyEx(pass4Binary, pass4Closed, cv.MORPH_CLOSE, pass4CloseKernel);

        pass4Contours = new cv.MatVector();
        pass4Hierarchy = new cv.Mat();
        cv.findContours(
          pass4Closed,
          pass4Contours,
          pass4Hierarchy,
          cv.RETR_EXTERNAL,
          cv.CHAIN_APPROX_SIMPLE,
        );

        totalContourCount += pass4Contours.size();
        const pass4EdgeMap: EdgeMap = {
          data: pass4Closed.data,
          width: frame.width,
          height: frame.height,
        };

        const pass4Candidates: ScoredDocumentCandidate[] = [];

        for (let i = 0; i < pass4Contours.size(); i++) {
          const contour = pass4Contours.get(i);
          const approx = new cv.Mat();

          try {
            const contourArea = Math.abs(cv.contourArea(contour));
            const areaRatio = contourArea / (frame.width * frame.height);
            if (areaRatio < 0.08 || areaRatio > config.maxAreaRatio) {
              continue;
            }

            const peri = cv.arcLength(contour, true);
            const candidateBoxes: Point[][] = [];

            for (const epsRatio of [0.02, 0.03, 0.04]) {
              cv.approxPolyDP(contour, approx, peri * epsRatio, true);
              if (approx.rows === 4 && cv.isContourConvex(approx)) {
                candidateBoxes.push(readContourPoints(approx));
              }
            }

            const box = cv.boxPoints(cv.minAreaRect(contour)).map((p) => ({ x: p.x, y: p.y }));
            candidateBoxes.push(box);

            for (const corners of candidateBoxes) {
              const quad = validateQuadrilateral(corners, frame.width, frame.height, config);
              if (!quad) continue;

              // Strict geometry guards for low-contrast candidates:
              // 1. Must have nearly rectangular corners (angleScore >= 0.65)
              if (quad.metrics.angleScore < 0.65) continue;
              // 2. Must have consistent opposite edges (edgeConsistency >= 0.65)
              if (quad.metrics.edgeConsistency < 0.65) continue;
              // 2b. Opposite edge parallelism check (reject non-affine carpet texture fragments)
              const quadParallelism = calculateOppositeEdgeParallelism(quad.corners);
              if (quadParallelism < 0.65) continue;

              // 3. Document aspect ratio check (1.05 to 4.5)
              const topW = distance(quad.corners[0], quad.corners[1]);
              const botW = distance(quad.corners[3], quad.corners[2]);
              const leftH = distance(quad.corners[0], quad.corners[3]);
              const rightH = distance(quad.corners[1], quad.corners[2]);
              const avgW = (topW + botW) / 2;
              const avgH = (leftH + rightH) / 2;
              if (avgW < 1 || avgH < 1) continue;
              const ar = Math.max(avgW, avgH) / Math.min(avgW, avgH);
              if (ar < 1.05 || ar > 4.5) continue;

              // 4. Region contrast evaluation against grayscale
              const evidence = calculateCandidateBoundaryEvidence(
                pass4EdgeMap,
                quad.corners,
                config.standardEvidence,
                grayMap,
              );
              const rc = evidence.regionContrast;
              if (!rc || rc.averageStep < 1.5) {
                // Reject completely flat empty surfaces (table/floor/wall)
                continue;
              }

              // 4b. Background texture adaptivity: reject chaotic texture clumps
              if (evidence.textureContext?.isHighTextureBackground) {
                if ((evidence.edgeNormalAlignment ?? 1.0) < 0.40) continue;
                if (evidence.averageSupport < 0.35) continue;
              }

              // 5. Distributed evidence across at least 3 sides
              let supportedSides = 0;
              for (let s = 0; s < 4; s++) {
                if (evidence.sideSupport[s] >= 0.10 || rc.sideContrast[s].stepMagnitude >= 1.5) {
                  supportedSides++;
                }
              }
              if (supportedSides < 3) continue;

              totalQuadrilateralCount++;
              pass4Candidates.push(
                createScoredCandidate(quad, evidence, "low-contrast-evidence-fusion", config),
              );
            }
          } finally {
            approx.delete();
            contour.delete();
          }
        }

        if (pass4Candidates.length > 0) {
          // If earlier passes found internal features, let containment solver prefer this enclosing outer document
          const pass4Pool = finalWinner ? [finalWinner, ...pass4Candidates] : pass4Candidates;
          pass4Winner = selectBestCandidate(pass4Pool, config, previousCorners);
          if (pass4Winner && pass4Winner.detection.areaRatio >= 0.10) {
            finalWinner = pass4Winner;
          }
        }
      } catch {
        // Fall through gracefully if low-contrast pass encounters an error
      } finally {
        pass4CloseKernel?.delete();
        pass4Hierarchy?.delete();
        pass4Contours?.delete();
        pass4Closed?.delete();
        pass4Binary?.delete();
        pass4Grad?.delete();
        pass4Denoised?.delete();
      }
    }

    const finalDetection = finalWinner?.detection ?? null;
    const isTemporalPrior =
      finalWinner?.strategy === "temporal-prior-verification";
    const refinedFinal = finalDetection
      ? isTemporalPrior
        ? finalDetection
        : refineDetection(
            cv,
            finalDetection,
            { data: edges.data, width: frame.width, height: frame.height },
            grayscale,
            config,
          )
      : null;

    return {
      detection: refinedFinal,
      contourCount: totalContourCount,
      quadrilateralCount: totalQuadrilateralCount,
      strategy: finalWinner?.strategy ?? null,
      previousCorners: refinedFinal?.corners ?? null,
      previousConfidence: refinedFinal?.confidence ?? null,
    };
  } finally {
    claheResult?.delete();
    otsuDummy?.delete();
    fusedEdges?.delete();
    adaptiveEdges?.delete();
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
  previousConfidence?: number | null,
): DocumentDetection | null {
  return runDocumentDetection(
    cv,
    frame,
    config,
    previousCorners,
    previousConfidence,
  ).detection;
}
