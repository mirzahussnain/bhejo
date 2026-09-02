import assert from "node:assert/strict";
import test from "node:test";
import {
  isContainedWithin,
  isPointInsideConvexQuad,
  orderCorners,
  polygonArea,
  validateQuadrilateral,
  type DocumentCorners,
  type Point,
} from "./geometry.ts";
import {
  DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  hasSufficientReconstructionEvidence,
  isReconstructedCandidateEligible,
  scoreDocumentCandidate,
  selectBestCandidate,
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
      { x: 10, y: 10 },
      { x: 630, y: 10 },
      { x: 630, y: 470 },
      { x: 10, y: 470 },
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

// --- isPointInsideConvexQuad ---

test("detects point inside a clockwise quad", () => {
  const quad: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ];
  assert.equal(isPointInsideConvexQuad({ x: 300, y: 250 }, quad), true);
});

test("detects point inside a counter-clockwise quad", () => {
  const quad: DocumentCorners = [
    { x: 100, y: 400 },
    { x: 500, y: 400 },
    { x: 500, y: 100 },
    { x: 100, y: 100 },
  ];
  assert.equal(isPointInsideConvexQuad({ x: 300, y: 250 }, quad), true);
});

test("detects point outside a quad", () => {
  const quad: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ];
  assert.equal(isPointInsideConvexQuad({ x: 50, y: 250 }, quad), false);
  assert.equal(isPointInsideConvexQuad({ x: 600, y: 250 }, quad), false);
  assert.equal(isPointInsideConvexQuad({ x: 300, y: 50 }, quad), false);
  assert.equal(isPointInsideConvexQuad({ x: 300, y: 450 }, quad), false);
});

test("treats points on the edge as inside (within epsilon)", () => {
  const quad: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ];
  // Point exactly on the top edge.
  assert.equal(isPointInsideConvexQuad({ x: 300, y: 100 }, quad), true);
  // Point exactly on a corner.
  assert.equal(isPointInsideConvexQuad({ x: 100, y: 100 }, quad), true);
});

test("handles near-edge floating-point cases", () => {
  const quad: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ];
  // A point that is numerically barely inside (floating-point imprecision).
  assert.equal(
    isPointInsideConvexQuad({ x: 100.0000001, y: 100.0000001 }, quad),
    true,
  );
  // A point that is barely outside.
  assert.equal(
    isPointInsideConvexQuad({ x: 99.9999, y: 99.9999 }, quad),
    false,
  );
});

test("works with perspective-skewed quad", () => {
  const quad: DocumentCorners = [
    { x: 150, y: 80 },
    { x: 490, y: 120 },
    { x: 520, y: 400 },
    { x: 100, y: 380 },
  ];
  // Center should be inside.
  assert.equal(isPointInsideConvexQuad({ x: 300, y: 250 }, quad), true);
  // Far corner should be outside.
  assert.equal(isPointInsideConvexQuad({ x: 50, y: 50 }, quad), false);
});

// --- isContainedWithin ---

test("detects a small quad contained within a larger quad", () => {
  const outer: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ];
  const inner: DocumentCorners = [
    { x: 200, y: 200 },
    { x: 400, y: 200 },
    { x: 400, y: 300 },
    { x: 200, y: 300 },
  ];
  assert.equal(isContainedWithin(inner, outer), true);
});

test("rejects partially overlapping quads as not contained", () => {
  const outer: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ];
  const overlapping: DocumentCorners = [
    { x: 50, y: 200 },
    { x: 300, y: 200 },
    { x: 300, y: 350 },
    { x: 50, y: 350 },
  ];
  assert.equal(isContainedWithin(overlapping, outer), false);
});

test("rejects completely separate quads as not contained", () => {
  const a: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ];
  const b: DocumentCorners = [
    { x: 300, y: 300 },
    { x: 400, y: 300 },
    { x: 400, y: 400 },
    { x: 300, y: 400 },
  ];
  assert.equal(isContainedWithin(a, b), false);
  assert.equal(isContainedWithin(b, a), false);
});

test("containment works with counter-clockwise outer quad", () => {
  const outer: DocumentCorners = [
    { x: 100, y: 400 },
    { x: 500, y: 400 },
    { x: 500, y: 100 },
    { x: 100, y: 100 },
  ];
  const inner: DocumentCorners = [
    { x: 200, y: 200 },
    { x: 400, y: 200 },
    { x: 400, y: 300 },
    { x: 200, y: 300 },
  ];
  assert.equal(isContainedWithin(inner, outer), true);
});

// --- selectBestCandidate: containment-aware selection ---

