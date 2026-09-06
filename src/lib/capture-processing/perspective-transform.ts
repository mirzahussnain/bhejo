import type { OpenCV } from "@opencvjs/web";
import {
  distance,
  isConvexQuadrilateral,
  polygonArea,
  type DocumentCorners,
  type Point,
} from "../detection/geometry.ts";

export interface PerspectiveTransformConfig {
  readonly maxDimension: number;
  readonly maxPixels: number;
  readonly minimumAreaRatio: number;
}

export interface PerspectiveOutputDimensions {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG: PerspectiveTransformConfig = {
  maxDimension: 4_096,
  maxPixels: 16_000_000,
  minimumAreaRatio: 0.002,
};

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function clampCornersToSourceDimensions(
  corners: DocumentCorners,
  source: PerspectiveOutputDimensions,
): DocumentCorners {
  return [
    {
      x: Math.max(0, Math.min(source.width, corners[0].x)),
      y: Math.max(0, Math.min(source.height, corners[0].y)),
    },
    {
      x: Math.max(0, Math.min(source.width, corners[1].x)),
      y: Math.max(0, Math.min(source.height, corners[1].y)),
    },
    {
      x: Math.max(0, Math.min(source.width, corners[2].x)),
      y: Math.max(0, Math.min(source.height, corners[2].y)),
    },
    {
      x: Math.max(0, Math.min(source.width, corners[3].x)),
      y: Math.max(0, Math.min(source.height, corners[3].y)),
    },
  ];
}

/**
 * Expands quadrilateral corners outwards from its centroid by a small safety margin (default 1.5%).
 * Prevents clipping edge borders, stamps, and passport edge threads while keeping background inclusion < 3%.
 * Clamps strictly within source bounds.
 */
export function expandCornersWithSafetyMargin(
  corners: DocumentCorners,
  sourceDimensions: PerspectiveOutputDimensions,
  marginRatio = 0.015,
): DocumentCorners {
  if (marginRatio <= 0) {
    return clampCornersToSourceDimensions(corners, sourceDimensions);
  }

  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;

  const expanded: DocumentCorners = [
    {
      x: cx + (corners[0].x - cx) * (1 + marginRatio),
      y: cy + (corners[0].y - cy) * (1 + marginRatio),
    },
    {
      x: cx + (corners[1].x - cx) * (1 + marginRatio),
      y: cy + (corners[1].y - cy) * (1 + marginRatio),
    },
    {
      x: cx + (corners[2].x - cx) * (1 + marginRatio),
      y: cy + (corners[2].y - cy) * (1 + marginRatio),
    },
    {
      x: cx + (corners[3].x - cx) * (1 + marginRatio),
      y: cy + (corners[3].y - cy) * (1 + marginRatio),
    },
  ];

  return clampCornersToSourceDimensions(expanded, sourceDimensions);
}

export function isValidPerspectiveQuadrilateral(
  corners: DocumentCorners,
  source: PerspectiveOutputDimensions,
  config: Pick<PerspectiveTransformConfig, "minimumAreaRatio"> =
    DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
): boolean {
  const EPSILON = 1e-4;
  if (
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    source.width <= 0 ||
    source.height <= 0 ||
    corners.some(
      (corner) =>
        !isFinitePoint(corner) ||
        corner.x < -EPSILON ||
        corner.y < -EPSILON ||
        corner.x > source.width + EPSILON ||
        corner.y > source.height + EPSILON,
    )
  ) {
    return false;
  }

  const clamped = clampCornersToSourceDimensions(corners, source);
  const uniqueCornerCount = new Set(
    clamped.map((corner) => `${corner.x}:${corner.y}`),
  ).size;
  if (uniqueCornerCount !== 4 || !isConvexQuadrilateral(clamped)) {
    return false;
  }

  return (
    polygonArea(clamped) / (source.width * source.height) >=
    config.minimumAreaRatio
  );
}

/**
 * Known physical standard document aspect ratios (longer dimension / shorter dimension).
 * Snapped only when the estimated ratio is within standard snapping tolerance (<= 2.0%).
 */
export const STANDARD_DOCUMENT_ASPECT_RATIOS = [
  { name: "ISO A/B series (A4, A5, B5, Passport single page)", ratio: Math.SQRT2 }, // ~1.4142
  { name: "ISO/IEC 7810 ID-1 (Credit/ID card)", ratio: 85.6 / 53.98 },              // ~1.5858
  { name: "US Letter", ratio: 11.0 / 8.5 },                                         // ~1.2941
  { name: "Passport two-page spread (B6)", ratio: 176 / 125 },                     // ~1.4080
] as const;

export const MIN_PLAUSIBLE_DOCUMENT_ASPECT_RATIO = 0.20; // 5:1 portrait receipt
export const MAX_PLAUSIBLE_DOCUMENT_ASPECT_RATIO = 5.00; // 5:1 landscape panoramic

/**
 * Estimates the physical aspect ratio (width / height) of a quadrilateral
 * using Zhengyou Zhang's projective rectification model under perspective
 * distortion, with robust single-axis foreshortening compensation and safe
 * Euclidean fallback.
 */
export function estimatePhysicalAspectRatio(corners: DocumentCorners): number {
  if (
    corners.length !== 4 ||
    corners.some((p) => !isFinitePoint(p) || p.x < 0 || p.y < 0)
  ) {
    return 1;
  }

  const [c0, c1, c2, c3] = corners;

  const topWidth = distance(c0, c1);
  const bottomWidth = distance(c3, c2);
  const leftHeight = distance(c0, c3);
  const rightHeight = distance(c1, c2);

  const avgWidth = (topWidth + bottomWidth) / 2;
  const avgHeight = (leftHeight + rightHeight) / 2;

  if (avgWidth <= 0 || avgHeight <= 0 || !Number.isFinite(avgWidth) || !Number.isFinite(avgHeight)) {
    return 1;
  }

  const fallbackRatio = avgWidth / avgHeight;

  // Vanishing point calculation in homogeneous coordinates
  // Horizontal lines: L_top (c0 -> c1) and L_bot (c3 -> c2)
  const lTop = [
    c0.y - c1.y,
    c1.x - c0.x,
    c0.x * c1.y - c1.x * c0.y,
  ];
  const lBot = [
    c3.y - c2.y,
    c2.x - c3.x,
    c3.x * c2.y - c2.x * c3.y,
  ];

  // Vertical lines: L_left (c0 -> c3) and L_right (c1 -> c2)
  const lLeft = [
    c0.y - c3.y,
    c3.x - c0.x,
    c0.x * c3.y - c3.x * c0.y,
  ];
  const lRight = [
    c1.y - c2.y,
    c2.x - c1.x,
    c1.x * c2.y - c2.x * c1.y,
  ];

  // Vanishing points: v1 = lTop x lBot, v2 = lLeft x lRight
  const v1 = [
    lTop[1] * lBot[2] - lTop[2] * lBot[1],
    lTop[2] * lBot[0] - lTop[0] * lBot[2],
    lTop[0] * lBot[1] - lTop[1] * lBot[0],
  ];
  const v2 = [
    lLeft[1] * lRight[2] - lLeft[2] * lRight[1],
    lLeft[2] * lRight[0] - lLeft[0] * lRight[2],
    lLeft[0] * lRight[1] - lLeft[1] * lRight[0],
  ];

  const hasFiniteV1 = Math.abs(v1[2]) > 1e-6;
  const hasFiniteV2 = Math.abs(v2[2]) > 1e-6;

  const centerX = (c0.x + c1.x + c2.x + c3.x) / 4;
  const centerY = (c0.y + c1.y + c2.y + c3.y) / 4;
  const diag = Math.hypot(avgWidth, avgHeight);

  let estimatedRatio: number | null = null;

  // Case A: Full 2D Projective Rectification (Zhang's white-board rectification model)
  if (hasFiniteV1 && hasFiniteV2) {
    const v1x = v1[0] / v1[2] - centerX;
    const v1y = v1[1] / v1[2] - centerY;
    const v2x = v2[0] / v2[2] - centerX;
    const v2y = v2[1] / v2[2] - centerY;

    const dot = v1x * v2x + v1y * v2y;
    const fSquared = -dot;

    // Strict numerical guard: f² must be strictly positive and within physical camera range
    if (fSquared > 0) {
      const f = Math.sqrt(fSquared);
      if (f >= 0.3 * diag && f <= 8.0 * diag) {
        // Compute 3D direction vectors to vanishing points
        const d1 = [v1x, v1y, f];
        const d2 = [v2x, v2y, f];

        // Normal to document plane in 3D: N = d1 x d2
        const nx = d1[1] * d2[2] - d1[2] * d2[1];
        const ny = d1[2] * d2[0] - d1[0] * d2[2];
        const nz = d1[0] * d2[1] - d1[1] * d2[0];
        const normN = Math.hypot(nx, ny, nz);

        if (normN > 1e-9) {
          let n = [nx / normN, ny / normN, nz / normN];
          if (n[2] < 0) {
            n = [-n[0], -n[1], -n[2]];
          }

          // Back-project each 2D corner along camera ray r_i to intersect plane n
          const p3D: Array<[number, number, number]> = [];
          let allDepthsValid = true;

          for (const pt of [c0, c1, c2, c3]) {
            const rx = (pt.x - centerX) / f;
            const ry = (pt.y - centerY) / f;
            const rz = 1.0;
            const denom = n[0] * rx + n[1] * ry + n[2] * rz;

            if (denom <= 1e-6) {
              allDepthsValid = false;
              break;
            }

            const z = 1.0 / denom;
            p3D.push([rx * z * f, ry * z * f, z * f]);
          }

          if (allDepthsValid && p3D.length === 4) {
            const top3D = Math.hypot(p3D[1][0] - p3D[0][0], p3D[1][1] - p3D[0][1], p3D[1][2] - p3D[0][2]);
            const bot3D = Math.hypot(p3D[2][0] - p3D[3][0], p3D[2][1] - p3D[3][1], p3D[2][2] - p3D[3][2]);
            const left3D = Math.hypot(p3D[3][0] - p3D[0][0], p3D[3][1] - p3D[0][1], p3D[3][2] - p3D[0][2]);
            const right3D = Math.hypot(p3D[2][0] - p3D[1][0], p3D[2][1] - p3D[1][1], p3D[2][2] - p3D[1][2]);

            const w3D = (top3D + bot3D) / 2;
            const h3D = (left3D + right3D) / 2;

            if (w3D > 0 && h3D > 0) {
              const ratio = w3D / h3D;
              if (
                Number.isFinite(ratio) &&
                ratio >= MIN_PLAUSIBLE_DOCUMENT_ASPECT_RATIO &&
                ratio <= MAX_PLAUSIBLE_DOCUMENT_ASPECT_RATIO
              ) {
                estimatedRatio = ratio;
              }
            }
          }
        }
      }
    }
  }

  // Case B: Single-Axis Convergence (1-point perspective)
  // Occurs when phone is tilted along one axis (e.g. horizontal edges parallel, vertical converge)
  if (estimatedRatio === null) {
    const deltaW = Math.abs(bottomWidth - topWidth) / avgWidth;
    const deltaH = Math.abs(rightHeight - leftHeight) / avgHeight;

    const fNominal = 1.18 * Math.max(avgWidth, avgHeight);

    if (deltaW >= 0.08 && deltaW >= deltaH && topWidth > 0 && bottomWidth > 0) {
      // Tilt is vertical: bottom edge is closer (Z=1), top edge is further (Z=bottomWidth/topWidth)
      const zTop = bottomWidth / topWidth;
      const zBot = 1.0;

      const p0 = [(c0.x - centerX) * zTop / fNominal, (c0.y - centerY) * zTop / fNominal, zTop];
      const p1 = [(c1.x - centerX) * zTop / fNominal, (c1.y - centerY) * zTop / fNominal, zTop];
      const p2 = [(c2.x - centerX) * zBot / fNominal, (c2.y - centerY) * zBot / fNominal, zBot];
      const p3 = [(c3.x - centerX) * zBot / fNominal, (c3.y - centerY) * zBot / fNominal, zBot];

      const top3D = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const bot3D = Math.hypot(p2[0] - p3[0], p2[1] - p3[1], p2[2] - p3[2]);
      const left3D = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
      const right3D = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);

      const w3D = (top3D + bot3D) / 2;
      const h3D = (left3D + right3D) / 2;

      if (w3D > 0 && h3D > 0) {
        estimatedRatio = w3D / h3D;
      }
    } else if (deltaH >= 0.08 && deltaH > deltaW && leftHeight > 0 && rightHeight > 0) {
      // Tilt is horizontal: left edge is closer (Z=1), right edge is further (Z=leftHeight/rightHeight)
      const zRight = leftHeight / rightHeight;
      const zLeft = 1.0;

      const p0 = [(c0.x - centerX) * zLeft / fNominal, (c0.y - centerY) * zLeft / fNominal, zLeft];
      const p1 = [(c1.x - centerX) * zRight / fNominal, (c1.y - centerY) * zRight / fNominal, zRight];
      const p2 = [(c2.x - centerX) * zRight / fNominal, (c2.y - centerY) * zRight / fNominal, zRight];
      const p3 = [(c3.x - centerX) * zLeft / fNominal, (c3.y - centerY) * zLeft / fNominal, zLeft];

      const top3D = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const bot3D = Math.hypot(p2[0] - p3[0], p2[1] - p3[1], p2[2] - p3[2]);
      const left3D = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
      const right3D = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);

      const w3D = (top3D + bot3D) / 2;
      const h3D = (left3D + right3D) / 2;

      if (w3D > 0 && h3D > 0) {
        estimatedRatio = w3D / h3D;
      }
    }
  }

  // Case C: Fallback to safe Euclidean side ratios
  let finalRatio = estimatedRatio ?? fallbackRatio;

  // Guard against extreme / impossible estimates
  if (
    !Number.isFinite(finalRatio) ||
    finalRatio < MIN_PLAUSIBLE_DOCUMENT_ASPECT_RATIO ||
    finalRatio > MAX_PLAUSIBLE_DOCUMENT_ASPECT_RATIO
  ) {
    finalRatio = fallbackRatio;
  }

  // Safeguard: do not allow projective estimate to deviate excessively from Euclidean
  // unless there is significant trapezoidal convergence
  const deltaMax = Math.max(
    Math.abs(bottomWidth - topWidth) / avgWidth,
    Math.abs(rightHeight - leftHeight) / avgHeight,
  );
  if (deltaMax < 0.10 && Math.abs(finalRatio - fallbackRatio) / fallbackRatio > 0.25) {
    finalRatio = fallbackRatio;
  }

  // Standard Document Aspect Ratio Snapping
  // Snapped strictly if:
  // 1. There is measurable perspective convergence (deltaMax >= 0.08), so we know
  //    it was tilted and we are restoring physical dimensions.
  // 2. The estimate is within 6.5% of a known international document standard
  //    (well below the 8.5% gap between US Letter and A4, and 12% gap to ID cards).
  // Flat/affine documents (deltaMax < 0.08) are left completely untouched.
  if (deltaMax >= 0.08) {
    const normalizedRatio = finalRatio >= 1 ? finalRatio : 1 / finalRatio;
    for (const std of STANDARD_DOCUMENT_ASPECT_RATIOS) {
      const diff = Math.abs(normalizedRatio - std.ratio) / std.ratio;
      if (diff <= 0.065) {
        finalRatio = finalRatio >= 1 ? std.ratio : 1 / std.ratio;
        break;
      }
    }
  }

  return finalRatio;
}

