export interface Point {
  readonly x: number;
  readonly y: number;
}

export type DocumentCorners = readonly [Point, Point, Point, Point];

export interface QuadrilateralMetrics {
  readonly area: number;
  readonly areaRatio: number;
  readonly angleScore: number;
  readonly edgeConsistency: number;
  readonly boundaryScore: number;
}

export interface QuadrilateralValidationConfig {
  readonly minAreaRatio: number;
  readonly maxAreaRatio: number;
  readonly minEdgeRatio: number;
  readonly minInteriorAngleDegrees: number;
  readonly maxInteriorAngleDegrees: number;
  readonly minAngleScore: number;
  readonly minEdgeConsistency: number;
  readonly boundaryTargetRatio: number;
}

export interface ValidQuadrilateral {
  readonly corners: DocumentCorners;
  readonly metrics: QuadrilateralMetrics;
}

const FULL_TURN_RADIANS = Math.PI * 2;

export function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) {
    return 0;
  }

  let doubledArea = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    doubledArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(doubledArea) / 2;
}

export function orderCorners(points: readonly Point[]): DocumentCorners {
  if (points.length !== 4) {
    throw new RangeError("A quadrilateral must contain exactly four corners.");
  }

  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  const clockwise = [...points].sort((first, second) => {
    const firstAngle =
      (Math.atan2(first.y - center.y, first.x - center.x) +
        FULL_TURN_RADIANS) %
      FULL_TURN_RADIANS;
    const secondAngle =
      (Math.atan2(second.y - center.y, second.x - center.x) +
        FULL_TURN_RADIANS) %
      FULL_TURN_RADIANS;
    return firstAngle - secondAngle;
  });
  const topLeftIndex = clockwise.reduce((bestIndex, point, index) => {
    const best = clockwise[bestIndex];
    return point.x + point.y < best.x + best.y ? index : bestIndex;
  }, 0);
  const ordered = [
    ...clockwise.slice(topLeftIndex),
    ...clockwise.slice(0, topLeftIndex),
  ];

  return [ordered[0], ordered[1], ordered[2], ordered[3]];
}

export function interiorAngleDegrees(
  previous: Point,
  vertex: Point,
  next: Point,
): number {
  const firstX = previous.x - vertex.x;
  const firstY = previous.y - vertex.y;
  const secondX = next.x - vertex.x;
  const secondY = next.y - vertex.y;
  const denominator = Math.hypot(firstX, firstY) * Math.hypot(secondX, secondY);

  if (denominator === 0) {
    return 0;
  }

  const cosine = Math.max(
    -1,
    Math.min(1, (firstX * secondX + firstY * secondY) / denominator),
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

export function isConvexQuadrilateral(corners: DocumentCorners): boolean {
  let direction = 0;

  for (let index = 0; index < corners.length; index += 1) {
    const first = corners[index];
    const second = corners[(index + 1) % corners.length];
    const third = corners[(index + 2) % corners.length];
    const crossProduct =
      (second.x - first.x) * (third.y - second.y) -
      (second.y - first.y) * (third.x - second.x);

    if (Math.abs(crossProduct) < Number.EPSILON) {
      return false;
    }

    const nextDirection = Math.sign(crossProduct);
    if (direction !== 0 && nextDirection !== direction) {
      return false;
    }
    direction = nextDirection;
  }

  return true;
}

function calculateAngleScore(angles: readonly number[]): number {
  const averageDeviation =
    angles.reduce((sum, angle) => sum + Math.abs(90 - angle), 0) /
    angles.length;
  return Math.max(0, 1 - averageDeviation / 90);
}

function calculateEdgeConsistency(edgeLengths: readonly number[]): number {
  const firstPair =
    Math.min(edgeLengths[0], edgeLengths[2]) /
    Math.max(edgeLengths[0], edgeLengths[2]);
  const secondPair =
    Math.min(edgeLengths[1], edgeLengths[3]) /
    Math.max(edgeLengths[1], edgeLengths[3]);
  return (firstPair + secondPair) / 2;
}

function calculateBoundaryScore(
  corners: DocumentCorners,
  frameWidth: number,
  frameHeight: number,
  targetRatio: number,
): number {
  const minimumDistance = Math.min(
    ...corners.map((point) =>
      Math.min(point.x, point.y, frameWidth - point.x, frameHeight - point.y),
    ),
  );
  const targetDistance = Math.min(frameWidth, frameHeight) * targetRatio;
  return Math.max(0, Math.min(1, minimumDistance / targetDistance));
}

export function validateQuadrilateral(
  points: readonly Point[],
  frameWidth: number,
  frameHeight: number,
  config: QuadrilateralValidationConfig,
): ValidQuadrilateral | null {
  if (
    points.length !== 4 ||
    !Number.isFinite(frameWidth) ||
    !Number.isFinite(frameHeight) ||
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    points.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x > frameWidth ||
        point.y > frameHeight,
    )
  ) {
    return null;
  }

  const corners = orderCorners(points);
  if (!isConvexQuadrilateral(corners)) {
    return null;
  }

  const area = polygonArea(corners);
  const areaRatio = area / (frameWidth * frameHeight);
  if (areaRatio < config.minAreaRatio || areaRatio > config.maxAreaRatio) {
    return null;
  }

  const edgeLengths = corners.map((point, index) =>
    distance(point, corners[(index + 1) % corners.length]),
  );
  const minimumEdgeLength =
    Math.min(frameWidth, frameHeight) * config.minEdgeRatio;
  if (edgeLengths.some((length) => length < minimumEdgeLength)) {
    return null;
  }

  const angles = corners.map((point, index) =>
    interiorAngleDegrees(
      corners[(index + corners.length - 1) % corners.length],
      point,
      corners[(index + 1) % corners.length],
    ),
  );
  if (
    angles.some(
      (angle) =>
        angle < config.minInteriorAngleDegrees ||
        angle > config.maxInteriorAngleDegrees,
    )
  ) {
    return null;
  }

  const angleScore = calculateAngleScore(angles);
  const edgeConsistency = calculateEdgeConsistency(edgeLengths);
  if (
    angleScore < config.minAngleScore ||
    edgeConsistency < config.minEdgeConsistency
  ) {
    return null;
  }

  return {
    corners,
    metrics: {
      area,
      areaRatio,
      angleScore,
      edgeConsistency,
      boundaryScore: calculateBoundaryScore(
        corners,
        frameWidth,
        frameHeight,
        config.boundaryTargetRatio,
      ),
    },
  };
}

/**
 * Tests whether a point lies inside or on the boundary of a convex
 * quadrilateral. Uses cross-product sign consistency with a small
 * epsilon for floating-point tolerance near edges.
 *
 * Works correctly regardless of clockwise/counter-clockwise corner ordering.
 */
export function isPointInsideConvexQuad(
  point: Point,
  quad: DocumentCorners,
  epsilon = 1e-6,
): boolean {
  let positiveCount = 0;
  let negativeCount = 0;

  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];

    // Cross product of edge vector (a→b) and point vector (a→point).
    const cross =
      (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);

    if (cross > epsilon) {
      positiveCount += 1;
    } else if (cross < -epsilon) {
      negativeCount += 1;
    }
    // Points within epsilon of an edge are treated as on the boundary.
  }

  // All cross products must have the same sign (or be near-zero).
  // Mixed positive and negative means the point is outside.
  return positiveCount === 0 || negativeCount === 0;
}

