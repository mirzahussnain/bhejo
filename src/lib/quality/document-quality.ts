import type { AnalysisFrame } from "../camera/frame-sampler.ts";
import type { DocumentDetection } from "../detection/document-detection.ts";
import {
  distance,
  interiorAngleDegrees,
  isConvexQuadrilateral,
  type DocumentCorners,
  type Point,
} from "../detection/geometry.ts";

export type QualityGuidance =
  | "move-closer"
  | "move-away-from-edge"
  | "move-into-better-light"
  | "hold-still"
  | "move-into-position"
  | "ready";

export interface DocumentQuality {
  readonly isAcceptable: boolean;
  readonly coverage: boolean;
  readonly boundaries: boolean;
  readonly sharpness: boolean;
  readonly brightness: boolean;
  readonly geometry: boolean;
  readonly guidance: QualityGuidance;
}

export interface DocumentQualityConfig {
  readonly minCoverageRatio: number;
  readonly boundaryMarginRatio: number;
  readonly minBrightness: number;
  readonly maxBrightness: number;
  readonly minSharpnessVariance: number;
  readonly minEdgeRatio: number;
  readonly minInteriorAngleDegrees: number;
  readonly maxInteriorAngleDegrees: number;
  readonly minOppositeEdgeConsistency: number;
}

export const DEFAULT_DOCUMENT_QUALITY_CONFIG: DocumentQualityConfig = {
  minCoverageRatio: 0.12,
  boundaryMarginRatio: 0.025,
  minBrightness: 55,
  maxBrightness: 225,
  minSharpnessVariance: 110,
  minEdgeRatio: 0.06,
  minInteriorAngleDegrees: 18,
  maxInteriorAngleDegrees: 162,
  minOppositeEdgeConsistency: 0.08,
};

export interface PixelBuffer {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface QualityInput {
  readonly corners: DocumentCorners;
  readonly areaRatio: number;
  readonly pixels: PixelBuffer;
}

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function hasSafeBoundaries(
  corners: DocumentCorners,
  width: number,
  height: number,
  marginRatio: number,
): boolean {
  const margin = Math.min(width, height) * marginRatio;
  return corners.every(
    (point) =>
      point.x >= margin &&
      point.y >= margin &&
      point.x <= width - margin &&
      point.y <= height - margin,
  );
}

function hasPlausibleGeometry(
  corners: DocumentCorners,
  width: number,
  height: number,
  config: DocumentQualityConfig,
): boolean {
  if (
    width <= 0 ||
    height <= 0 ||
    corners.some((point) => !isFinitePoint(point)) ||
    !isConvexQuadrilateral(corners)
  ) {
    return false;
  }

  const edges = corners.map((point, index) =>
    distance(point, corners[(index + 1) % corners.length]),
  );
  const minimumEdge = Math.min(width, height) * config.minEdgeRatio;
  if (edges.some((edge) => edge < minimumEdge)) {
    return false;
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
    return false;
  }

  const oppositePairs = [
    Math.min(edges[0], edges[2]) / Math.max(edges[0], edges[2]),
    Math.min(edges[1], edges[3]) / Math.max(edges[1], edges[3]),
  ];
  return oppositePairs.every(
    (consistency) => consistency >= config.minOppositeEdgeConsistency,
  );
}

function isInsideDocument(point: Point, corners: DocumentCorners): boolean {
  let inside = false;

  for (let index = 0, previous = corners.length - 1; index < corners.length; previous = index++) {
    const current = corners[index];
    const prior = corners[previous];
    const intersects =
      current.y > point.y !== prior.y > point.y &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) /
          (prior.y - current.y) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function luminance(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const index = (y * width + x) * 4;
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function calculateRegionMetrics(
  pixels: PixelBuffer,
  corners: DocumentCorners,
): { readonly brightness: number; readonly sharpnessVariance: number } | null {
  const { data, width, height } = pixels;
  if (width < 3 || height < 3 || data.length < width * height * 4) {
    return null;
  }

  const step = Math.max(1, Math.floor(Math.min(width, height) / 240));
  let brightnessTotal = 0;
  let brightnessSamples = 0;
  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  let laplacianSamples = 0;

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      if (!isInsideDocument({ x, y }, corners)) {
        continue;
      }

      const center = luminance(data, width, x, y);
      brightnessTotal += center;
      brightnessSamples += 1;

      const laplacian =
        4 * center -
        luminance(data, width, x - 1, y) -
        luminance(data, width, x + 1, y) -
        luminance(data, width, x, y - 1) -
        luminance(data, width, x, y + 1);
      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
      laplacianSamples += 1;
    }
  }

  if (!brightnessSamples || !laplacianSamples) {
    return null;
  }

  const meanLaplacian = laplacianTotal / laplacianSamples;
  return {
    brightness: brightnessTotal / brightnessSamples,
    sharpnessVariance:
      laplacianSquaredTotal / laplacianSamples - meanLaplacian ** 2,
  };
}

export function evaluateDocumentQuality(
  input: QualityInput,
  config: DocumentQualityConfig = DEFAULT_DOCUMENT_QUALITY_CONFIG,
): DocumentQuality {
  const coverage = input.areaRatio >= config.minCoverageRatio;
  const boundaries = hasSafeBoundaries(
    input.corners,
    input.pixels.width,
    input.pixels.height,
    config.boundaryMarginRatio,
  );
  const geometry = hasPlausibleGeometry(
    input.corners,
    input.pixels.width,
    input.pixels.height,
    config,
  );
  const metrics = calculateRegionMetrics(input.pixels, input.corners);
  const brightness = Boolean(
    metrics &&
      metrics.brightness >= config.minBrightness &&
      metrics.brightness <= config.maxBrightness,
  );
  const sharpness = Boolean(
    metrics && metrics.sharpnessVariance >= config.minSharpnessVariance,
  );

  let guidance: QualityGuidance = "ready";
  if (!coverage) {
    guidance = "move-closer";
  } else if (!boundaries) {
    guidance = "move-away-from-edge";
  } else if (!brightness) {
    guidance = "move-into-better-light";
  } else if (!sharpness) {
    guidance = "hold-still";
  } else if (!geometry) {
    guidance = "move-into-position";
  }

  return {
    isAcceptable:
      coverage && boundaries && sharpness && brightness && geometry,
    coverage,
    boundaries,
    sharpness,
    brightness,
    geometry,
    guidance,
  };
}

export function analyseDocumentQuality(
  frame: AnalysisFrame,
  detection: DocumentDetection,
  config: DocumentQualityConfig = DEFAULT_DOCUMENT_QUALITY_CONFIG,
): DocumentQuality {
  const context = frame.canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return evaluateDocumentQuality(
      {
        corners: detection.corners,
        areaRatio: detection.areaRatio,
        pixels: { data: new Uint8ClampedArray(), width: 0, height: 0 },
      },
      config,
    );
  }

  const imageData = context.getImageData(0, 0, frame.width, frame.height);
  return evaluateDocumentQuality(
    {
      corners: detection.corners,
      areaRatio: detection.areaRatio,
      pixels: imageData,
    },
    config,
  );
}
