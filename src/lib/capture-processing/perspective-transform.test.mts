import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePerspectiveOutputDimensions,
  isValidPerspectiveQuadrilateral,
} from "./perspective-transform.ts";
import type { Point } from "../detection/geometry.ts";

const source = { width: 1920, height: 1080 };

test("derives output size from an A4-like perspective quadrilateral", () => {
  const output = calculatePerspectiveOutputDimensions([
    { x: 620, y: 100 },
    { x: 1220, y: 130 },
    { x: 1320, y: 970 },
    { x: 520, y: 930 },
  ]);

  assert.ok(output);
  assert.ok(output.height > output.width);
  assert.ok(output.width <= 2400);
});

test("uses maximum corresponding edge length to avoid downscaling close edges", () => {
  // Trapezoid where bottom edge is closer (1200px) and top edge is further (800px)
  // Left edge is 1000px, right edge is 900px
  const output = calculatePerspectiveOutputDimensions([
    { x: 200, y: 100 },
    { x: 1000, y: 100 },
    { x: 1200, y: 1000 },
    { x: 0, y: 1000 },
  ]);

  assert.ok(output);
  // Bottom width is 1200, top width is 800 -> width should be 1200 (not average 1000)
  assert.equal(output.width, 1200);
  assert.ok(output.height >= 900);
});

test("keeps narrow cards and passport-like documents proportional", () => {
  const card = calculatePerspectiveOutputDimensions([
    { x: 350, y: 330 },
    { x: 1480, y: 300 },
    { x: 1510, y: 930 },
    { x: 340, y: 960 },
  ]);
  const passport = calculatePerspectiveOutputDimensions([
    { x: 600, y: 90 },
    { x: 1320, y: 120 },
    { x: 1360, y: 1000 },
    { x: 560, y: 970 },
  ]);

  assert.ok(card && passport);
  assert.ok(card.width > card.height);
  assert.ok(passport.height > passport.width);
});

test("does not artificially upscale documents smaller than maximum limits", () => {
  const output = calculatePerspectiveOutputDimensions([
    { x: 100, y: 100 },
    { x: 600, y: 100 },
    { x: 600, y: 400 },
    { x: 100, y: 400 },
  ]);

  assert.deepEqual(output, { width: 500, height: 300 });
});

test("caps very large documents without distorting their aspect ratio", () => {
  const output = calculatePerspectiveOutputDimensions(
    [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ],
    { maxDimension: 2400, maxPixels: 6_000_000 },
  );

  assert.deepEqual(output, { width: 2400, height: 1800 });
});

test("handles extreme but valid aspect ratios safely", () => {
  // Long receipt (1:4 aspect ratio)
  const receipt = calculatePerspectiveOutputDimensions([
    { x: 200, y: 50 },
    { x: 500, y: 50 },
    { x: 500, y: 1250 },
    { x: 200, y: 1250 },
  ]);
  assert.ok(receipt);
  assert.equal(receipt.width, 300);
  assert.equal(receipt.height, 1200);

  // Wide panoramic document (3:1 aspect ratio)
  const wideDoc = calculatePerspectiveOutputDimensions([
    { x: 100, y: 100 },
    { x: 1600, y: 100 },
    { x: 1600, y: 600 },
    { x: 100, y: 600 },
  ]);
  assert.ok(wideDoc);
  assert.equal(wideDoc.width, 1500);
  assert.equal(wideDoc.height, 500);
});