// Helper to create a mock scored candidate for selection tests.
function makeScoredCandidate(
  corners: DocumentCorners,
  areaRatio: number,
  confidence: number,
  sideSupport: readonly [number, number, number, number],
) {
  return {
    detection: {
      corners,
      confidence,
      areaRatio,
      edgeSupport: sideSupport.reduce((a, b) => a + b, 0) / 4,
      geometryScore: 0.8,
    },
    strategy: "standard-edge-contour" as const,
    boundaryEvidence: createBoundaryEvidence(sideSupport),
  };
}

// Card outer boundary.
const cardOuter: DocumentCorners = orderCorners([
  { x: 150, y: 120 },
  { x: 490, y: 125 },
  { x: 485, y: 360 },
  { x: 145, y: 355 },
]);

// Photo rectangle inside the card.
const photoInner: DocumentCorners = orderCorners([
  { x: 170, y: 160 },
  { x: 280, y: 162 },
  { x: 278, y: 300 },
  { x: 168, y: 298 },
]);

// Chip rectangle inside the card.
const chipInner: DocumentCorners = orderCorners([
  { x: 180, y: 250 },
  { x: 240, y: 250 },
  { x: 240, y: 300 },
  { x: 180, y: 300 },
]);

// Barcode rectangle inside the card.
const barcodeInner: DocumentCorners = orderCorners([
  { x: 300, y: 280 },
  { x: 470, y: 282 },
  { x: 468, y: 340 },
  { x: 298, y: 338 },
]);

test("card + photo: prefers outer card boundary over inner photo", () => {
  const outer = makeScoredCandidate(
    cardOuter,
    0.28,
    0.55,
    [0.52, 0.45, 0.48, 0.42],
  );
  const inner = makeScoredCandidate(
    photoInner,
    0.06,
    0.72,
    [0.92, 0.88, 0.90, 0.86],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardOuter);
});

test("card + chip: prefers outer card boundary over inner chip", () => {
  const outer = makeScoredCandidate(
    cardOuter,
    0.28,
    0.52,
    [0.50, 0.42, 0.46, 0.40],
  );
  const inner = makeScoredCandidate(
    chipInner,
    0.02,
    0.68,
    [0.95, 0.92, 0.94, 0.90],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardOuter);
});

test("card + barcode: prefers outer card boundary over inner barcode", () => {
  const outer = makeScoredCandidate(
    cardOuter,
    0.28,
    0.54,
    [0.50, 0.44, 0.46, 0.42],
  );
  const inner = makeScoredCandidate(
    barcodeInner,
    0.05,
    0.70,
    [0.90, 0.85, 0.88, 0.84],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardOuter);
});

test("document + QR code: prefers outer boundary over internal QR rectangle", () => {
  const docOuter: DocumentCorners = orderCorners([
    { x: 80, y: 60 },
    { x: 560, y: 65 },
    { x: 555, y: 420 },
    { x: 75, y: 415 },
  ]);
  const qrInner: DocumentCorners = orderCorners([
    { x: 420, y: 320 },
    { x: 520, y: 322 },
    { x: 518, y: 400 },
    { x: 418, y: 398 },
  ]);

  const outer = makeScoredCandidate(
    docOuter,
    0.51,
    0.58,
    [0.60, 0.52, 0.55, 0.48],
  );
  const inner = makeScoredCandidate(
    qrInner,
    0.04,
    0.75,
    [0.96, 0.94, 0.95, 0.93],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, docOuter);
});

test("passport page + MRZ: prefers outer page boundary when evidence is sufficient", () => {
  const pageOuter: DocumentCorners = orderCorners([
    { x: 340, y: 100 },
    { x: 510, y: 105 },
    { x: 505, y: 380 },
    { x: 335, y: 375 },
  ]);
  const mrzInner: DocumentCorners = orderCorners([
    { x: 345, y: 310 },
    { x: 500, y: 312 },
    { x: 498, y: 370 },
    { x: 343, y: 368 },
  ]);

  const outer = makeScoredCandidate(
    pageOuter,
    0.15,
    0.50,
    [0.55, 0.42, 0.48, 0.38],
  );
  const inner = makeScoredCandidate(
    mrzInner,
    0.05,
    0.78,
    [0.97, 0.95, 0.96, 0.94],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, pageOuter);
});

test("multiple nested: prefers outer boundary over multiple internal rectangles", () => {
  const outer = makeScoredCandidate(
    cardOuter,
    0.28,
    0.53,
    [0.50, 0.43, 0.47, 0.41],
  );
  const photo = makeScoredCandidate(
    photoInner,
    0.06,
    0.73,
    [0.92, 0.88, 0.90, 0.86],
  );
  const chip = makeScoredCandidate(
    chipInner,
    0.02,
    0.69,
    [0.95, 0.92, 0.94, 0.90],
  );
  const barcode = makeScoredCandidate(
    barcodeInner,
    0.05,
    0.71,
    [0.90, 0.85, 0.88, 0.84],
  );

  // The highest confidence inner candidate (photo at 0.73) should still
  // lose to the outer because outer contains it and has evidence.
  const winner = selectBestCandidate([photo, chip, barcode, outer]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardOuter);
});

