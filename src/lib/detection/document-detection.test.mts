import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAdaptiveEdgeThresholds,
  generateSpreadCandidates,
  isStrongDocumentWinner,
  scoreDocumentCandidate,
  selectBestCandidate,
  DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  type DocumentCandidateStrategy,
  type DocumentDetection,
} from "./document-detection.ts";
import {
  orderCorners,
  type DocumentCorners,
  type ValidQuadrilateral,
} from "./geometry.ts";
import {
  createBoundaryEvidence,
  type CandidateBoundaryEvidence,
} from "./candidate-evidence.ts";

function createMockCandidate(
  corners: DocumentCorners,
  areaRatio: number,
  sideSupport: [number, number, number, number],
  strategy: DocumentCandidateStrategy = "standard-edge-contour",
  confidenceOverride?: number,
) {
  const boundaryEvidence: CandidateBoundaryEvidence = createBoundaryEvidence(sideSupport);
  const quad: ValidQuadrilateral = {
    corners,
    metrics: {
      area: areaRatio * 640 * 480,
      areaRatio,
      angleScore: 0.94,
      edgeConsistency: 0.92,
      boundaryScore: 0.90,
    },
  };

  const confidence =
    confidenceOverride ??
    scoreDocumentCandidate(
      quad,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG.targetAreaRatio,
      boundaryEvidence,
    );

  const detection: DocumentDetection = {
    corners,
    confidence,
    areaRatio,
    edgeSupport: boundaryEvidence.averageSupport,
    geometryScore: 0.92,
  };

  return {
    strategy,
    boundaryEvidence,
    detection,
  };
}

// ---------------------------------------------------------------------------
// 1. ADAPTIVE EDGE THRESHOLDS (OTSU-DERIVED)
// ---------------------------------------------------------------------------

test("computeAdaptiveEdgeThresholds scales thresholds appropriately for low-contrast scenes", () => {
  // Low-contrast scene (gradient Otsu ~18)
  const lowContrast = computeAdaptiveEdgeThresholds(18);
  assert.equal(lowContrast.cannyHigh, 35, "High threshold should respect safe minimum of 35");
  assert.equal(lowContrast.cannyLow, 15, "Low threshold should respect safe minimum of 15");
  assert.equal(lowContrast.macroCutoff, 8, "Macro cutoff should be at least 8");
});

test("computeAdaptiveEdgeThresholds scales thresholds appropriately for standard documents", () => {
  // Typical document boundary contrast (gradient Otsu ~40)
  const standard = computeAdaptiveEdgeThresholds(40);
  assert.equal(standard.cannyHigh, 50);
  assert.equal(standard.cannyLow, 20);
  assert.equal(standard.macroCutoff, 18);
});

test("computeAdaptiveEdgeThresholds elevates thresholds for high-texture / wood grain clutter", () => {
  // Heavy texture background (gradient Otsu ~80)
  const highTexture = computeAdaptiveEdgeThresholds(80);
  assert.equal(highTexture.cannyHigh, 100);
  assert.equal(highTexture.cannyLow, 40);
  assert.equal(highTexture.macroCutoff, 36);
});

test("computeAdaptiveEdgeThresholds guards safely against NaN, Infinity, and extreme values", () => {
  const nanResult = computeAdaptiveEdgeThresholds(NaN);
  assert.ok(Number.isFinite(nanResult.cannyHigh));
  assert.ok(Number.isFinite(nanResult.cannyLow));
  assert.ok(nanResult.cannyHigh >= 35);
  assert.ok(nanResult.cannyLow >= 15);

  const infResult = computeAdaptiveEdgeThresholds(Infinity);
  assert.ok(infResult.cannyHigh <= 120);

  const negativeResult = computeAdaptiveEdgeThresholds(-50);
  assert.equal(negativeResult.cannyHigh, 35);
  assert.equal(negativeResult.cannyLow, 15);
});

// ---------------------------------------------------------------------------
// 2. STRONG DOCUMENT FAST-PATH GUARD
// ---------------------------------------------------------------------------

