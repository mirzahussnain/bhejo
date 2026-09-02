import type { OpenCV } from "@opencvjs/web";
import {
  distance,
  isConvexQuadrilateral,
  orderCorners,
  polygonArea,
  validateQuadrilateral,
  type DocumentCorners,
  type Point,
  type QuadrilateralValidationConfig,
} from "./geometry.ts";
import type { EdgeMap } from "./candidate-evidence.ts";

export interface CornerRefinementConfig {
  readonly corridorWidthPx: number;
  readonly minEdgePixels: number;
  readonly maxCornerDisplacementPx: number;
  readonly maxAreaChangeRatio: number;
  readonly subPixelWindowSize: number;
  readonly subPixelMaxIterations: number;
  readonly subPixelEpsilon: number;
  readonly subPixelMaxDisplacementPx: number;
}

export const DEFAULT_CORNER_REFINEMENT_CONFIG: CornerRefinementConfig = {
  corridorWidthPx: 8,
  minEdgePixels: 10,
  maxCornerDisplacementPx: 14,
  maxAreaChangeRatio: 0.25,
  subPixelWindowSize: 5,
  subPixelMaxIterations: 30,
  subPixelEpsilon: 0.01,
  subPixelMaxDisplacementPx: 4,
};

export interface Line {
  readonly vx: number;
  readonly vy: number;
  readonly x0: number;
  readonly y0: number;
}

interface CorridorPixel extends Point {
  readonly t: number;
  readonly s: number;
}

/**
 * Measures the perpendicular distance from a point to the line
 * defined by two endpoints (the quad side).
 */
function perpendicularDistanceToSegment(
  point: Point,
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return distance(point, start);
  }

  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
}

/**
 * Measures the perpendicular distance from a point to an infinite line.
 */
function perpendicularDistanceToLine(point: Point, line: Line): number {
  return Math.abs((point.x - line.x0) * (-line.vy) + (point.y - line.y0) * line.vx);
}

/**
 * Fits a line to 2D points using closed-form principal component analysis (PCA).
 * Returns { vx, vy, x0, y0 } where (vx, vy) is a unit direction vector oriented
 * with referenceDir, and (x0, y0) is the centroid of the points.
 */
export function fitLinePCA(
  points: readonly Point[],
  referenceDir: Point,
): Line | null {
  if (points.length < 2) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const x0 = sumX / points.length;
  const y0 = sumY / points.length;

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const p of points) {
    const dx = p.x - x0;
    const dy = p.y - y0;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }

  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  let vx = Math.cos(theta);
  let vy = Math.sin(theta);

  if (!Number.isFinite(vx) || !Number.isFinite(vy) || Math.hypot(vx, vy) < 1e-9) {
    return null;
  }

  // Orient with reference direction
  if (vx * referenceDir.x + vy * referenceDir.y < 0) {
    vx = -vx;
    vy = -vy;
  }

  return { vx, vy, x0, y0 };
}

/**
 * Searches for and fits the true physical boundary line along a predicted quad side.
 *
 * In real documents (especially cards with rounded corners or internal features like
 * chips, barcodes, photos, or printed text), simple L2 fitting to all corridor pixels
 * can be pulled inward. This function:
 * 1. Collects edge pixels in a narrow corridor around the predicted side.
 * 2. Evaluates candidate lines (both parallel offset slices and point-pair samples).
 * 3. Scores candidates by longitudinal coherence across bins, span along the side,
 *    and outward offset (favoring the outer physical boundary over inner content).
 * 4. Fits a high-precision line to the inliers of the winning candidate.
 */