test("outer boundary lower confidence but supported → outer wins via containment", () => {
  const outer = makeScoredCandidate(
    cardOuter,
    0.28,
    0.45,  // Lower confidence than inner.
    [0.44, 0.40, 0.42, 0.38],
  );
  const inner = makeScoredCandidate(
    photoInner,
    0.06,
    0.80,  // Much higher confidence.
    [0.97, 0.95, 0.96, 0.94],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(
    winner.detection.corners,
    cardOuter,
    "Outer boundary should win even with lower confidence when it has sufficient evidence",
  );
});

test("outer boundary insufficiently supported → inner candidate wins", () => {
  const weakOuter = makeScoredCandidate(
    cardOuter,
    0.28,
    0.30,
    [0.20, 0.05, 0.10, 0.08],  // Fails hasBalancedBoundaryEvidence.
  );
  const inner = makeScoredCandidate(
    photoInner,
    0.06,
    0.75,
    [0.92, 0.88, 0.90, 0.86],
  );

  const winner = selectBestCandidate([inner, weakOuter]);
  assert.ok(winner);
  assert.deepEqual(
    winner.detection.corners,
    photoInner,
    "Inner candidate should win when outer has insufficient boundary evidence",
  );
});

test("overlapping non-contained candidates → containment preference does not activate", () => {
  const a: DocumentCorners = orderCorners([
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 350 },
    { x: 100, y: 350 },
  ]);
  const b: DocumentCorners = orderCorners([
    { x: 250, y: 200 },
    { x: 550, y: 200 },
    { x: 550, y: 400 },
    { x: 250, y: 400 },
  ]);

  const candidateA = makeScoredCandidate(
    a,
    0.25,
    0.60,
    [0.55, 0.50, 0.52, 0.48],
  );
  const candidateB = makeScoredCandidate(
    b,
    0.20,
    0.65,
    [0.60, 0.55, 0.58, 0.52],
  );

  // B is not contained in A and A is not contained in B.
  const winner = selectBestCandidate([candidateA, candidateB]);
  assert.ok(winner);
  assert.deepEqual(
    winner.detection.corners,
    b,
    "Highest confidence wins when no containment relationship exists",
  );
});