test("isStrongDocumentWinner approves decisive high-confidence documents", () => {
  const strongDoc = createMockCandidate(
    orderCorners([
      { x: 100, y: 50 },
      { x: 540, y: 50 },
      { x: 540, y: 430 },
      { x: 100, y: 430 },
    ]),
    0.45,
    [0.85, 0.90, 0.88, 0.82],
    "standard-edge-contour",
  );

  assert.ok(isStrongDocumentWinner(strongDoc));
});

test("isStrongDocumentWinner rejects small internal features (photos, chips, barcodes)", () => {
  const internalPhoto = createMockCandidate(
    orderCorners([
      { x: 150, y: 100 },
      { x: 250, y: 100 },
      { x: 250, y: 220 },
      { x: 150, y: 220 },
    ]),
    0.05, // Small area ratio < 0.18
    [0.90, 0.92, 0.89, 0.91],
    "standard-edge-contour",
  );

  assert.equal(isStrongDocumentWinner(internalPhoto), false, "Small feature must not skip adaptive stage");
});

test("isStrongDocumentWinner rejects candidates with weak or missing sides", () => {
  const brokenSideCandidate = createMockCandidate(
    orderCorners([
      { x: 100, y: 50 },
      { x: 540, y: 50 },
      { x: 540, y: 430 },
      { x: 100, y: 430 },
    ]),
    0.40,
    [0.85, 0.15, 0.88, 0.82], // Side 2 has only 0.15 support (< 0.25)
    "standard-edge-contour",
  );

  assert.equal(isStrongDocumentWinner(brokenSideCandidate), false, "Broken edge must trigger adaptive fusion");
});

test("isStrongDocumentWinner handles null gracefully", () => {
  assert.equal(isStrongDocumentWinner(null), false);
});

// ---------------------------------------------------------------------------
// 3. CANDIDATE HIERARCHY & ADAPTIVE FUSION SELECTION
// ---------------------------------------------------------------------------

test("adaptive outer document candidate encloses and defeats internal photo candidate", () => {
  // Standard pass found internal photo (areaRatio 0.05)
  const photoCandidate = createMockCandidate(
    orderCorners([
      { x: 180, y: 140 },
      { x: 280, y: 140 },
      { x: 280, y: 260 },
      { x: 180, y: 260 },
    ]),
    0.05,
    [0.88, 0.85, 0.90, 0.86],
    "standard-edge-contour",
    0.72,
  );

  // Adaptive multi-scale pass discovered enclosing ID card boundary (areaRatio 0.42)
  const cardCandidate = createMockCandidate(
    orderCorners([
      { x: 120, y: 80 },
      { x: 520, y: 80 },
      { x: 520, y: 400 },
      { x: 120, y: 400 },
    ]),
    0.42,
    [0.78, 0.72, 0.75, 0.70],
    "adaptive-edge-contour",
    0.70,
  );

  const winner = selectBestCandidate([photoCandidate, cardCandidate]);
  assert.ok(winner);
  assert.equal(winner.strategy, "adaptive-edge-contour");
  assert.deepEqual(winner.detection.corners, cardCandidate.detection.corners, "Outer card must defeat inner photo");
});

test("adaptive candidate with complete 4-sided support defeats standard candidate with broken side", () => {
  const brokenStandardCandidate = createMockCandidate(
    orderCorners([
      { x: 100, y: 60 },
      { x: 540, y: 60 },
      { x: 540, y: 420 },
      { x: 100, y: 420 },
    ]),
    0.40,
    [0.35, 0.70, 0.38, 0.65], // Top & bottom faint
    "standard-edge-contour",
  );

  const reconnectedAdaptiveCandidate = createMockCandidate(
    orderCorners([
      { x: 100, y: 60 },
      { x: 540, y: 60 },
      { x: 540, y: 420 },
      { x: 100, y: 420 },
    ]),
    0.40,
    [0.72, 0.75, 0.70, 0.72], // All 4 sides reconnected by adaptive fusion
    "adaptive-edge-contour",
  );

  assert.ok(reconnectedAdaptiveCandidate.detection.confidence > brokenStandardCandidate.detection.confidence);

  const winner = selectBestCandidate([brokenStandardCandidate, reconnectedAdaptiveCandidate]);
  assert.ok(winner);
  assert.equal(winner.strategy, "adaptive-edge-contour");
});

