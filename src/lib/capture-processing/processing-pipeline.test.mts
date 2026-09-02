import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_JPEG_QUALITY,
  resolveJpegQuality,
} from "./processing-pipeline.ts";
import {
  createFullFrameCoordinateMapping,
  mapAnalysisCornersToCapture,
} from "./coordinate-mapping.ts";

test("resolves JPEG quality defaults and respects valid bounds", () => {
  assert.equal(resolveJpegQuality(), DEFAULT_JPEG_QUALITY);
  assert.equal(resolveJpegQuality(undefined), 0.92);
  assert.equal(resolveJpegQuality(0.85), 0.85);
  assert.equal(resolveJpegQuality(0.95), 0.95);
  assert.equal(resolveJpegQuality(1.0), 1.0);
  // Clamps out-of-range values
  assert.equal(resolveJpegQuality(1.5), 1.0);
  assert.equal(resolveJpegQuality(0.0), 0.1);
  assert.equal(resolveJpegQuality(-0.5), 0.1);
});

test("guarantees 640px analysis coordinates are scaled up to full capture resolution", () => {
  const analysisDimensions = { width: 640, height: 360 };
  const captureDimensions = { width: 1920, height: 1080 };

  const mapping = createFullFrameCoordinateMapping(
    analysisDimensions,
    captureDimensions,
    captureDimensions,
  );

  const analysisCorners = [
    { x: 64, y: 36 },
    { x: 576, y: 36 },
    { x: 576, y: 324 },
    { x: 64, y: 324 },
  ] as const;

  const captureCorners = mapAnalysisCornersToCapture(analysisCorners, mapping);

  assert.ok(captureCorners);
  // Must be scaled by exactly 3.0x (1920 / 640)
  assert.deepEqual(captureCorners, [
    { x: 192, y: 108 },
    { x: 1728, y: 108 },
    { x: 1728, y: 972 },
    { x: 192, y: 972 },
  ]);

  // Verify corners are in full-resolution 1080p space, NOT 640px analysis space
  assert.ok(captureCorners[1].x > 640);
  assert.ok(captureCorners[2].y > 360);
});

test("handles arbitrary non-1080p negotiated camera resolutions correctly", () => {
  // e.g. 720p stream (1280x720) or 4:3 stream (1280x960)
  const mapping720p = createFullFrameCoordinateMapping(
    { width: 640, height: 360 },
    { width: 1280, height: 720 },
    { width: 1280, height: 720 },
  );

  const captureCorners = mapAnalysisCornersToCapture(
    [
      { x: 0, y: 0 },
      { x: 640, y: 0 },
      { x: 640, y: 360 },
      { x: 0, y: 360 },
    ],
    mapping720p,
  );

  assert.deepEqual(captureCorners, [
    { x: 0, y: 0 },
    { x: 1280, y: 0 },
    { x: 1280, y: 720 },
    { x: 0, y: 720 },
  ]);
});
