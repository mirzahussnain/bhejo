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
import {
  calculateCandidateBoundaryEvidence,
  createBoundaryEvidence,
  hasBalancedBoundaryEvidence,
} from "./candidate-evidence.ts";

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

test("candidate scoring favors strong four-sided evidence over inferred geometry", () => {
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
  assert.ok(
    scoreDocumentCandidate(
      smaller,
      undefined,
      createBoundaryEvidence([0.94, 0.9, 0.88, 0.91]),
    ) >
      scoreDocumentCandidate(
        larger,
        undefined,
        createBoundaryEvidence([0.65, 0.58, 0.1, 0.12]),
      ),
  );
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

test("accepts glossy and fragmented card boundaries when evidence is balanced", () => {
  const corners = orderCorners([
    { x: 180, y: 140 },
    { x: 450, y: 150 },
    { x: 440, y: 320 },
    { x: 170, y: 310 },
  ]);

  assert.equal(
    hasSufficientReconstructionEvidence(
      35_000,
      corners,
      createBoundaryEvidence([0.72, 0.58, 0.46, 0.52], 0.45),
    ),
    true,
  );
  assert.equal(
    hasSufficientReconstructionEvidence(
      4_000,
      corners,
      createBoundaryEvidence([0.72, 0.58, 0.46, 0.52], 0.45),
    ),
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
    isReconstructedCandidateEligible(
      screenLikeCandidate,
      230_000,
      createBoundaryEvidence([0.96, 0.96, 0.96, 0.96], 0.45),
    ),
    false,
  );
});

test("measures edge support independently for all four document sides", () => {
  const width = 20;
  const height = 20;
  const edges = new Uint8Array(width * height);
  for (let index = 3; index <= 16; index += 1) {
    edges[3 * width + index] = 255;
    edges[16 * width + index] = 255;
    edges[index * width + 3] = 255;
    edges[index * width + 16] = 255;
  }

  const evidence = calculateCandidateBoundaryEvidence(
    { data: edges, width, height },
    [
      { x: 3, y: 3 },
      { x: 16, y: 3 },
      { x: 16, y: 16 },
      { x: 3, y: 16 },
    ],
    {
      ...DEFAULT_DOCUMENT_DETECTOR_CONFIG.standardEvidence,
      samplesPerSide: 8,
      edgeSearchRadiusPx: 0,
    },
  );

  assert.deepEqual(evidence.sideSupport, [1, 1, 1, 1]);
});

test("rejects face, glasses, and partial screen-like geometry with unbalanced sides", () => {
  const faceOrGlassesEvidence = createBoundaryEvidence([0.76, 0.68, 0.05, 0.1]);
  const partialScreenEvidence = createBoundaryEvidence([0.9, 0.84, 0.08, 0.14]);

  assert.equal(
    hasBalancedBoundaryEvidence(
      faceOrGlassesEvidence,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG.standardEvidence,
    ),
    false,
  );
  assert.equal(
    hasBalancedBoundaryEvidence(
      partialScreenEvidence,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG.reconstructionEvidence,
    ),
    false,
  );
});

test("accepts small cards and perspective documents when all sides are supported", () => {
  const smallCardEvidence = createBoundaryEvidence([0.48, 0.44, 0.39, 0.42]);
  const perspectiveDocumentEvidence = createBoundaryEvidence([
    0.85, 0.64, 0.58, 0.77,
  ]);

  assert.equal(
    hasBalancedBoundaryEvidence(
      smallCardEvidence,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG.standardEvidence,
    ),
    true,
  );
  assert.equal(
    hasBalancedBoundaryEvidence(
      perspectiveDocumentEvidence,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG.standardEvidence,
    ),
    true,
  );
});

// --- Passport single-page detection tests ---

test("accepts a passport page via reconstruction when the fold side is strong and the outer edge has modest support", () => {
  // Passport page on a moderate-contrast surface: fold side is strong,
  // top/bottom have decent edges, outer edge (away from fold) has modest support.
  const corners = orderCorners([
    { x: 340, y: 100 },
    { x: 510, y: 105 },
    { x: 505, y: 380 },
    { x: 335, y: 375 },
  ]);

  // Contour area covers most of the passport page rectangle.
  const passportPageArea = 170 * 275 * 0.7;

  assert.equal(
    hasSufficientReconstructionEvidence(
      passportPageArea,
      corners,
      createBoundaryEvidence([0.9, 0.48, 0.46, 0.16], 0.45),
    ),
    true,
  );
});

test("rejects a passport page via reconstruction when the outer edge has negligible support", () => {
  const corners = orderCorners([
    { x: 340, y: 100 },
    { x: 510, y: 105 },
    { x: 505, y: 380 },
    { x: 335, y: 375 },
  ]);

  const passportPageArea = 170 * 275 * 0.7;

  // Outer edge support at 0.05 is below minimumSideSupport (0.14).
  assert.equal(
    hasSufficientReconstructionEvidence(
      passportPageArea,
      corners,
      createBoundaryEvidence([0.9, 0.5, 0.5, 0.05], 0.45),
    ),
    false,
  );
});

test("false-positive patterns remain rejected through the reconstruction evidence path", () => {
  // Face/glasses: only 2 strong sides at the 0.45 threshold.
  const faceEvidence = createBoundaryEvidence([0.76, 0.68, 0.05, 0.1], 0.45);
  assert.equal(
    hasBalancedBoundaryEvidence(
      faceEvidence,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG.reconstructionEvidence,
    ),
    false,
  );

  // Partial screen: only 2 strong sides, weak average.
  const screenEvidence = createBoundaryEvidence([0.9, 0.84, 0.08, 0.14], 0.45);
  assert.equal(
    hasBalancedBoundaryEvidence(
      screenEvidence,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG.reconstructionEvidence,
    ),
    false,
  );
});

test("accepts a passport-page-sized candidate through geometry validation", () => {
  // A single passport page in portrait orientation within the 640×480 frame.
  const passportPage = validateQuadrilateral(
    [
      { x: 340, y: 100 },
      { x: 510, y: 105 },
      { x: 505, y: 380 },
      { x: 335, y: 375 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(passportPage);
  assert.ok(passportPage.metrics.areaRatio > 0.1);
  assert.ok(passportPage.metrics.areaRatio < 0.25);
  assert.ok(passportPage.metrics.angleScore > 0.9);
  assert.ok(passportPage.metrics.edgeConsistency > 0.5);
});

