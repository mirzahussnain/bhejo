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

test("maps 16:9 preview to 4:3 still photo with centered vertical offset", () => {
  // Video is 1920x1080 (16:9), still photo is 4032x3024 (4:3)
  // Sensor effective height for 16:9 is 4032 / (16/9) = 2268
  // Vertical offset = (3024 - 2268) / 2 = 378
  const mapping = createFullFrameCoordinateMapping(
    { width: 640, height: 360 },
    { width: 1920, height: 1080 },
    { width: 4032, height: 3024 },
  );

  // Center point in analysis (320, 180) must map exactly to center of still (2016, 1512)
  const center = mapAnalysisPointToCapture({ x: 320, y: 180 }, mapping);
  assert.deepEqual(center, { x: 2016, y: 1512 });

  // Top-left of 16:9 video frame maps to (0, 378)
  const topLeft = mapAnalysisPointToCapture({ x: 0, y: 0 }, mapping);
  assert.deepEqual(topLeft, { x: 0, y: 378 });

  // Bottom-right of 16:9 video frame maps to (4032, 378 + 2268 = 2646)
  const bottomRight = mapAnalysisPointToCapture({ x: 640, y: 360 }, mapping);
  assert.deepEqual(bottomRight, { x: 4032, y: 2646 });
});

test("maps 9:16 portrait preview to 3:4 portrait still photo with centered horizontal offset", () => {
  // Video is 1080x1920 (9:16), still photo is 3024x4032 (3:4)
  // Sensor effective width for 9:16 is 4032 * (9/16) = 2268
  // Horizontal offset = (3024 - 2268) / 2 = 378
  const mapping = createFullFrameCoordinateMapping(
    { width: 360, height: 640 },
    { width: 1080, height: 1920 },
    { width: 3024, height: 4032 },
  );

  // Center point in analysis (180, 320) must map exactly to center of still (1512, 2016)
  const center = mapAnalysisPointToCapture({ x: 180, y: 320 }, mapping);
  assert.deepEqual(center, { x: 1512, y: 2016 });

  // Top-left of 9:16 video frame maps to (378, 0)
  const topLeft = mapAnalysisPointToCapture({ x: 0, y: 0 }, mapping);
  assert.deepEqual(topLeft, { x: 378, y: 0 });
});

