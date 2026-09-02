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
  cornerSmoothingAlpha: 0.35,
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

test("a completely different candidate does not inherit accumulated stability", () => {
  const tracker = new DocumentStabilityTracker(config);
  const candidateA: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 380 },
    { x: 100, y: 380 },
  ];
  const candidateB: DocumentCorners = [
    { x: 160, y: 180 },
    { x: 440, y: 180 },
    { x: 440, y: 360 },
    { x: 160, y: 360 },
  ];

  // Candidate A accumulates stability and becomes ready
  tracker.observe({ corners: candidateA, qualityAcceptable: true, timestamp: 0 });
  tracker.observe({ corners: candidateA, qualityAcceptable: true, timestamp: 100 });
  const readyA = tracker.observe({
    corners: candidateA,
    qualityAcceptable: true,
    timestamp: 220,
  });
  assert.equal(readyA.isReady, true);
  assert.equal(readyA.stableFrameCount, 3);

  // Candidate B replaces candidate A; stability accumulation must reset
  const firstObservationB = tracker.observe({
    corners: candidateB,
    qualityAcceptable: true,
    timestamp: 300,
  });
  assert.equal(firstObservationB.isReady, false);
  assert.equal(firstObservationB.isStable, false);
  assert.equal(firstObservationB.stableFrameCount, 1);

  // Candidate B must independently accumulate stability across frames
  tracker.observe({
    corners: candidateB,
    qualityAcceptable: true,
    timestamp: 400,
  });
  const readyB = tracker.observe({
    corners: candidateB,
    qualityAcceptable: true,
    timestamp: 520,
  });
  assert.equal(readyB.isReady, true);
  assert.equal(readyB.isStable, true);
  assert.equal(readyB.stableFrameCount, 3);
});

// --- Temporal corner smoothing tests ---

test("smoothed corners are null before stability is reached", () => {
  const tracker = new DocumentStabilityTracker(config);
  const r1 = tracker.observe({ corners, qualityAcceptable: true, timestamp: 0 });
  assert.equal(r1.smoothedCorners, null);

  const r2 = tracker.observe({ corners, qualityAcceptable: true, timestamp: 100 });
  assert.equal(r2.smoothedCorners, null);
  assert.equal(r2.isStable, false);
});

test("smoothed corners are provided once stable", () => {
  const tracker = new DocumentStabilityTracker(config);
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 0 });
  tracker.observe({ corners, qualityAcceptable: true, timestamp: 100 });
  const result = tracker.observe({ corners, qualityAcceptable: true, timestamp: 220 });

  assert.equal(result.isStable, true);
  assert.ok(result.smoothedCorners);
  // First stable frame should equal the raw corners (no history to blend with).
  assert.deepEqual(result.smoothedCorners, corners);
});

test("smoothed corners converge with repeated identical corners", () => {
  const tracker = new DocumentStabilityTracker(config);
  // Reach stability
  for (let i = 0; i < 5; i += 1) {
    tracker.observe({ corners, qualityAcceptable: true, timestamp: i * 100 });
  }

  const result = tracker.observe({ corners, qualityAcceptable: true, timestamp: 500 });
  assert.ok(result.smoothedCorners);

  // After many identical frames, smoothed should converge to the same position.
  for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
    assert.ok(Math.abs(result.smoothedCorners[cornerIndex].x - corners[cornerIndex].x) < 1);
    assert.ok(Math.abs(result.smoothedCorners[cornerIndex].y - corners[cornerIndex].y) < 1);
  }
});

