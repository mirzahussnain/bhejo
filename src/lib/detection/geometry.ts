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