test("rejects duplicate, self-intersecting, zero-area, and out-of-bounds corners", () => {
  assert.equal(
    isValidPerspectiveQuadrilateral(
      [
        { x: 300, y: 200 },
        { x: 1300, y: 200 },
        { x: 1300, y: 200 },
        { x: 300, y: 800 },
      ],
      source,
    ),
    false,
  );
  assert.equal(
    isValidPerspectiveQuadrilateral(
      [
        { x: 300, y: 200 },
        { x: 1300, y: 800 },
        { x: 1300, y: 200 },
        { x: 300, y: 800 },
      ],
      source,
    ),
    false,
  );
  assert.equal(
    isValidPerspectiveQuadrilateral(
      [
        { x: 300, y: 200 },
        { x: 900, y: 200 },
        { x: 1300, y: 200 },
        { x: 500, y: 200 },
      ],
      source,
    ),
    false,
  );
  assert.equal(
    isValidPerspectiveQuadrilateral(
      [
        { x: -1, y: 200 },
        { x: 1300, y: 200 },
        { x: 1300, y: 800 },
        { x: 300, y: 800 },
      ],
      source,
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// P0.4 REGRESSION TEST SUITE: PHYSICAL ASPECT RATIO RECTIFICATION
// ---------------------------------------------------------------------------

test("P0.4: Normal flat A4 document preserves ISO 1.414 ratio", () => {
  // Flat A4 sheet 420px x 594px (aspect ratio 594/420 = 1.4142)
  const a4Corners: [Point, Point, Point, Point] = [
    { x: 100, y: 100 },
    { x: 520, y: 100 },
    { x: 520, y: 694 },
    { x: 100, y: 694 },
  ];
  const output = calculatePerspectiveOutputDimensions(a4Corners);
  assert.ok(output);
  const ratio = output.height / output.width;
  assert.ok(Math.abs(ratio - Math.SQRT2) < 0.01, `A4 ratio was ${ratio}, expected ~1.4142`);
});

test("P0.4: Severe perspective A4 recovers true proportions", () => {
  // A4 document photographed at 35° backward tilt:
  // Top edge foreshortened to 280px, bottom edge 460px, height in image 450px
  const tiltedA4Corners: [Point, Point, Point, Point] = [
    { x: 180, y: 30 },
    { x: 460, y: 30 },
    { x: 550, y: 480 },
    { x: 90, y: 480 },
  ];
  const output = calculatePerspectiveOutputDimensions(tiltedA4Corners);
  assert.ok(output);
  const ratio = output.height / output.width;
  // Under naive Euclidean, ratio was 1.022 (27.7% distortion).
  // With P0.4 foreshortening compensation, ratio recovers to ~1.4142 (< 1.5% error)
  assert.ok(Math.abs(ratio - Math.SQRT2) < 0.025, `Severe tilted A4 ratio was ${ratio}, expected ~1.4142`);
});

test("P0.4: ID-1 card preserves 1.586 ratio under perspective tilt", () => {
  // ID-1 card (85.6mm x 53.98mm = 1.5858 ratio)
  // Tilted along vertical axis (bottom edge closer: 500px, top edge further: 420px, image height: 285px)
  const idCardCorners: [Point, Point, Point, Point] = [
    { x: 150, y: 150 },
    { x: 570, y: 150 },
    { x: 610, y: 435 },
    { x: 110, y: 435 },
  ];
  const output = calculatePerspectiveOutputDimensions(idCardCorners);
  assert.ok(output);
  const ratio = Math.max(output.width, output.height) / Math.min(output.width, output.height);
  assert.ok(Math.abs(ratio - (85.6 / 53.98)) < 0.05, `ID card ratio was ${ratio}, expected ~1.586`);
});

test("P0.4: Passport page preserves ~1.41-1.42 booklet ratio", () => {
  // B7 Passport single page (88mm x 125mm = 1.4205 ratio)
  // Tilted backward: top width 280px, bottom width 360px, image height 410px
  const passportCorners: [Point, Point, Point, Point] = [
    { x: 180, y: 50 },
    { x: 460, y: 50 },
    { x: 500, y: 460 },
    { x: 140, y: 460 },
  ];
  const output = calculatePerspectiveOutputDimensions(passportCorners);
  assert.ok(output);
  const ratio = output.height / output.width;
  assert.ok(Math.abs(ratio - Math.SQRT2) < 0.05, `Passport page ratio was ${ratio}`);
});

test("P0.4: Long receipt (3.5:1) is NOT falsely snapped to standard A4/ID ratios", () => {
  // Long store receipt: 200px width x 700px height
  const receiptCorners: [Point, Point, Point, Point] = [
    { x: 100, y: 50 },
    { x: 300, y: 50 },
    { x: 300, y: 750 },
    { x: 100, y: 750 },
  ];
  const output = calculatePerspectiveOutputDimensions(receiptCorners);
  assert.ok(output);
  const ratio = output.height / output.width;
  assert.equal(ratio, 3.5, `Receipt ratio was ${ratio}, must not be snapped to standard A4`);
});

test("P0.4: Affine and parallel geometry falls back gracefully to Euclidean ratio", () => {
  // Parallelogram (affine view, parallel sides)
  const affineCorners: [Point, Point, Point, Point] = [
    { x: 150, y: 100 },
    { x: 550, y: 100 },
    { x: 500, y: 350 },
    { x: 100, y: 350 },
  ];
  const output = calculatePerspectiveOutputDimensions(affineCorners);
  assert.ok(output);
  assert.equal(output.width, 400);
  assert.equal(output.height, 255);
});

test("P0.4: Handles f² < 0 and divergent vanishing lines safely without throwing", () => {
  // Construct a quadrilateral where vanishing point inner product is positive (yielding f² < 0)
  const fNegativeCorners: [Point, Point, Point, Point] = [
    { x: 100, y: 100 },
    { x: 400, y: 120 },
    { x: 350, y: 350 },
    { x: 120, y: 300 },
  ];
  const output = calculatePerspectiveOutputDimensions(fNegativeCorners);
  assert.ok(output);
  assert.ok(Number.isFinite(output.width));
  assert.ok(Number.isFinite(output.height));
  assert.ok(output.width > 0 && output.height > 0);
});

test("P0.4: NaN and Infinity protection prevents corrupt dimensions", () => {
  const nanCorners: [Point, Point, Point, Point] = [
    { x: NaN, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 400 },
    { x: 100, y: 400 },
  ];
  const output = calculatePerspectiveOutputDimensions(nanCorners);
  assert.equal(output, null, "NaN corner must return null");

  const infCorners: [Point, Point, Point, Point] = [
    { x: 100, y: 100 },
    { x: Infinity, y: 100 },
    { x: 400, y: 400 },
    { x: 100, y: 400 },
  ];
  const outputInf = calculatePerspectiveOutputDimensions(infCorners);
  assert.equal(outputInf, null, "Infinity corner must return null");
});