export function findPhysicalBoundaryLine(
  edgeMap: EdgeMap,
  start: Point,
  end: Point,
  centroid: Point,
  config: CornerRefinementConfig = DEFAULT_CORNER_REFINEMENT_CONFIG,
): Line | null {
  const sideLength = distance(start, end);
  if (sideLength < 1) {
    return null;
  }

  const u: Point = {
    x: (end.x - start.x) / sideLength,
    y: (end.y - start.y) / sideLength,
  };
  const mid: Point = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };

  // Compute outward normal pointing away from document centroid
  const n0: Point = { x: -u.y, y: u.x };
  const outwardDir: Point = { x: mid.x - centroid.x, y: mid.y - centroid.y };
  const dot = n0.x * outwardDir.x + n0.y * outwardDir.y;
  const n: Point = dot < 0 ? { x: -n0.x, y: -n0.y } : n0;

  const margin = Math.max(4, Math.min(16, 0.08 * sideLength));
  const corridorWidth = config.corridorWidthPx;

  const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - corridorWidth - 1));
  const maxX = Math.min(edgeMap.width - 1, Math.ceil(Math.max(start.x, end.x) + corridorWidth + 1));
  const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - corridorWidth - 1));
  const maxY = Math.min(edgeMap.height - 1, Math.ceil(Math.max(start.y, end.y) + corridorWidth + 1));

  const pixels: CorridorPixel[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (edgeMap.data[y * edgeMap.width + x] === 0) {
        continue;
      }

      const t = (x - start.x) * u.x + (y - start.y) * u.y;
      if (t < margin || t > sideLength - margin) {
        continue;
      }

      const s = (x - mid.x) * n.x + (y - mid.y) * n.y;
      if (Math.abs(s) <= corridorWidth) {
        pixels.push({ x, y, t, s });
      }
    }
  }

  if (pixels.length < config.minEdgePixels) {
    return { vx: u.x, vy: u.y, x0: start.x, y0: start.y };
  }

  // Generate candidate lines:
  const candidateLines: Line[] = [];

  // 1. Parallel offset lines along normal
  for (let offset = -corridorWidth; offset <= corridorWidth; offset += 1.0) {
    candidateLines.push({
      vx: u.x,
      vy: u.y,
      x0: mid.x + offset * n.x,
      y0: mid.y + offset * n.y,
    });
  }

  // 2. Deterministic point-pair sample lines
  const minPairDist = Math.max(15, 0.20 * sideLength);
  const nPixels = pixels.length;
  const maxPairs = 60;
  const stride = Math.max(1, Math.floor(nPixels / 15));

  for (let i = 0; i < nPixels && candidateLines.length < maxPairs + 20; i += stride) {
    const p1 = pixels[i];
    for (let j = i + stride; j < nPixels && candidateLines.length < maxPairs + 20; j += stride) {
      const p2 = pixels[j];
      if (Math.abs(p1.t - p2.t) < minPairDist) {
        continue;
      }

      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (d < 1e-6) {
        continue;
      }
      const vx = (p2.x - p1.x) / d;
      const vy = (p2.y - p1.y) / d;
      if (Math.abs(vx * u.x + vy * u.y) < 0.965) {
        // Reject lines rotated > ~15° from predicted side
        continue;
      }

      candidateLines.push({ vx, vy, x0: p1.x, y0: p1.y });
    }
  }

  // Evaluate candidate lines
  let bestScore = -1;
  let bestInliers: CorridorPixel[] = [];
  const numBins = 10;
  const inlierThreshold = 1.3;
  const spanRange = sideLength - 2 * margin;

  for (const cand of candidateLines) {
    const inliers: CorridorPixel[] = [];
    let minT = Number.POSITIVE_INFINITY;
    let maxT = Number.NEGATIVE_INFINITY;
    let sumS = 0;
    const bins = new Uint8Array(numBins);

    for (const p of pixels) {
      const dist = perpendicularDistanceToLine(p, cand);
      if (dist <= inlierThreshold) {
        inliers.push(p);
        if (p.t < minT) minT = p.t;
        if (p.t > maxT) maxT = p.t;
        sumS += p.s;
        const binIdx = Math.max(
          0,
          Math.min(numBins - 1, Math.floor(((p.t - margin) / spanRange) * numBins)),
        );
        bins[binIdx] = 1;
      }
    }

    if (inliers.length < config.minEdgePixels) {
      continue;
    }

    let coveredBins = 0;
    for (let b = 0; b < numBins; b += 1) {
      if (bins[b] > 0) coveredBins += 1;
    }

    const coverageRatio = coveredBins / numBins;
    const spanRatio = Math.max(0, maxT - minT) / sideLength;
    const meanOffset = sumS / inliers.length;
    const offsetBonus = 0.15 * Math.max(-1, Math.min(1, meanOffset / corridorWidth));
    const score = coverageRatio * 0.6 + spanRatio * 0.4 + offsetBonus;

    if (score > bestScore) {
      bestScore = score;
      bestInliers = inliers;
    }
  }

  if (bestScore >= 0.30 && bestInliers.length >= config.minEdgePixels) {
    const fitted = fitLinePCA(bestInliers, u);
    if (fitted) {
      return fitted;
    }
  }

  return { vx: u.x, vy: u.y, x0: start.x, y0: start.y };
}