test("area ratio exactly at 1.5× boundary → containment preference activates", () => {
  const outer = makeScoredCandidate(
    cardOuter,
    0.15,
    0.50,
    [0.50, 0.44, 0.46, 0.42],
  );
  const inner = makeScoredCandidate(
    photoInner,
    0.10,  // 0.15 / 0.10 = 1.5 — exactly at boundary.
    0.70,
    [0.92, 0.88, 0.90, 0.86],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(
    winner.detection.corners,
    cardOuter,
    "Containment should activate at exactly 1.5× area ratio",
  );
});

test("area ratio below 1.5× → containment preference does not activate", () => {
  const slightlyLarger: DocumentCorners = orderCorners([
    { x: 140, y: 140 },
    { x: 310, y: 142 },
    { x: 308, y: 320 },
    { x: 138, y: 318 },
  ]);
  const inner = makeScoredCandidate(
    photoInner,
    0.06,
    0.72,
    [0.92, 0.88, 0.90, 0.86],
  );
  const outer = makeScoredCandidate(
    slightlyLarger,
    0.08,  // 0.08 / 0.06 = 1.33 — below 1.5×.
    0.55,
    [0.50, 0.44, 0.46, 0.42],
  );

  const winner = selectBestCandidate([inner, outer]);
  assert.ok(winner);
  assert.deepEqual(
    winner.detection.corners,
    photoInner,
    "Containment should not activate when area ratio is below 1.5×",
  );
});

test("single candidate returns that candidate", () => {
  const single = makeScoredCandidate(
    cardOuter,
    0.28,
    0.60,
    [0.55, 0.50, 0.52, 0.48],
  );

  const winner = selectBestCandidate([single]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardOuter);
});

test("empty candidate array returns null", () => {
  assert.equal(selectBestCandidate([]), null);
});

test("strong inner rectangle with no outer candidate → inner wins", () => {
  // Only one candidate — the inner rectangle. No outer boundary at all.
  const inner = makeScoredCandidate(
    photoInner,
    0.06,
    0.75,
    [0.92, 0.88, 0.90, 0.86],
  );

  const winner = selectBestCandidate([inner]);
  assert.ok(winner);
  assert.deepEqual(
    winner.detection.corners,
    photoInner,
    "Should not reject an inner candidate when it is the only legitimate detection",
  );
});

test("existing A4 document scoring continues to work", () => {
  const a4Candidate = validateQuadrilateral(
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

  assert.ok(a4Candidate);
  assert.ok(a4Candidate.metrics.areaRatio > 0.4);

  const score = scoreDocumentCandidate(
    a4Candidate,
    undefined,
    createBoundaryEvidence([0.72, 0.65, 0.68, 0.60]),
  );
  assert.ok(score > 0.5, "A4 document should score above threshold");
});

test("existing passport single-page detection continues to work", () => {
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
  assert.ok(passportPage.metrics.angleScore > 0.9);
});

// --- Regression Tests for Tolerance-Aware Containment (Cases A - H) ---

test("Case A: Card with central chip → outer card wins", () => {
  const cardCutCorners: DocumentCorners = [
    { x: 108, y: 106 },
    { x: 492, y: 106 },
    { x: 492, y: 344 },
    { x: 108, y: 344 },
  ];
  const chipCorners: DocumentCorners = [
    { x: 260, y: 170 },
    { x: 320, y: 170 },
    { x: 320, y: 220 },
    { x: 260, y: 220 },
  ];

  const outerCard = makeScoredCandidate(cardCutCorners, 0.28, 0.65, [0.55, 0.55, 0.50, 0.50]);
  const innerChip = makeScoredCandidate(chipCorners, 0.01, 0.85, [0.95, 0.95, 0.95, 0.95]);

  const winner = selectBestCandidate([innerChip, outerCard]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardCutCorners);
});

test("Case B: Card with photo touching rounded top-left corner → outer card wins", () => {
  // approxPolyDP chamfers the rounded top-left corner to (108, 106)
  const cardCutCorners: DocumentCorners = [
    { x: 108, y: 106 },
    { x: 492, y: 106 },
    { x: 492, y: 344 },
    { x: 108, y: 344 },
  ];
  // Photo is at the physical top-left of the card: (105, 105) to (220, 230)
  const photoCorners: DocumentCorners = [
    { x: 105, y: 105 },
    { x: 220, y: 105 },
    { x: 220, y: 230 },
    { x: 105, y: 230 },
  ];

  const outerCard = makeScoredCandidate(cardCutCorners, 0.28, 0.62, [0.55, 0.55, 0.50, 0.50]);
  const innerPhoto = makeScoredCandidate(photoCorners, 0.05, 0.86, [0.92, 0.90, 0.90, 0.88]);

  const winner = selectBestCandidate([innerPhoto, outerCard]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardCutCorners);
});

test("Case C: Card with barcode near bottom edge → outer card wins", () => {
  // approxPolyDP chamfers the bottom corners to y=344
  const cardCutCorners: DocumentCorners = [
    { x: 108, y: 106 },
    { x: 492, y: 106 },
    { x: 492, y: 344 },
    { x: 108, y: 344 },
  ];
  // Barcode sits near bottom edge: y=320..346
  const barcodeCorners: DocumentCorners = [
    { x: 120, y: 320 },
    { x: 480, y: 320 },
    { x: 480, y: 346 },
    { x: 120, y: 346 },
  ];

  const outerCard = makeScoredCandidate(cardCutCorners, 0.28, 0.60, [0.55, 0.55, 0.50, 0.50]);
  const innerBarcode = makeScoredCandidate(barcodeCorners, 0.03, 0.82, [0.90, 0.88, 0.88, 0.85]);

  const winner = selectBestCandidate([innerBarcode, outerCard]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardCutCorners);
});

test("Case D: Card with multiple strong internal features (photo + chip + barcode) → outer card wins", () => {
  const cardCutCorners: DocumentCorners = [
    { x: 108, y: 106 },
    { x: 492, y: 106 },
    { x: 492, y: 344 },
    { x: 108, y: 344 },
  ];
  const photoCorners: DocumentCorners = [
    { x: 105, y: 105 },
    { x: 220, y: 105 },
    { x: 220, y: 230 },
    { x: 105, y: 230 },
  ];
  const chipCorners: DocumentCorners = [
    { x: 260, y: 170 },
    { x: 320, y: 170 },
    { x: 320, y: 220 },
    { x: 260, y: 220 },
  ];
  const barcodeCorners: DocumentCorners = [
    { x: 120, y: 320 },
    { x: 480, y: 320 },
    { x: 480, y: 346 },
    { x: 120, y: 346 },
  ];

  const outerCard = makeScoredCandidate(cardCutCorners, 0.28, 0.60, [0.55, 0.55, 0.50, 0.50]);
  const innerPhoto = makeScoredCandidate(photoCorners, 0.05, 0.86, [0.92, 0.90, 0.90, 0.88]);
  const innerChip = makeScoredCandidate(chipCorners, 0.01, 0.85, [0.95, 0.95, 0.95, 0.95]);
  const innerBarcode = makeScoredCandidate(barcodeCorners, 0.03, 0.82, [0.90, 0.88, 0.88, 0.85]);

  const winner = selectBestCandidate([innerPhoto, innerChip, innerBarcode, outerCard]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, cardCutCorners);
});

test("Case E: Completely separate rectangle beside the card → NOT treated as contained", () => {
  const cardCorners: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 350, y: 100 },
    { x: 350, y: 300 },
    { x: 100, y: 300 },
  ];
  const separateRectangle: DocumentCorners = [
    { x: 380, y: 100 },
    { x: 550, y: 100 },
    { x: 550, y: 300 },
    { x: 380, y: 300 },
  ];

  assert.equal(isContainedWithin(separateRectangle, cardCorners), false);
  assert.equal(isContainedWithin(cardCorners, separateRectangle), false);
});

