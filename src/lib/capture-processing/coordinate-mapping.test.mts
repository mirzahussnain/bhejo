import assert from "node:assert/strict";
import test from "node:test";
import {
  createFullFrameCoordinateMapping,
  mapAnalysisCornersToCapture,
  mapAnalysisPointToCapture,
} from "./coordinate-mapping.ts";

test("maps same-aspect analysis corners to a full-resolution capture", () => {
  const mapped = mapAnalysisCornersToCapture(
    [
      { x: 0, y: 0 },
      { x: 640, y: 0 },
      { x: 640, y: 360 },
      { x: 0, y: 360 },
    ],
    createFullFrameCoordinateMapping(
      { width: 640, height: 360 },
      { width: 1920, height: 1080 },
      { width: 1920, height: 1080 },
    ),
  );

  assert.deepEqual(mapped, [
    { x: 0, y: 0 },
    { x: 1920, y: 0 },
    { x: 1920, y: 1080 },
    { x: 0, y: 1080 },
  ]);
});

test("maps portrait analysis coordinates to a landscape-sized capture", () => {
  const mapped = mapAnalysisPointToCapture(
    { x: 320, y: 569 },
    createFullFrameCoordinateMapping(
      { width: 640, height: 1138 },
      { width: 1080, height: 1920 },
      { width: 540, height: 960 },
    ),
  );

  assert.deepEqual(mapped, { x: 270, y: 480 });
});

test("maps a centered intrinsic-video crop without depending on CSS object positioning", () => {
  const mapped = mapAnalysisPointToCapture(
    { x: 0, y: 0 },
    {
      analysis: { width: 640, height: 640 },
      source: { width: 1920, height: 1080 },
      capture: { width: 1920, height: 1080 },
      analysisSourceRect: { x: 420, y: 0, width: 1080, height: 1080 },
    },
  );

  assert.deepEqual(mapped, { x: 420, y: 0 });
});

test("preserves edge and corner coordinates across differently sized captures", () => {
  const mapping = createFullFrameCoordinateMapping(
    { width: 480, height: 640 },
    { width: 1080, height: 1440 },
    { width: 810, height: 1080 },
  );

  assert.deepEqual(mapAnalysisPointToCapture({ x: 480, y: 640 }, mapping), {
    x: 810,
    y: 1080,
  });
  assert.equal(mapAnalysisPointToCapture({ x: 481, y: 640 }, mapping), null);
});
