import assert from "node:assert/strict";
import test from "node:test";
import {
  DocumentStabilityTracker,
  calculateAverageCornerMovement,
} from "./document-stability.ts";
import type { DocumentCorners } from "../detection/geometry.ts";

const corners: DocumentCorners = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 260 },
  { x: 100, y: 260 },
];

function moveCorners(offsetX: number, offsetY: number): DocumentCorners {
  return [
    { x: corners[0].x + offsetX, y: corners[0].y + offsetY },
    { x: corners[1].x + offsetX, y: corners[1].y + offsetY },
    { x: corners[2].x + offsetX, y: corners[2].y + offsetY },
    { x: corners[3].x + offsetX, y: corners[3].y + offsetY },
  ];
}

const config = {
  maxAverageCornerMovementPx: 8,
  requiredStableFrames: 3,
  requiredStableDurationMs: 200,
};

test("identical corners become ready after sustained stable frames", () => {
  const tracker = new DocumentStabilityTracker(config);
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 0 });
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 100 });
  const result = tracker.observe({ corners, qualityAcceptable: true, timestamp: 220 });

  assert.equal(result.isStable, true);
  assert.equal(result.isReady, true);
});

test("small corner movement remains stable", () => {
  const tracker = new DocumentStabilityTracker(config);
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 0 });
  const result = tracker.observe({
    corners: moveCorners(3, 2),
    qualityAcceptable: true,
    timestamp: 100,
  });

  assert.equal(result.stableFrameCount, 2);
  assert.ok((result.averageCornerMovementPx ?? Infinity) < 8);
});

test("large movement resets stable accumulation", () => {
  const tracker = new DocumentStabilityTracker(config);
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 0 });
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 100 });
  const result = tracker.observe({
    corners: moveCorners(20, 0),
    qualityAcceptable: true,
    timestamp: 200,
  });

  assert.equal(result.isReady, false);
  assert.equal(result.stableFrameCount, 1);
});

test("missing detection and quality failure reset capture eligibility", () => {
  const tracker = new DocumentStabilityTracker(config);
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 0 });
  assert.equal(
    tracker.observe({ corners: null, qualityAcceptable: false, timestamp: 100 }).stableFrameCount,
    0,
  );
  assert.equal(
    tracker.observe({ corners, qualityAcceptable: false, timestamp: 200 }).stableFrameCount,
    0,
  );
});

test("calculates average movement across all corners", () => {
  assert.equal(
    calculateAverageCornerMovement(
      corners,
      moveCorners(4, 0),
    ),
    4,
  );
});