test("Case F: Two side-by-side document pages → neither page incorrectly contains the other", () => {
  const leftPage: DocumentCorners = [
    { x: 60, y: 80 },
    { x: 300, y: 80 },
    { x: 300, y: 420 },
    { x: 60, y: 420 },
  ];
  const rightPage: DocumentCorners = [
    { x: 320, y: 80 },
    { x: 560, y: 80 },
    { x: 560, y: 420 },
    { x: 320, y: 420 },
  ];

  assert.equal(isContainedWithin(leftPage, rightPage), false);
  assert.equal(isContainedWithin(rightPage, leftPage), false);
});

test("Case G: A4/form with internal text boxes → page boundary still wins", () => {
  const a4Page: DocumentCorners = [
    { x: 80, y: 40 },
    { x: 560, y: 40 },
    { x: 560, y: 440 },
    { x: 80, y: 440 },
  ];
  const textBox: DocumentCorners = [
    { x: 120, y: 150 },
    { x: 520, y: 150 },
    { x: 520, y: 220 },
    { x: 120, y: 220 },
  ];

  const outerPage = makeScoredCandidate(a4Page, 0.60, 0.68, [0.70, 0.70, 0.65, 0.65]);
  const innerTextBox = makeScoredCandidate(textBox, 0.08, 0.85, [0.95, 0.95, 0.90, 0.90]);

  const winner = selectBestCandidate([innerTextBox, outerPage]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, a4Page);
});

test("Case H: Passport page with internal MRZ/photo/security rectangles → passport page still wins", () => {
  const passportPageCorners: DocumentCorners = [
    { x: 330, y: 80 },
    { x: 530, y: 85 },
    { x: 525, y: 410 },
    { x: 325, y: 405 },
  ];
  const mrzBlockCorners: DocumentCorners = [
    { x: 335, y: 340 },
    { x: 520, y: 340 },
    { x: 520, y: 395 },
    { x: 335, y: 395 },
  ];

  const outerPassport = makeScoredCandidate(passportPageCorners, 0.20, 0.64, [0.60, 0.58, 0.55, 0.52]);
  const innerMrz = makeScoredCandidate(mrzBlockCorners, 0.03, 0.84, [0.95, 0.92, 0.90, 0.90]);

  const winner = selectBestCandidate([innerMrz, outerPassport]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, passportPageCorners);
});

// --- Specific Targeted Regression Tests 1 to 9 ---

test("1. photo 1–2 px from rounded card corner → outer card wins", () => {
  // Chamfered card quad (12px chamfer from (100, 100))
  const cardChamfered: DocumentCorners = [
    { x: 112, y: 112 },
    { x: 488, y: 112 },
    { x: 488, y: 338 },
    { x: 112, y: 338 },
  ];
  // Photo top-left corner is at (102, 102), 2px from physical corner (100, 100)
  const photo: DocumentCorners = [
    { x: 102, y: 102 },
    { x: 210, y: 102 },
    { x: 210, y: 230 },
    { x: 102, y: 230 },
  ];

  const outerCard = makeScoredCandidate(cardChamfered, 0.28, 0.62, [0.55, 0.55, 0.50, 0.50]);
  const innerPhoto = makeScoredCandidate(photo, 0.05, 0.90, [0.95, 0.95, 0.95, 0.95]);

  assert.equal(isContainedWithin(photo, cardChamfered), true);
  const winner = selectBestCandidate([innerPhoto, outerCard]);
  assert.deepEqual(winner?.detection.corners, cardChamfered);
});