test("temporal continuity boost (+0.06) preserves tracking stability across frames", () => {
  const prevCorners = orderCorners([
    { x: 40, y: 60 },
    { x: 300, y: 60 },
    { x: 300, y: 420 },
    { x: 40, y: 420 },
  ]);

  const existingTrackedCandidate = createMockCandidate(
    orderCorners([
      { x: 41, y: 61 },
      { x: 299, y: 60 },
      { x: 301, y: 419 },
      { x: 40, y: 421 },
    ]),
    0.25,
    [0.65, 0.65, 0.65, 0.65],
    "adaptive-edge-contour",
    0.60,
  );

  // Side-by-side competing candidate (not enclosed)
  const competingCandidate = createMockCandidate(
    orderCorners([
      { x: 340, y: 60 },
      { x: 600, y: 60 },
      { x: 600, y: 420 },
      { x: 340, y: 420 },
    ]),
    0.25,
    [0.90, 0.90, 0.90, 0.90],
    "standard-edge-contour",
    0.63, // Slightly higher raw confidence than 0.60
  );

  // Without temporal history, competing candidate with 0.63 wins
  const winnerWithoutHistory = selectBestCandidate([existingTrackedCandidate, competingCandidate], undefined, null);
  assert.equal(winnerWithoutHistory?.strategy, "standard-edge-contour");

  // With temporal history, existing tracked document receives +0.06 (0.60 + 0.06 = 0.66 > 0.63)
  const winnerWithHistory = selectBestCandidate([existingTrackedCandidate, competingCandidate], undefined, prevCorners);
  assert.equal(winnerWithHistory?.strategy, "adaptive-edge-contour");
  assert.deepEqual(winnerWithHistory?.detection.corners, existingTrackedCandidate.detection.corners);
});

// ---------------------------------------------------------------------------
// 4. P0.2 — OPEN-BOOK / OPEN-PASSPORT SPREAD GEOMETRY
// ---------------------------------------------------------------------------

import type { EdgeMap } from "./candidate-evidence.ts";

function createEdgeMapWithPerimeter(
  width: number,
  height: number,
  corners: DocumentCorners,
): EdgeMap {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < 4; i += 1) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    for (let step = 0; step <= len; step += 1) {
      const x = Math.round(p1.x + ((p2.x - p1.x) * step) / len);
      const y = Math.round(p1.y + ((p2.y - p1.y) * step) / len);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        data[y * width + x] = 255;
      }
    }
  }
  return { data, width, height };
}

test("P0.2: generates open spread candidate from two adjacent passport pages with central fold", () => {
  const frameW = 640;
  const frameH = 480;

  // Left page of passport: (100, 90) -> (318, 400), width 218, height 310, aspect ratio ~1.42
  const leftCorners = orderCorners([
    { x: 100, y: 90 },
    { x: 318, y: 90 },
    { x: 318, y: 400 },
    { x: 100, y: 400 },
  ]);

  // Right page of passport: (322, 90) -> (540, 400), width 218, height 310, aspect ratio ~1.42
  // Spine gap is 4px (318 to 322)
  const rightCorners = orderCorners([
    { x: 322, y: 90 },
    { x: 540, y: 90 },
    { x: 540, y: 400 },
    { x: 322, y: 400 },
  ]);

  const leftCandidate = createMockCandidate(leftCorners, 0.22, [0.85, 0.90, 0.85, 0.88]);
  const rightCandidate = createMockCandidate(rightCorners, 0.22, [0.85, 0.88, 0.85, 0.90]);

  // Outer boundary of the open spread: (100, 90) -> (540, 400)
  const expectedSpreadCorners = orderCorners([
    { x: 100, y: 90 },
    { x: 540, y: 90 },
    { x: 540, y: 400 },
    { x: 100, y: 400 },
  ]);

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, expectedSpreadCorners);

  const spreads = generateSpreadCandidates(
    [leftCandidate, rightCandidate],
    edgeMap,
    frameW,
    frameH,
  );

  assert.equal(spreads.length, 1, "Must generate exactly one open spread candidate");
  const spread = spreads[0];
  assert.equal(spread.strategy, "open-spread-hypothesis");

  // Verify that outer boundary matches the combined spread (omitting center spine)
  for (let i = 0; i < 4; i += 1) {
    assert.ok(
      Math.hypot(
        spread.detection.corners[i].x - expectedSpreadCorners[i].x,
        spread.detection.corners[i].y - expectedSpreadCorners[i].y,
      ) <= 2.0,
      `Corner ${i} must match outer spread`,
    );
  }
});