/**
 * Collects edge pixels within a narrow corridor around a quad side.
 * The corridor is defined as all pixels within `corridorWidth` perpendicular
 * distance from the line segment between the two corners.
 */
export function collectEdgePixelsAlongSide(
  edgeMap: EdgeMap,
  start: Point,
  end: Point,
  corridorWidthPx: number,
): Point[] {
  const sideLength = distance(start, end);
  if (sideLength < 1) {
    return [];
  }

  const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - corridorWidthPx));
  const maxX = Math.min(edgeMap.width - 1, Math.ceil(Math.max(start.x, end.x) + corridorWidthPx));
  const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - corridorWidthPx));
  const maxY = Math.min(edgeMap.height - 1, Math.ceil(Math.max(start.y, end.y) + corridorWidthPx));

  // Direction vector for the segment, used to check that pixels are
  // between the two endpoints (with a small margin).
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Exclude pixels very close to corners to avoid cross-side contamination.
  const marginRatio = 0.08;

  const pixels: Point[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (edgeMap.data[y * edgeMap.width + x] === 0) {
        continue;
      }

      // Project this pixel onto the segment direction.
      const t = ((x - start.x) * dx + (y - start.y) * dy) / (sideLength * sideLength);
      if (t < marginRatio || t > 1 - marginRatio) {
        continue;
      }

      if (perpendicularDistanceToSegment({ x, y }, start, end) <= corridorWidthPx) {
        pixels.push({ x, y });
      }
    }
  }

  return pixels;
}

/**
 * Fits a line to a set of 2D points using OpenCV's fitLine (DIST_L2).
 * Returns the line in (vx, vy, x0, y0) parametric form, or null if fitting fails.
 */
export function fitLineToPoints(
  cv: typeof OpenCV,
  points: readonly Point[],
): Line | null {
  if (points.length < 2) {
    return null;
  }

  const pointsMat = cv.matFromArray(
    points.length,
    1,
    cv.CV_32FC2,
    points.flatMap((point) => [point.x, point.y]),
  );
  const lineOutput = new cv.Mat();

  try {
    cv.fitLine(pointsMat, lineOutput, cv.DIST_L2, 0, 0.01, 0.01);

    const vx = lineOutput.data32F[0];
    const vy = lineOutput.data32F[1];
    const x0 = lineOutput.data32F[2];
    const y0 = lineOutput.data32F[3];

    if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(x0) || !Number.isFinite(y0)) {
      return null;
    }

    // Direction vector must have nonzero length.
    if (Math.hypot(vx, vy) < 1e-9) {
      return null;
    }

    return { vx, vy, x0, y0 };
  } catch {
    return null;
  } finally {
    lineOutput.delete();
    pointsMat.delete();
  }
}

/**
 * Computes the intersection of two parametric lines.
 * Returns null if the lines are effectively parallel.
 */