test("2. photo touching the chamfered outer polygon → outer card wins", () => {
  const cardChamfered: DocumentCorners = [
    { x: 115, y: 112 },
    { x: 485, y: 112 },
    { x: 485, y: 338 },
    { x: 115, y: 338 },
  ];
  // Photo top edge touching chamfered top edge at y=112
  const photo: DocumentCorners = [
    { x: 115, y: 112 },
    { x: 220, y: 112 },
    { x: 220, y: 240 },
    { x: 115, y: 240 },
  ];

  const outerCard = makeScoredCandidate(cardChamfered, 0.28, 0.60, [0.55, 0.55, 0.50, 0.50]);
  const innerPhoto = makeScoredCandidate(photo, 0.05, 0.88, [0.92, 0.92, 0.90, 0.90]);

  assert.equal(isContainedWithin(photo, cardChamfered), true);
  const winner = selectBestCandidate([innerPhoto, outerCard]);
  assert.deepEqual(winner?.detection.corners, cardChamfered);
});

test("3. photo partially overlapping the chamfer tolerance → outer card wins", () => {
  const cardChamfered: DocumentCorners = [
    { x: 115, y: 112 },
    { x: 485, y: 112 },
    { x: 485, y: 338 },
    { x: 115, y: 338 },
  ];
  // Photo top-left at (100, 100), extending 15px past the chamfered edge along normal
  const photo: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 210, y: 100 },
    { x: 210, y: 230 },
    { x: 100, y: 230 },
  ];

  const outerCard = makeScoredCandidate(cardChamfered, 0.28, 0.58, [0.55, 0.50, 0.50, 0.50]);
  const innerPhoto = makeScoredCandidate(photo, 0.05, 0.92, [0.95, 0.95, 0.95, 0.95]);

  assert.equal(isContainedWithin(photo, cardChamfered), true);
  const winner = selectBestCandidate([innerPhoto, outerCard]);
  assert.deepEqual(winner?.detection.corners, cardChamfered);
});

test("4. barcode 1–2 px from card edge → outer card wins", () => {
  const cardChamfered: DocumentCorners = [
    { x: 112, y: 112 },
    { x: 488, y: 112 },
    { x: 488, y: 340 },
    { x: 112, y: 340 },
  ];
  // Barcode 2px from bottom physical boundary (y=348 vs physical y=350)
  const barcode: DocumentCorners = [
    { x: 120, y: 320 },
    { x: 480, y: 320 },
    { x: 480, y: 348 },
    { x: 120, y: 348 },
  ];

  const outerCard = makeScoredCandidate(cardChamfered, 0.28, 0.60, [0.55, 0.55, 0.50, 0.50]);
  const innerBarcode = makeScoredCandidate(barcode, 0.03, 0.85, [0.92, 0.90, 0.90, 0.88]);

  assert.equal(isContainedWithin(barcode, cardChamfered), true);
  const winner = selectBestCandidate([innerBarcode, outerCard]);
  assert.deepEqual(winner?.detection.corners, cardChamfered);
});

test("5. chip 1–2 px from card edge → outer card wins", () => {
  const cardChamfered: DocumentCorners = [
    { x: 112, y: 112 },
    { x: 488, y: 112 },
    { x: 488, y: 340 },
    { x: 112, y: 340 },
  ];
  // Chip positioned 2px from left physical boundary (x=102..160)
  const chip: DocumentCorners = [
    { x: 102, y: 180 },
    { x: 160, y: 180 },
    { x: 160, y: 230 },
    { x: 102, y: 230 },
  ];

  const outerCard = makeScoredCandidate(cardChamfered, 0.28, 0.62, [0.55, 0.55, 0.50, 0.50]);
  const innerChip = makeScoredCandidate(chip, 0.015, 0.88, [0.95, 0.95, 0.95, 0.95]);

  assert.equal(isContainedWithin(chip, cardChamfered), true);
  const winner = selectBestCandidate([innerChip, outerCard]);
  assert.deepEqual(winner?.detection.corners, cardChamfered);
});