test("P0.2: spread candidate defeats internal MRZ and photo in candidate hierarchy", () => {
  const frameW = 640;
  const frameH = 480;

  const leftCorners = orderCorners([
    { x: 100, y: 90 },
    { x: 318, y: 90 },
    { x: 318, y: 400 },
    { x: 100, y: 400 },
  ]);

  const rightCorners = orderCorners([
    { x: 322, y: 90 },
    { x: 540, y: 90 },
    { x: 540, y: 400 },
    { x: 322, y: 400 },
  ]);

  // Internal photo on left page
  const photoCorners = orderCorners([
    { x: 130, y: 130 },
    { x: 230, y: 130 },
    { x: 230, y: 260 },
    { x: 130, y: 260 },
  ]);

  // Internal MRZ on right page
  const mrzCorners = orderCorners([
    { x: 330, y: 345 },
    { x: 520, y: 345 },
    { x: 520, y: 385 },
    { x: 330, y: 385 },
  ]);

  const leftCandidate = createMockCandidate(leftCorners, 0.22, [0.85, 0.90, 0.85, 0.88]);
  const rightCandidate = createMockCandidate(rightCorners, 0.22, [0.85, 0.88, 0.85, 0.90]);
  const photoCandidate = createMockCandidate(photoCorners, 0.042, [0.92, 0.90, 0.92, 0.90]);
  const mrzCandidate = createMockCandidate(mrzCorners, 0.025, [0.95, 0.92, 0.95, 0.92]);

  const expectedSpreadCorners = orderCorners([
    { x: 100, y: 90 },
    { x: 540, y: 90 },
    { x: 540, y: 400 },
    { x: 100, y: 400 },
  ]);

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, expectedSpreadCorners);

  const spreads = generateSpreadCandidates(
    [leftCandidate, rightCandidate, photoCandidate, mrzCandidate],
    edgeMap,
    frameW,
    frameH,
  );

  assert.equal(spreads.length, 1);
  const spreadCandidate = spreads[0];

  // Run selection hierarchy with all candidates
  const winner = selectBestCandidate([
    leftCandidate,
    rightCandidate,
    photoCandidate,
    mrzCandidate,
    spreadCandidate,
  ]);

  assert.ok(winner);
  assert.equal(winner.strategy, "open-spread-hypothesis");
  assert.deepEqual(winner.detection.corners, spreadCandidate.detection.corners, "Outer spread must defeat individual pages and internal features");
});

test("P0.2: rejects two independent side-by-side sheets when spine gap is excessive", () => {
  const frameW = 640;
  const frameH = 480;

  // Sheet 1: (50, 90) -> (250, 400)
  const sheet1 = createMockCandidate(
    orderCorners([
      { x: 50, y: 90 },
      { x: 250, y: 90 },
      { x: 250, y: 400 },
      { x: 50, y: 400 },
    ]),
    0.20,
    [0.85, 0.85, 0.85, 0.85],
  );

  // Sheet 2: (350, 90) -> (550, 400) -- gap is 100px! (250 to 350)
  const sheet2 = createMockCandidate(
    orderCorners([
      { x: 350, y: 90 },
      { x: 550, y: 90 },
      { x: 550, y: 400 },
      { x: 350, y: 400 },
    ]),
    0.20,
    [0.85, 0.85, 0.85, 0.85],
  );

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, sheet1.detection.corners);

  const spreads = generateSpreadCandidates([sheet1, sheet2], edgeMap, frameW, frameH);
  assert.equal(spreads.length, 0, "Independent sheets separated by gap must not merge");
});

