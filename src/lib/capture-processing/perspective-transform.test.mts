import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePerspectiveOutputDimensions,
  isValidPerspectiveQuadrilateral,
} from "./perspective-transform.ts";

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