test("6. multiple internal rectangles near different edges → outer card wins", () => {
  const cardChamfered: DocumentCorners = [
    { x: 115, y: 112 },
    { x: 485, y: 112 },
    { x: 485, y: 338 },
    { x: 115, y: 338 },
  ];
  const photo: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 210, y: 100 },
    { x: 210, y: 230 },
    { x: 100, y: 230 },
  ];
  const chip: DocumentCorners = [
    { x: 102, y: 240 },
    { x: 160, y: 240 },
    { x: 160, y: 290 },
    { x: 102, y: 290 },
  ];
  const barcode: DocumentCorners = [
    { x: 120, y: 310 },
    { x: 480, y: 310 },
    { x: 480, y: 346 },
    { x: 120, y: 346 },
  ];

  const outerCard = makeScoredCandidate(cardChamfered, 0.28, 0.58, [0.55, 0.50, 0.50, 0.50]);
  const innerPhoto = makeScoredCandidate(photo, 0.05, 0.92, [0.95, 0.95, 0.95, 0.95]);
  const innerChip = makeScoredCandidate(chip, 0.015, 0.88, [0.95, 0.95, 0.95, 0.95]);
  const innerBarcode = makeScoredCandidate(barcode, 0.03, 0.85, [0.92, 0.90, 0.90, 0.88]);

  const winner = selectBestCandidate([innerPhoto, innerChip, innerBarcode, outerCard]);
  assert.deepEqual(winner?.detection.corners, cardChamfered);
});

test("7. outer card with weak boundary vs strong internal rectangle → outer card wins", () => {
  const cardChamfered: DocumentCorners = [
    { x: 115, y: 112 },
    { x: 485, y: 112 },
    { x: 485, y: 338 },
    { x: 115, y: 338 },
  ];
  const innerPhoto: DocumentCorners = [
    { x: 105, y: 105 },
    { x: 220, y: 105 },
    { x: 220, y: 240 },
    { x: 105, y: 240 },
  ];

  // Outer card has boundary evidence barely above threshold (average 0.40, weakest 0.15)
  const outerCard = makeScoredCandidate(cardChamfered, 0.28, 0.52, [0.40, 0.45, 0.42, 0.35]);
  // Inner photo has near perfect boundary evidence (average 0.98, weakest 0.95)
  const photoCand = makeScoredCandidate(innerPhoto, 0.06, 0.94, [0.98, 0.98, 0.98, 0.95]);

  const winner = selectBestCandidate([photoCand, outerCard]);
  assert.deepEqual(winner?.detection.corners, cardChamfered);
});

test("8. genuinely separate adjacent rectangles → neither is treated as contained", () => {
  const docA: DocumentCorners = [
    { x: 50, y: 100 },
    { x: 280, y: 100 },
    { x: 280, y: 350 },
    { x: 50, y: 350 },
  ];
  const docB: DocumentCorners = [
    { x: 300, y: 100 },
    { x: 550, y: 100 },
    { x: 550, y: 350 },
    { x: 300, y: 350 },
  ];

  assert.equal(isContainedWithin(docA, docB), false);
  assert.equal(isContainedWithin(docB, docA), false);

  const candA = makeScoredCandidate(docA, 0.25, 0.70, [0.70, 0.70, 0.65, 0.65]);
  const candB = makeScoredCandidate(docB, 0.25, 0.80, [0.80, 0.80, 0.75, 0.75]);

  const winner = selectBestCandidate([candA, candB]);
  // candB wins based on higher confidence without suppressing candA as internal feature
  assert.deepEqual(winner?.detection.corners, docB);
});

test("9. two side-by-side pages → neither page incorrectly contains the other", () => {
  const leftPage: DocumentCorners = [
    { x: 60, y: 60 },
    { x: 300, y: 60 },
    { x: 300, y: 420 },
    { x: 60, y: 420 },
  ];
  const rightPage: DocumentCorners = [
    { x: 310, y: 60 },
    { x: 550, y: 60 },
    { x: 550, y: 420 },
    { x: 310, y: 420 },
  ];

  assert.equal(isContainedWithin(leftPage, rightPage), false);
  assert.equal(isContainedWithin(rightPage, leftPage), false);

  const leftCand = makeScoredCandidate(leftPage, 0.35, 0.72, [0.72, 0.70, 0.68, 0.65]);
  const rightCand = makeScoredCandidate(rightPage, 0.35, 0.76, [0.75, 0.75, 0.72, 0.70]);

  const winner = selectBestCandidate([leftCand, rightCand]);
  assert.deepEqual(winner?.detection.corners, rightPage);
});

// --- Scale-Aware Candidate Generation and Temporal Continuity Tests ---

