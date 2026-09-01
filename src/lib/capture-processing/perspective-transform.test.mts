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
