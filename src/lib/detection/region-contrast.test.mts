import assert from "node:assert/strict";
import test from "node:test";
import {
  measureCandidateRegionContrast,
  hasBalancedBoundaryEvidence,
  createBoundaryEvidence,
  type GrayscaleMap,
} from "./candidate-evidence.ts";
import { orderCorners, type DocumentCorners } from "./geometry.ts";

function createSyntheticGrayscaleMap(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => number,
): GrayscaleMap {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = pixelFn(x, y);
    }
  }
  return { data, width, height };
}

// ---------------------------------------------------------------------------
// 1. REGION CONTRAST: BRIGHT DOCUMENT ON DARKER BACKGROUND
// ---------------------------------------------------------------------------

test("measureCandidateRegionContrast detects clear positive contrast step for bright document", () => {
  const corners: DocumentCorners = orderCorners([
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 250 },
    { x: 100, y: 250 },
  ]);

  // Inside document is 220, outside is 140 (Δ = 80, polarity +1)
  const grayMap = createSyntheticGrayscaleMap(400, 350, (x, y) => {
    const isInside = x >= 100 && x <= 300 && y >= 100 && y <= 250;
    return isInside ? 220 : 140;
  });

  const result = measureCandidateRegionContrast(grayMap, corners);

  assert.ok(result.averageStep >= 75, `Expected averageStep >= 75, got ${result.averageStep}`);
  assert.ok(result.weakestStep >= 75, `Expected weakestStep >= 75, got ${result.weakestStep}`);
  assert.equal(result.polarityConsistency, 1.0, "All 4 sides must agree on positive polarity");
  assert.ok(result.regionContrastScore > 0.85, "Region contrast score should be high");

  for (let s = 0; s < 4; s += 1) {
    assert.equal(result.sideContrast[s].polarity, 1);
    assert.ok(result.sideContrast[s].insideMean > result.sideContrast[s].outsideMean);
  }
});

// ---------------------------------------------------------------------------
// 2. REGION CONTRAST: DARK DOCUMENT / CARD ON LIGHTER BACKGROUND
// ---------------------------------------------------------------------------

test("measureCandidateRegionContrast correctly handles dark cards on light surfaces without white assumption", () => {
  const corners: DocumentCorners = orderCorners([
    { x: 80, y: 80 },
    { x: 260, y: 80 },
    { x: 260, y: 200 },
    { x: 80, y: 200 },
  ]);

  // Dark card (gray 60) on light desk (gray 210) (Δ = 150, polarity -1)
  const grayMap = createSyntheticGrayscaleMap(350, 300, (x, y) => {
    const isInside = x >= 80 && x <= 260 && y >= 80 && y <= 200;
    return isInside ? 60 : 210;
  });

  const result = measureCandidateRegionContrast(grayMap, corners);

  assert.ok(result.averageStep >= 140);
  assert.equal(result.polarityConsistency, 1.0, "All 4 sides agree on negative polarity");
  for (let s = 0; s < 4; s += 1) {
    assert.equal(result.sideContrast[s].polarity, -1);
    assert.ok(result.sideContrast[s].insideMean < result.sideContrast[s].outsideMean);
  }
});

// ---------------------------------------------------------------------------
// 3. REGION CONTRAST: LOW CONTRAST SURFACE (Δ = 15)
// ---------------------------------------------------------------------------

test("measureCandidateRegionContrast reliably measures faint 15-intensity step on low-contrast surface", () => {
  const corners: DocumentCorners = orderCorners([
    { x: 100, y: 60 },
    { x: 350, y: 60 },
    { x: 350, y: 280 },
    { x: 100, y: 280 },
  ]);

  // Paper is 240, light table is 225 (Δ = 15)
  const grayMap = createSyntheticGrayscaleMap(450, 350, (x, y) => {
    const isInside = x >= 100 && x <= 350 && y >= 60 && y <= 280;
    return isInside ? 240 : 225;
  });

  const result = measureCandidateRegionContrast(grayMap, corners);

  assert.ok(result.averageStep >= 12 && result.averageStep <= 18);
  assert.equal(result.polarityConsistency, 1.0);
  assert.ok(result.regionContrastScore >= 0.40, "Faint step should still generate meaningful score");
});