test("document occupying 60% frame is eligible for reconstruction", () => {
  const corners: DocumentCorners = [
    { x: 50, y: 40 },
    { x: 590, y: 40 },
    { x: 590, y: 380 },
    { x: 50, y: 380 },
  ];
  const validated = validateQuadrilateral(corners, frameWidth, frameHeight, DEFAULT_DOCUMENT_DETECTOR_CONFIG);
  assert.ok(validated);
  assert.equal(validated.metrics.areaRatio >= 0.58 && validated.metrics.areaRatio <= 0.62, true);

  const evidence = createBoundaryEvidence([0.70, 0.70, 0.65, 0.65]);
  const eligible = isReconstructedCandidateEligible(
    validated,
    polygonArea(corners) * 0.95,
    evidence,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.equal(eligible, true);
});

test("document occupying 75% frame is eligible for reconstruction", () => {
  const corners: DocumentCorners = [
    { x: 30, y: 30 },
    { x: 610, y: 30 },
    { x: 610, y: 430 },
    { x: 30, y: 430 },
  ];
  const validated = validateQuadrilateral(corners, frameWidth, frameHeight, DEFAULT_DOCUMENT_DETECTOR_CONFIG);
  assert.ok(validated);
  assert.equal(validated.metrics.areaRatio >= 0.74 && validated.metrics.areaRatio <= 0.77, true);

  const evidence = createBoundaryEvidence([0.65, 0.65, 0.60, 0.60]);
  const eligible = isReconstructedCandidateEligible(
    validated,
    polygonArea(corners) * 0.95,
    evidence,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.equal(eligible, true);
});

test("document occupying 85% frame is eligible for reconstruction", () => {
  const corners: DocumentCorners = [
    { x: 15, y: 15 },
    { x: 625, y: 15 },
    { x: 625, y: 445 },
    { x: 15, y: 445 },
  ];
  const validated = validateQuadrilateral(corners, frameWidth, frameHeight, DEFAULT_DOCUMENT_DETECTOR_CONFIG);
  assert.ok(validated);
  assert.equal(validated.metrics.areaRatio >= 0.84 && validated.metrics.areaRatio <= 0.87, true);

  const evidence = createBoundaryEvidence([0.60, 0.60, 0.55, 0.55]);
  const eligible = isReconstructedCandidateEligible(
    validated,
    polygonArea(corners) * 0.95,
    evidence,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.equal(eligible, true);
});

test("close card occupying 75% frame with rounded corners → outer card wins over inner photo", () => {
  const closeCardChamfered: DocumentCorners = [
    { x: 45, y: 40 },
    { x: 595, y: 40 },
    { x: 595, y: 420 },
    { x: 45, y: 420 },
  ];
  const innerPhoto: DocumentCorners = [
    { x: 55, y: 55 },
    { x: 220, y: 55 },
    { x: 220, y: 260 },
    { x: 55, y: 260 },
  ];

  const outerCard = makeScoredCandidate(closeCardChamfered, 0.75, 0.65, [0.65, 0.60, 0.60, 0.55]);
  const photoCand = makeScoredCandidate(innerPhoto, 0.08, 0.92, [0.95, 0.95, 0.92, 0.90]);

  const winner = selectBestCandidate([photoCand, outerCard]);
  assert.deepEqual(winner?.detection.corners, closeCardChamfered);
});

test("candidate continuity across two frames maintains outer card selection", () => {
  const frame1Card: DocumentCorners = [
    { x: 100, y: 80 },
    { x: 540, y: 80 },
    { x: 540, y: 380 },
    { x: 100, y: 380 },
  ];
  const frame2Card: DocumentCorners = [
    { x: 102, y: 82 },
    { x: 542, y: 82 },
    { x: 542, y: 382 },
    { x: 102, y: 382 },
  ];
  const innerPhoto: DocumentCorners = [
    { x: 110, y: 90 },
    { x: 240, y: 90 },
    { x: 240, y: 240 },
    { x: 110, y: 240 },
  ];

  const outerCand = makeScoredCandidate(frame2Card, 0.40, 0.62, [0.55, 0.55, 0.50, 0.50]);
  const photoCand = makeScoredCandidate(innerPhoto, 0.06, 0.88, [0.92, 0.92, 0.90, 0.90]);

  // With frame1Card as previousCorners, outerCand gets continuity boost and wins
  const winner = selectBestCandidate([photoCand, outerCand], DEFAULT_DOCUMENT_DETECTOR_CONFIG, frame1Card);
  assert.deepEqual(winner?.detection.corners, frame2Card);
});

test("candidate continuity resets when document position changes completely", () => {
  const oldDocCorners: DocumentCorners = [
    { x: 20, y: 20 },
    { x: 200, y: 20 },
    { x: 200, y: 200 },
    { x: 20, y: 200 },
  ];
  const newDocCorners: DocumentCorners = [
    { x: 350, y: 250 },
    { x: 600, y: 250 },
    { x: 600, y: 450 },
    { x: 350, y: 450 },
  ];

  const newCand = makeScoredCandidate(newDocCorners, 0.20, 0.70, [0.70, 0.70, 0.65, 0.65]);

  // Continuity IoU between old and new is 0, so no false continuity locks
  const winner = selectBestCandidate([newCand], DEFAULT_DOCUMENT_DETECTOR_CONFIG, oldDocCorners);
  assert.deepEqual(winner?.detection.corners, newDocCorners);
});



