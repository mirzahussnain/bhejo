import type { DocumentCorners, Point } from "../detection/geometry.ts";

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
  const maxW = Math.max(source.width, capture.width);
  const maxH = Math.max(source.height, capture.height);
  return (
    hasPositiveDimensions(analysis) &&
    hasPositiveDimensions(source) &&
    hasPositiveDimensions(capture) &&
    Number.isFinite(analysisSourceRect.x) &&
    Number.isFinite(analysisSourceRect.y) &&
    hasPositiveDimensions(analysisSourceRect) &&
    analysisSourceRect.x >= -1e-4 &&
    analysisSourceRect.y >= -1e-4 &&
    analysisSourceRect.x + analysisSourceRect.width <= maxW + 1e-4 &&
    analysisSourceRect.y + analysisSourceRect.height <= maxH + 1e-4
  );
}

export function createFullFrameCoordinateMapping(
  analysis: FrameDimensions,
  source: FrameDimensions,
  capture: FrameDimensions,
): CaptureCoordinateMapping {
  // Determine if there is an aspect ratio difference between the video stream (source)
  // and the still capture (e.g. 16:9 video preview vs 4:3 still photo sensor).
  const arSource = source.width / source.height;
  const arCapture = capture.width / capture.height;

  let effectiveCaptureWidth = capture.width;
  let effectiveCaptureHeight = capture.height;
  let captureOffsetX = 0;
  let captureOffsetY = 0;

  // Aspect ratio difference threshold (2%)
  if (Math.abs(arSource - arCapture) / Math.max(arSource, arCapture) > 0.02) {
    if (arSource > arCapture) {
      // Source (video) is wider than capture (still)
      // The video is a centered horizontal strip across the sensor
      effectiveCaptureHeight = capture.width / arSource;
      captureOffsetY = (capture.height - effectiveCaptureHeight) / 2;
      effectiveCaptureWidth = capture.width;
      captureOffsetX = 0;
    } else {
      // Source (video) is narrower / taller than capture (still)
      // The video is a centered vertical strip down the sensor
      effectiveCaptureWidth = capture.height * arSource;
      captureOffsetX = (capture.width - effectiveCaptureWidth) / 2;
      effectiveCaptureHeight = capture.height;
      captureOffsetY = 0;
    }
  }

  return {
    analysis,
    source,
    capture,
    analysisSourceRect: {
      x: captureOffsetX,
      y: captureOffsetY,
      width: effectiveCaptureWidth,
      height: effectiveCaptureHeight,
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
    !Number.isFinite(point.y)
  ) {
    return null;
  }

  // Reject points outside bounds, with micro-epsilon for floating-point math
  const EPSILON = 1e-4;
  if (
    point.x < -EPSILON ||
    point.y < -EPSILON ||
    point.x > mapping.analysis.width + EPSILON ||
    point.y > mapping.analysis.height + EPSILON
  ) {
    return null;
  }

  const safeX = Math.max(0, Math.min(mapping.analysis.width, point.x));
  const safeY = Math.max(0, Math.min(mapping.analysis.height, point.y));

  // Map from analysis canvas [0..analysis.width] to the effective capture area
  const mappedX =
    mapping.analysisSourceRect.x +
    (safeX / mapping.analysis.width) * mapping.analysisSourceRect.width;
  const mappedY =
    mapping.analysisSourceRect.y +
    (safeY / mapping.analysis.height) * mapping.analysisSourceRect.height;

  return {
    x: Math.max(0, Math.min(mapping.capture.width, mappedX)),
    y: Math.max(0, Math.min(mapping.capture.height, mappedY)),
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

