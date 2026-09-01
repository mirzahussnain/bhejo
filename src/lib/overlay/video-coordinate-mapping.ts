import type { DocumentCorners, Point } from "../detection/geometry.ts";

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

function hasUsableDimensions(dimensions: Dimensions): boolean {
  return (
    Number.isFinite(dimensions.width) &&
    Number.isFinite(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
  );
}

export function mapAnalysisPointToOverlay(
  point: Point,
  analysis: Dimensions,
  video: Dimensions,
  display: Dimensions,
): Point | null {
  if (
    !hasUsableDimensions(analysis) ||
    !hasUsableDimensions(video) ||
    !hasUsableDimensions(display)
  ) {
    return null;
  }

  const scale = Math.max(display.width / video.width, display.height / video.height);
  const renderedWidth = video.width * scale;
  const renderedHeight = video.height * scale;
  const offsetX = (display.width - renderedWidth) / 2;
  const offsetY = (display.height - renderedHeight) / 2;

  return {
    x: (point.x / analysis.width) * renderedWidth + offsetX,
    y: (point.y / analysis.height) * renderedHeight + offsetY,
  };
}

export function mapAnalysisCornersToOverlay(
  corners: DocumentCorners,
  analysis: Dimensions,
  video: Dimensions,
  display: Dimensions,
): DocumentCorners | null {
  const mapped = corners.map((corner) =>
    mapAnalysisPointToOverlay(corner, analysis, video, display),
  );
  if (
    mapped[0] === null ||
    mapped[1] === null ||
    mapped[2] === null ||
    mapped[3] === null
  ) {
    return null;
  }

  return [mapped[0], mapped[1], mapped[2], mapped[3]];
}
