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
  maxDimension: 2_400,
  maxPixels: 6_000_000,
  minimumAreaRatio: 0.002,
};

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function isValidPerspectiveQuadrilateral(
  corners: DocumentCorners,
  source: PerspectiveOutputDimensions,
  config: Pick<PerspectiveTransformConfig, "minimumAreaRatio"> =
    DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
): boolean {
  if (
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    source.width <= 0 ||
    source.height <= 0 ||
    corners.some(
      (corner) =>
        !isFinitePoint(corner) ||
        corner.x < 0 ||
        corner.y < 0 ||
        corner.x > source.width ||
        corner.y > source.height,
    )
  ) {
    return false;
  }

  const uniqueCornerCount = new Set(
    corners.map((corner) => `${corner.x}:${corner.y}`),
  ).size;
  if (uniqueCornerCount !== 4 || !isConvexQuadrilateral(corners)) {
    return false;
  }

  return polygonArea(corners) / (source.width * source.height) >= config.minimumAreaRatio;
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
  const sourceWidth = (topWidth + bottomWidth) / 2;
  const sourceHeight = (leftHeight + rightHeight) / 2;

  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1
  ) {
    return null;
  }

  const dimensionScale = Math.min(
    1,
    config.maxDimension / Math.max(sourceWidth, sourceHeight),
  );
  const pixelScale = Math.min(
    1,
    Math.sqrt(config.maxPixels / (sourceWidth * sourceHeight)),
  );
  const scale = Math.min(dimensionScale, pixelScale);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function warpPerspectiveToCanvas(
  cv: typeof OpenCV,
  sourceCanvas: HTMLCanvasElement,
  corners: DocumentCorners,
  targetCanvas: HTMLCanvasElement,
  config: PerspectiveTransformConfig = DEFAULT_PERSPECTIVE_TRANSFORM_CONFIG,
): PerspectiveOutputDimensions {
  const sourceDimensions = {
    width: sourceCanvas.width,
    height: sourceCanvas.height,
  };
  if (!isValidPerspectiveQuadrilateral(corners, sourceDimensions, config)) {
    throw new Error("The document edges are not usable for correction.");
  }

  const output = calculatePerspectiveOutputDimensions(corners, config);
  if (!output) {
    throw new Error("The document size is not usable for correction.");
  }

  const source = cv.imread(sourceCanvas);
  const transformSource = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    corners.flatMap((corner) => [corner.x, corner.y]),
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
      source,
      warped,
      transform,
      new cv.Size(output.width, output.height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar(),
    );
    targetCanvas.width = output.width;
    targetCanvas.height = output.height;
    cv.imshow(targetCanvas, warped);
    return output;
  } finally {
    warped.delete();
    transform.delete();
    transformDestination.delete();
    transformSource.delete();
    source.delete();
  }
}
