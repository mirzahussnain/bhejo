import assert from "node:assert/strict";
import test from "node:test";
import { mapAnalysisCornersToOverlay } from "./video-coordinate-mapping.ts";

const corners = [
  { x: 0, y: 0 },
  { x: 640, y: 0 },
  { x: 640, y: 360 },
  { x: 0, y: 360 },
] as const;

test("maps analysis coordinates through a cover-cropped portrait display", () => {
  const mapped = mapAnalysisCornersToOverlay(
    corners,
    { width: 640, height: 360 },
    { width: 1920, height: 1080 },
    { width: 360, height: 640 },
  );

  assert.ok(mapped);
  assert.equal(mapped[0].y, 0);
  assert.equal(mapped[2].y, 640);
  assert.ok(mapped[0].x < 0);
  assert.ok(mapped[1].x > 360);
});

test("maps analysis coordinates when a portrait video is cropped into landscape", () => {
  const mapped = mapAnalysisCornersToOverlay(
    [
      { x: 0, y: 0 },
      { x: 360, y: 0 },
      { x: 360, y: 640 },
      { x: 0, y: 640 },
    ],
    { width: 360, height: 640 },
    { width: 1080, height: 1920 },
    { width: 640, height: 360 },
  );

  assert.ok(mapped);
  assert.equal(mapped[0].x, 0);
  assert.equal(mapped[1].x, 640);
  assert.ok(mapped[0].y < 0);
  assert.ok(mapped[2].y > 360);
});