export function calculatePerspectiveOutputDimensions(
  corners: DocumentCorners,
  config: Pick<PerspectiveTransformConfig, "maxDimension" | "maxPixels"> =
    DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
): PerspectiveOutputDimensions | null {
  if (
    !Number.isFinite(config.maxDimension) ||
    !Number.isFinite(config.maxPixels) ||
    config.maxDimension <= 0 ||
    config.maxPixels <= 0
  ) {
    return null;
  }

  const topWidth = distance(corners[0], corners[1]);
  const bottomWidth = distance(corners[3], corners[2]);
  const leftHeight = distance(corners[0], corners[3]);
  const rightHeight = distance(corners[1], corners[2]);
  const sourceWidth = Math.max(topWidth, bottomWidth);
  const sourceHeight = Math.max(leftHeight, rightHeight);

  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1
  ) {
    return null;
  }

  // Compute foreshortening-compensated physical aspect ratio (width / height)
  const physicalAspectRatio = estimatePhysicalAspectRatio(corners);

  // Compute target rectangular dimensions that preserve the maximum captured resolution
  // while ensuring the rectified output matches physical aspect ratio
  let targetWidth: number;
  let targetHeight: number;

  if (physicalAspectRatio >= 1) {
    // Landscape or square-ish document
    targetWidth = sourceWidth;
    targetHeight = Math.round(targetWidth / physicalAspectRatio);

    if (targetHeight < sourceHeight) {
      targetHeight = sourceHeight;
      targetWidth = Math.round(targetHeight * physicalAspectRatio);
    }
  } else {
    // Portrait document
    targetHeight = sourceHeight;
    targetWidth = Math.round(targetHeight * physicalAspectRatio);

    if (targetWidth < sourceWidth) {
      targetWidth = sourceWidth;
      targetHeight = Math.round(targetWidth / physicalAspectRatio);
    }
  }

  const dimensionScale = Math.min(
    1,
    config.maxDimension / Math.max(targetWidth, targetHeight),
  );
  const pixelScale = Math.min(
    1,
    Math.sqrt(config.maxPixels / (targetWidth * targetHeight)),
  );
  const scale = Math.min(dimensionScale, pixelScale);

  return {
    width: Math.max(1, Math.round(targetWidth * scale)),
    height: Math.max(1, Math.round(targetHeight * scale)),
  };
}