export const DEFAULT_CONTAINMENT_TOLERANCE_PX = 16;

/**
 * Tests whether an inner quadrilateral is geometrically contained within an outer convex quadrilateral.
 *
 * Handles rounded document corners and polygon approximation chamfering by:
 * 1. Testing that the centroid of the inner quadrilateral lies inside the unexpanded outer quad.
 * 2. Testing that all 4 inner corners lie within a bounded outward perpendicular tolerance
 *    (tolerancePx) of all 4 outer quad edges.
 *
 * Genuinely separate, overlapping, or side-by-side quadrilaterals remain strictly rejected.
 */
export function isContainedWithin(
  inner: DocumentCorners,
  outer: DocumentCorners,
  tolerancePx: number = DEFAULT_CONTAINMENT_TOLERANCE_PX,
): boolean {
  // If all 4 corners are strictly inside the unexpanded quad, it is unconditionally contained.
  if (inner.every((corner) => isPointInsideConvexQuad(corner, outer, 1e-4))) {
    return true;
  }

  // If tolerance is non-positive, strict containment was required and failed.
  if (tolerancePx <= 0) {
    return false;
  }

  // Centroid of the inner quadrilateral MUST lie inside the unexpanded outer quad.
  const innerCentroid: Point = {
    x: (inner[0].x + inner[1].x + inner[2].x + inner[3].x) / 4,
    y: (inner[0].y + inner[1].y + inner[2].y + inner[3].y) / 4,
  };
  if (!isPointInsideConvexQuad(innerCentroid, outer, 1e-4)) {
    return false;
  }

  const outerCentroid: Point = {
    x: (outer[0].x + outer[1].x + outer[2].x + outer[3].x) / 4,
    y: (outer[0].y + outer[1].y + outer[2].y + outer[3].y) / 4,
  };

  // Compute outward edge normals for each side of the outer quadrilateral.
  const edges: Array<{ start: Point; nx: number; ny: number }> = [];
  for (let i = 0; i < 4; i += 1) {
    const a = outer[i];
    const b = outer[(i + 1) % 4];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      continue;
    }

    const ux = dx / len;
    const uy = dy / len;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    // Outward normal pointing away from outer centroid
    let nx = -uy;
    let ny = ux;
    const outDx = midX - outerCentroid.x;
    const outDy = midY - outerCentroid.y;
    if (nx * outDx + ny * outDy < 0) {
      nx = -nx;
      ny = -ny;
    }

    edges.push({ start: a, nx, ny });
  }

  if (edges.length < 3) {
    return false;
  }

  // All 4 corners of inner must lie within tolerancePx outward perpendicular distance from every outer edge.
  for (const corner of inner) {
    for (const edge of edges) {
      const outwardDist =
        (corner.x - edge.start.x) * edge.nx +
        (corner.y - edge.start.y) * edge.ny;
      if (outwardDist > tolerancePx) {
        return false;
      }
    }
  }

  return true;
}

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function cornersBoundingBox(corners: DocumentCorners): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}

export function calculateBoundingBoxIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const intersectMinX = Math.max(boxA.minX, boxB.minX);
  const intersectMinY = Math.max(boxA.minY, boxB.minY);
  const intersectMaxX = Math.min(boxA.maxX, boxB.maxX);
  const intersectMaxY = Math.min(boxA.maxY, boxB.maxY);

  const intersectW = Math.max(0, intersectMaxX - intersectMinX);
  const intersectH = Math.max(0, intersectMaxY - intersectMinY);
  const intersectionArea = intersectW * intersectH;

  const areaA = Math.max(0, boxA.maxX - boxA.minX) * Math.max(0, boxA.maxY - boxA.minY);
  const areaB = Math.max(0, boxB.maxX - boxB.minX) * Math.max(0, boxB.maxY - boxB.minY);
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) {
    return 0;
  }

  return intersectionArea / unionArea;
}