export function intersectLines(lineA: Line, lineB: Line): Point | null {
  // Solve: (x0a + t*vxa, y0a + t*vya) = (x0b + s*vxb, y0b + s*vyb)
  const determinant = lineA.vx * lineB.vy - lineA.vy * lineB.vx;

  if (Math.abs(determinant) < 1e-9) {
    return null;
  }

  const diffX = lineB.x0 - lineA.x0;
  const diffY = lineB.y0 - lineA.y0;
  const t = (diffX * lineB.vy - diffY * lineB.vx) / determinant;

  const x = lineA.x0 + t * lineA.vx;
  const y = lineA.y0 + t * lineA.vy;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

/**
 * Attempts to refine quad corners by searching for the physical boundary
 * lines along each side and intersecting adjacent lines.
 *
 * Falls back to original corners whenever refinement would produce
 * a worse result.
 */
export function refineCorners(
  cv: typeof OpenCV,
  corners: DocumentCorners,
  edgeMap: EdgeMap,
  frameWidth: number,
  frameHeight: number,
  validationConfig: QuadrilateralValidationConfig,
  config: CornerRefinementConfig = DEFAULT_CORNER_REFINEMENT_CONFIG,
): DocumentCorners {
  const originalArea = polygonArea(corners);
  if (originalArea <= 0) {
    return corners;
  }

  const centroid: Point = {
    x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
    y: corners.reduce((sum, p) => sum + p.y, 0) / 4,
  };

  // Collect edge pixels for each side: side i connects corner i to corner (i+1)%4.
  const sidePairs: Array<[Point, Point]> = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  const fittedLines = sidePairs.map(([start, end]) =>
    findPhysicalBoundaryLine(edgeMap, start, end, centroid, config),
  );

  // Intersect adjacent lines to get refined corners.
  // Corner i is at the intersection of side (i-1+4)%4 and side i.
  const refined: (Point | null)[] = [];
  for (let index = 0; index < 4; index += 1) {
    const previousSide = fittedLines[(index + 3) % 4];
    const currentSide = fittedLines[index];

    if (!previousSide || !currentSide) {
      refined.push(null);
      continue;
    }

    const intersection = intersectLines(previousSide, currentSide);
    if (!intersection) {
      refined.push(null);
      continue;
    }

    // Reject if the refined corner moved too far from the original.
    if (distance(intersection, corners[index]) > config.maxCornerDisplacementPx) {
      refined.push(null);
      continue;
    }

    // Reject if the refined corner is outside the frame.
    if (intersection.x < 0 || intersection.y < 0 || intersection.x > frameWidth || intersection.y > frameHeight) {
      refined.push(null);
      continue;
    }

    refined.push(intersection);
  }

  // Build the final corners, using refined where available, original otherwise.
  const result: DocumentCorners = [
    refined[0] ?? corners[0],
    refined[1] ?? corners[1],
    refined[2] ?? corners[2],
    refined[3] ?? corners[3],
  ];

  // Validate the refined quad.
  if (!isConvexQuadrilateral(result)) {
    return corners;
  }

  const refinedArea = polygonArea(result);
  if (refinedArea <= 0) {
    return corners;
  }

  const areaChangeRatio = Math.abs(refinedArea - originalArea) / originalArea;
  if (areaChangeRatio > config.maxAreaChangeRatio) {
    return corners;
  }

  // Run full geometry validation to ensure refined corners still pass.
  const validated = validateQuadrilateral(result, frameWidth, frameHeight, validationConfig);
  if (!validated) {
    return corners;
  }

  return validated.corners;
}

/**
 * Applies OpenCV cornerSubPix to each corner of the quad for sub-pixel
 * precision. Each corner is validated independently; if it moves too
 * far or produces an invalid result, the pre-refinement position is kept.
 */
export function refineSubPixel(
  cv: typeof OpenCV,
  corners: DocumentCorners,
  grayscale: OpenCV.Mat,
  config: CornerRefinementConfig = DEFAULT_CORNER_REFINEMENT_CONFIG,
): DocumentCorners {
  // cornerSubPix requires Mat of CV_32FC2 corners.
  const cornersMat = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    corners.flatMap((corner) => [corner.x, corner.y]),
  );
  const criteria = new cv.TermCriteria(
    cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
    config.subPixelMaxIterations,
    config.subPixelEpsilon,
  );

  try {
    cv.cornerSubPix(
      grayscale,
      cornersMat,
      new cv.Size(config.subPixelWindowSize, config.subPixelWindowSize),
      new cv.Size(-1, -1),
      criteria,
    );

    const refined: Point[] = [];
    for (let index = 0; index < 4; index += 1) {
      const rx = cornersMat.data32F[index * 2];
      const ry = cornersMat.data32F[index * 2 + 1];

      if (
        !Number.isFinite(rx) ||
        !Number.isFinite(ry) ||
        distance({ x: rx, y: ry }, corners[index]) > config.subPixelMaxDisplacementPx
      ) {
        refined.push(corners[index]);
      } else {
        refined.push({ x: rx, y: ry });
      }
    }

    const ordered = orderCorners(refined);

    if (!isConvexQuadrilateral(ordered)) {
      return corners;
    }

    return ordered;
  } catch {
    // cornerSubPix may not be available in all OpenCV WASM builds.
    return corners;
  } finally {
    cornersMat.delete();
  }
}