test("small jitter is reduced by smoothing", () => {
  const tracker = new DocumentStabilityTracker(config);
  // Reach stability
  for (let i = 0; i < 3; i += 1) {
    tracker.observe({ corners, qualityAcceptable: true, timestamp: i * 100 });
  }

  // Now send slightly jittered corners
  const jittered: DocumentCorners = [
    { x: 102, y: 101 },
    { x: 302, y: 99 },
    { x: 298, y: 261 },
    { x: 99, y: 259 },
  ];
  const result = tracker.observe({ corners: jittered, qualityAcceptable: true, timestamp: 300 });
  assert.ok(result.smoothedCorners);

  // Smoothed corners should be between original and jittered (blended),
  // not equal to the jittered values (which would mean no smoothing).
  for (let i = 0; i < 4; i += 1) {
    const smoothed = result.smoothedCorners[i];
    const raw = jittered[i];
    const original = corners[i];

    // Smoothed should be closer to original than the jittered value
    // because alpha=0.35 means the previous value has 65% weight.
    const smoothedDistFromOriginal = Math.hypot(smoothed.x - original.x, smoothed.y - original.y);
    const rawDistFromOriginal = Math.hypot(raw.x - original.x, raw.y - original.y);
    assert.ok(
      smoothedDistFromOriginal < rawDistFromOriginal,
      `Smoothed corner ${i} should be closer to original than raw jittered`,
    );
  }
});

test("large movement resets smoothed corners", () => {
  const tracker = new DocumentStabilityTracker(config);
  // Reach stability with smoothed corners
  for (let i = 0; i < 4; i += 1) {
    tracker.observe({ corners, qualityAcceptable: true, timestamp: i * 100 });
  }
  const stable = tracker.observe({ corners, qualityAcceptable: true, timestamp: 400 });
  assert.ok(stable.smoothedCorners);

  // Large movement should reset smoothing
  const result = tracker.observe({
    corners: moveCorners(20, 20),
    qualityAcceptable: true,
    timestamp: 500,
  });
  assert.equal(result.smoothedCorners, null);
  assert.equal(result.stableFrameCount, 1);
});

test("detection loss resets smoothed corners", () => {
  const tracker = new DocumentStabilityTracker(config);
  // Reach stability
  for (let i = 0; i < 4; i += 1) {
    tracker.observe({ corners, qualityAcceptable: true, timestamp: i * 100 });
  }

  const result = tracker.observe({ corners: null, qualityAcceptable: false, timestamp: 400 });
  assert.equal(result.smoothedCorners, null);
  assert.equal(result.stableFrameCount, 0);
});

test("candidate switch resets smoothed corners", () => {
  const tracker = new DocumentStabilityTracker(config);
  // Reach stability with candidate A
  for (let i = 0; i < 4; i += 1) {
    tracker.observe({ corners, qualityAcceptable: true, timestamp: i * 100 });
  }

  // Sudden switch to a very different candidate
  const candidateB: DocumentCorners = [
    { x: 200, y: 200 },
    { x: 400, y: 200 },
    { x: 400, y: 360 },
    { x: 200, y: 360 },
  ];
  const result = tracker.observe({ corners: candidateB, qualityAcceptable: true, timestamp: 400 });
  assert.equal(result.smoothedCorners, null);
  assert.equal(result.stableFrameCount, 1);
});

test("reset method clears smoothed corners", () => {
  const tracker = new DocumentStabilityTracker(config);
  for (let i = 0; i < 4; i += 1) {
    tracker.observe({ corners, qualityAcceptable: true, timestamp: i * 100 });
  }

  const resetResult = tracker.reset();
  assert.equal(resetResult.smoothedCorners, null);
  assert.equal(resetResult.stableFrameCount, 0);
});

test("raw corners are used for stability measurement not smoothed ones", () => {
  const tracker = new DocumentStabilityTracker(config);
  // Reach stability
  for (let i = 0; i < 3; i += 1) {
    tracker.observe({ corners, qualityAcceptable: true, timestamp: i * 100 });
  }

  // Send jittered corners that are within the movement threshold
  const jittered = moveCorners(2, 1);
  const r1 = tracker.observe({ corners: jittered, qualityAcceptable: true, timestamp: 300 });
  assert.ok(r1.isStable);
  assert.ok(r1.smoothedCorners);

  // Send the same jitter again — stability should be measured from the raw
  // jittered corners, not from the smoothed corners.
  const r2 = tracker.observe({ corners: jittered, qualityAcceptable: true, timestamp: 400 });
  assert.ok(r2.isStable);
  // Movement from jittered→jittered should be 0
  assert.equal(r2.averageCornerMovementPx, 0);
});