// ---------------------------------------------------------------------------
// 4. REGION CONTRAST: ROBUSTNESS TO ISOLATED SPIKES (WOOD GRAIN / TEXT)
// ---------------------------------------------------------------------------

test("measureCandidateRegionContrast trimmed mean ignores isolated crossing noise streaks", () => {
  const corners: DocumentCorners = orderCorners([
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 250 },
    { x: 100, y: 250 },
  ]);

  // Inside 230, outside 180 (Δ = 50), but with 2 sharp dark streaks crossing at x=140 and x=220
  const grayMap = createSyntheticGrayscaleMap(400, 350, (x, y) => {
    if (x === 140 || x === 220) {
      return 40; // dark grain streak
    }
    const isInside = x >= 100 && x <= 300 && y >= 100 && y <= 250;
    return isInside ? 230 : 180;
  });

  const result = measureCandidateRegionContrast(grayMap, corners);

  // Robust trimmed mean should not be pulled down by the 2 isolated streak lines
  assert.ok(result.averageStep >= 45, `Expected step >= 45 despite streak, got ${result.averageStep}`);
});

// ---------------------------------------------------------------------------
// 5. REGION CONTRAST: FLAT BACKGROUND / GRID REJECTION
// ---------------------------------------------------------------------------

test("measureCandidateRegionContrast reports near-zero contrast for arbitrary rect on uniform or grid surface", () => {
  const corners: DocumentCorners = orderCorners([
    { x: 80, y: 80 },
    { x: 240, y: 80 },
    { x: 240, y: 200 },
    { x: 80, y: 200 },
  ]);

  // Pure grid background without any document: grid lines every 40px
  const grayMap = createSyntheticGrayscaleMap(320, 280, (x, y) => {
    const isGrid = x % 40 < 2 || y % 40 < 2;
    return isGrid ? 100 : 180;
  });

  const result = measureCandidateRegionContrast(grayMap, corners);

  // Both inside and outside the proposed rect are the same grid surface
  assert.ok(result.averageStep <= 5, `Expected near zero step for background rect, got ${result.averageStep}`);
  assert.ok(result.regionContrastScore < 0.20, "Background rect should receive low contrast score");
});

// ---------------------------------------------------------------------------
// 6. ADDITIVE EVIDENCE FUSION WITH REGION CONTRAST
// ---------------------------------------------------------------------------

test("hasBalancedBoundaryEvidence redeems a candidate with 1 shadowed side when physical region contrast is strong", () => {
  const corners: DocumentCorners = orderCorners([
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 250 },
    { x: 100, y: 250 },
  ]);

  const grayMap = createSyntheticGrayscaleMap(400, 350, (x, y) => {
    const isInside = x >= 100 && x <= 300 && y >= 100 && y <= 250;
    return isInside ? 240 : 180; // Δ = 60
  });

  const regionContrast = measureCandidateRegionContrast(grayMap, corners);

  // Suppose side 3 has only 0.05 Canny support due to a soft phone shadow,
  // while sides 0, 1, 2 have 0.70 support.
  const evidenceWithoutRC = createBoundaryEvidence([0.70, 0.70, 0.70, 0.05]);
  assert.equal(
    hasBalancedBoundaryEvidence(evidenceWithoutRC),
    false,
    "Without region contrast, side with 0.05 support fails minimumSideSupport (0.12)",
  );

  // With region contrast attached, the physical step across side 3 redeems the side
  const evidenceWithRC = createBoundaryEvidence([0.70, 0.70, 0.70, 0.05], undefined, regionContrast);
  assert.equal(
    hasBalancedBoundaryEvidence(evidenceWithRC),
    true,
    "With region contrast, physically verified boundary step satisfies evidence balance",
  );
});