test("P0.2: rejects two documents with extreme size mismatch", () => {
  const frameW = 640;
  const frameH = 480;

  // Large document: areaRatio ~0.35
  const largeDoc = createMockCandidate(
    orderCorners([
      { x: 100, y: 80 },
      { x: 350, y: 80 },
      { x: 350, y: 420 },
      { x: 100, y: 420 },
    ]),
    0.35,
    [0.85, 0.85, 0.85, 0.85],
  );

  // Small card: areaRatio ~0.10
  const smallCard = createMockCandidate(
    orderCorners([
      { x: 354, y: 150 },
      { x: 500, y: 150 },
      { x: 500, y: 250 },
      { x: 354, y: 250 },
    ]),
    0.10,
    [0.85, 0.85, 0.85, 0.85],
  );

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, largeDoc.detection.corners);
  const spreads = generateSpreadCandidates([largeDoc, smallCard], edgeMap, frameW, frameH);
  assert.equal(spreads.length, 0, "Mismatched sizes must not form a spread");
});

test("P0.2: rejects overlapping unrelated rectangles", () => {
  const frameW = 640;
  const frameH = 480;

  // Quad 1: (100, 100) -> (350, 350)
  const quad1 = createMockCandidate(
    orderCorners([
      { x: 100, y: 100 },
      { x: 350, y: 100 },
      { x: 350, y: 350 },
      { x: 100, y: 350 },
    ]),
    0.20,
    [0.80, 0.80, 0.80, 0.80],
  );

  // Quad 2: (250, 100) -> (500, 350) (heavily overlaps quad 1 from x=250 to x=350)
  const quad2 = createMockCandidate(
    orderCorners([
      { x: 250, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 350 },
      { x: 250, y: 350 },
    ]),
    0.20,
    [0.80, 0.80, 0.80, 0.80],
  );

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, quad1.detection.corners);
  const spreads = generateSpreadCandidates([quad1, quad2], edgeMap, frameW, frameH);
  assert.equal(spreads.length, 0, "Overlapping rectangles must not merge into spread");
});

test("P0.2: preserves single passport page without false spread merging", () => {
  const frameW = 640;
  const frameH = 480;

  const singlePage = createMockCandidate(
    orderCorners([
      { x: 180, y: 90 },
      { x: 420, y: 90 },
      { x: 420, y: 400 },
      { x: 180, y: 400 },
    ]),
    0.25,
    [0.85, 0.85, 0.85, 0.85],
  );

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, singlePage.detection.corners);
  const spreads = generateSpreadCandidates([singlePage], edgeMap, frameW, frameH);
  assert.equal(spreads.length, 0, "Single page must not produce spread candidate");
});

test("P0.2: preserves standalone ID card without false spread merging", () => {
  const frameW = 640;
  const frameH = 480;

  const idCard = createMockCandidate(
    orderCorners([
      { x: 120, y: 120 },
      { x: 520, y: 120 },
      { x: 520, y: 370 },
      { x: 120, y: 370 },
    ]),
    0.32,
    [0.90, 0.90, 0.90, 0.90],
  );

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, idCard.detection.corners);
  const spreads = generateSpreadCandidates([idCard], edgeMap, frameW, frameH);
  assert.equal(spreads.length, 0, "ID card must not produce spread candidate");
});

test("P0.2: preserves standalone A4 document without false spread merging", () => {
  const frameW = 640;
  const frameH = 480;

  const a4Doc = createMockCandidate(
    orderCorners([
      { x: 100, y: 50 },
      { x: 540, y: 50 },
      { x: 540, y: 430 },
      { x: 100, y: 430 },
    ]),
    0.45,
    [0.92, 0.92, 0.92, 0.92],
  );

  const edgeMap = createEdgeMapWithPerimeter(frameW, frameH, a4Doc.detection.corners);
  const spreads = generateSpreadCandidates([a4Doc], edgeMap, frameW, frameH);
  assert.equal(spreads.length, 0, "A4 document must not produce spread candidate");
});

