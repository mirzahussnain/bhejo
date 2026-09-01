import type { DocumentCorners, Point } from "@/lib/detection/geometry";

export interface FrameDimensions {
  readonly width: number;
  readonly height: number;
}

export interface SourceRect extends FrameDimensions {
  readonly x: number;
  readonly y: number;
}

export interface CaptureCoordinateMapping {
  readonly analysis: FrameDimensions;
  readonly source: FrameDimensions;
  readonly capture: FrameDimensions;
  /** The intrinsic-video area drawn into the analysis canvas. */
  readonly analysisSourceRect: SourceRect;
}

function hasPositiveDimensions(dimensions: FrameDimensions): boolean {
  return (
    Number.isFinite(dimensions.width) &&
    Number.isFinite(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
  );
}

function isValidMapping(mapping: CaptureCoordinateMapping): boolean {
  const { analysis, source, capture, analysisSourceRect } = mapping;
  return (
    hasPositiveDimensions(analysis) &&
    hasPositiveDimensions(source) &&
    hasPositiveDimensions(capture) &&
    Number.isFinite(analysisSourceRect.x) &&
    Number.isFinite(analysisSourceRect.y) &&
    hasPositiveDimensions(analysisSourceRect) &&
    analysisSourceRect.x >= 0 &&
    analysisSourceRect.y >= 0 &&
    analysisSourceRect.x + analysisSourceRect.width <= source.width &&
    analysisSourceRect.y + analysisSourceRect.height <= source.height
  );
}

export function createFullFrameCoordinateMapping(
  analysis: FrameDimensions,
  source: FrameDimensions,
  capture: FrameDimensions,
): CaptureCoordinateMapping {
  return {
    analysis,
    source,
    capture,
    analysisSourceRect: {
      x: 0,
      y: 0,
      width: source.width,
      height: source.height,
    },
  };
}

export function mapAnalysisPointToCapture(
  point: Point,
  mapping: CaptureCoordinateMapping,
): Point | null {
  if (
    !isValidMapping(mapping) ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > mapping.analysis.width ||
    point.y > mapping.analysis.height
  ) {
    return null;
  }

  const sourceX =
    mapping.analysisSourceRect.x +
    (point.x / mapping.analysis.width) * mapping.analysisSourceRect.width;
  const sourceY =
    mapping.analysisSourceRect.y +
    (point.y / mapping.analysis.height) * mapping.analysisSourceRect.height;

  return {
    x: (sourceX / mapping.source.width) * mapping.capture.width,
    y: (sourceY / mapping.source.height) * mapping.capture.height,
  };
}

export function mapAnalysisCornersToCapture(
  corners: DocumentCorners,
  mapping: CaptureCoordinateMapping,
): DocumentCorners | null {
  const mapped = corners.map((corner) =>
    mapAnalysisPointToCapture(corner, mapping),
  );

  const [topLeft, topRight, bottomRight, bottomLeft] = mapped;
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return null;
  }

  return [topLeft, topRight, bottomRight, bottomLeft];
}
