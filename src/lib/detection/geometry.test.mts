import assert from "node:assert/strict";
import test from "node:test";
import {
  orderCorners,
  polygonArea,
  validateQuadrilateral,
  type Point,
} from "./geometry.ts";
import {
  DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  hasSufficientReconstructionEvidence,
  isReconstructedCandidateEligible,
  scoreDocumentCandidate,
} from "./document-detection.ts";

const frameWidth = 640;
const frameHeight = 480;

test("orders corners top-left, top-right, bottom-right, bottom-left", () => {
  const shuffled: Point[] = [
    { x: 540, y: 400 },
    { x: 100, y: 80 },
    { x: 90, y: 390 },
    { x: 550, y: 70 },
  ];

  assert.deepEqual(orderCorners(shuffled), [
    { x: 100, y: 80 },
    { x: 550, y: 70 },
    { x: 540, y: 400 },
    { x: 90, y: 390 },
  ]);
});

test("calculates polygon area independently of winding", () => {
  const clockwise: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ];

  assert.equal(polygonArea(clockwise), 50);
  assert.equal(polygonArea([...clockwise].reverse()), 50);
});

test("accepts a plausible rectangular document", () => {
  const candidate = validateQuadrilateral(
    [
      { x: 100, y: 70 },
      { x: 540, y: 80 },
      { x: 520, y: 410 },
      { x: 110, y: 400 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(candidate);
  assert.ok(candidate.metrics.areaRatio > 0.4);
});

test("rejects a degenerate quadrilateral", () => {
  assert.equal(
    validateQuadrilateral(
      [
        { x: 100, y: 100 },
        { x: 200, y: 102 },
        { x: 300, y: 104 },
        { x: 400, y: 106 },
      ],
      frameWidth,
      frameHeight,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
    ),
    null,
  );
});

test("rejects a candidate outside the analysis frame", () => {
  assert.equal(
    validateQuadrilateral(
      [
        { x: -1, y: 50 },
        { x: 500, y: 50 },
        { x: 500, y: 400 },
        { x: 50, y: 400 },
      ],
      frameWidth,
      frameHeight,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
    ),
    null,
  );
});

test("rejects candidates that effectively fill the camera frame", () => {
  assert.equal(
    validateQuadrilateral(
      [
        { x: 0, y: 0 },
        { x: frameWidth, y: 0 },
        { x: frameWidth, y: frameHeight },
        { x: 0, y: frameHeight },
      ],
      frameWidth,
      frameHeight,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
    ),
    null,
  );
});

test("area ratio uses the analysis frame dimensions", () => {
  const candidate = validateQuadrilateral(
    [
      { x: 160, y: 120 },
      { x: 480, y: 120 },
      { x: 480, y: 360 },
      { x: 160, y: 360 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(candidate);
  assert.equal(candidate.metrics.areaRatio, 0.25);
});

test("candidate scoring favors a larger, well-framed rectangle", () => {
  const smaller = validateQuadrilateral(
    [
      { x: 220, y: 160 },
      { x: 420, y: 160 },
      { x: 420, y: 320 },
      { x: 220, y: 320 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  const larger = validateQuadrilateral(
    [
      { x: 100, y: 70 },
      { x: 540, y: 70 },
      { x: 540, y: 410 },
      { x: 100, y: 410 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(smaller);
  assert.ok(larger);
  assert.ok(scoreDocumentCandidate(larger) > scoreDocumentCandidate(smaller));
});

test("accepts a small card and a strongly perspective-skewed document", () => {
  const card = validateQuadrilateral(
    [
      { x: 230, y: 180 },
      { x: 410, y: 180 },
      { x: 410, y: 300 },
      { x: 230, y: 300 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  const perspectiveDocument = validateQuadrilateral(
    [
      { x: 170, y: 80 },
      { x: 470, y: 145 },
      { x: 570, y: 430 },
      { x: 80, y: 360 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(card);
  assert.ok(perspectiveDocument);
});

test("accepts rounded-corner-like card geometry", () => {
  const card = validateQuadrilateral(
    [
      { x: 236, y: 184 },
      { x: 408, y: 180 },
      { x: 414, y: 296 },
      { x: 232, y: 302 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(card);
});

test("accepts a partially fragmented card boundary with enough evidence", () => {
  const corners = orderCorners([
    { x: 180, y: 140 },
    { x: 450, y: 150 },
    { x: 440, y: 320 },
    { x: 170, y: 310 },
  ]);

  assert.equal(
    hasSufficientReconstructionEvidence(35_000, 700, corners),
    true,
  );
  assert.equal(
    hasSufficientReconstructionEvidence(4_000, 150, corners),
    false,
  );
});

test("rejects a reconstructed candidate that is too small to be a document", () => {
  const smallCorners = orderCorners([
    { x: 300, y: 220 },
    { x: 340, y: 220 },
    { x: 340, y: 250 },
    { x: 300, y: 250 },
  ]);

  assert.equal(
    validateQuadrilateral(
      smallCorners,
      frameWidth,
      frameHeight,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
    ),
    null,
  );
});

test("does not promote a large rectangular false positive through reconstruction", () => {
  const screenLikeCandidate = validateQuadrilateral(
    [
      { x: 30, y: 40 },
      { x: 610, y: 40 },
      { x: 610, y: 440 },
      { x: 30, y: 440 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(screenLikeCandidate);
  assert.equal(
    isReconstructedCandidateEligible(screenLikeCandidate, 230_000, 1_960),
    false,
  );
});