export interface WarpedPerspectiveResult {
  readonly warpedMat: InstanceType<typeof OpenCV.Mat>;
  readonly dimensions: PerspectiveOutputDimensions;
}

export function warpPerspectiveMat(
  cv: typeof OpenCV,
  sourceMat: InstanceType<typeof OpenCV.Mat>,
  corners: DocumentCorners,
  config: PerspectiveTransformConfig = DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
  marginRatio = 0.015,
): WarpedPerspectiveResult {
  const sourceDimensions = {
    width: sourceMat.cols,
    height: sourceMat.rows,
  };
  if (!isValidPerspectiveQuadrilateral(corners, sourceDimensions, config)) {
    throw new Error("The document edges are not usable for correction.");
  }

  const safeCorners = expandCornersWithSafetyMargin(
    corners,
    sourceDimensions,
    marginRatio,
  );
  const output = calculatePerspectiveOutputDimensions(safeCorners, config);
  if (!output) {
    throw new Error("The document size is not usable for correction.");
  }

  const transformSource = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    safeCorners.flatMap((corner) => [corner.x, corner.y]),
  );
  const transformDestination = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    output.width - 1,
    0,
    output.width - 1,
    output.height - 1,
    0,
    output.height - 1,
  ]);
  const transform = cv.getPerspectiveTransform(
    transformSource,
    transformDestination,
  );
  const warped = new cv.Mat();

  try {
    cv.warpPerspective(
      sourceMat,
      warped,
      transform,
      new cv.Size(output.width, output.height),
      cv.INTER_CUBIC,
      cv.BORDER_REPLICATE,
      new cv.Scalar(),
    );
    return {
      warpedMat: warped,
      dimensions: output,
    };
  } catch (err) {
    warped.delete();
    throw err;
  } finally {
    transform.delete();
    transformDestination.delete();
    transformSource.delete();
  }
}

export function warpPerspectiveToMat(
  cv: typeof OpenCV,
  sourceCanvas: HTMLCanvasElement,
  corners: DocumentCorners,
  config: PerspectiveTransformConfig = DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
  marginRatio = 0.015,
): WarpedPerspectiveResult {
  const source = cv.imread(sourceCanvas);
  try {
    return warpPerspectiveMat(cv, source, corners, config, marginRatio);
  } finally {
    source.delete();
  }
}

export function warpPerspectiveToCanvas(
  cv: typeof OpenCV,
  sourceCanvas: HTMLCanvasElement,
  corners: DocumentCorners,
  targetCanvas: HTMLCanvasElement,
  config: PerspectiveTransformConfig = DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
  marginRatio = 0.015,
): PerspectiveOutputDimensions {
  const { warpedMat, dimensions } = warpPerspectiveToMat(
    cv,
    sourceCanvas,
    corners,
    config,
    marginRatio,
  );
  try {
    targetCanvas.width = dimensions.width;
    targetCanvas.height = dimensions.height;
    cv.imshow(targetCanvas, warpedMat);
    return dimensions;
  } finally {
    warpedMat.delete();
  }
}
