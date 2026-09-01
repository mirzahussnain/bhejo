import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBrightnessAdjustment,
  enhancePixelBuffer,
} from "./enhancement.ts";

test("limits brightness normalization to a conservative adjustment", () => {
  assert.equal(calculateBrightnessAdjustment(0), 10);
  assert.equal(calculateBrightnessAdjustment(255), -10);
  assert.equal(calculateBrightnessAdjustment(145), 0);
});

test("enhances colour pixels without producing invalid channel values", () => {
  const data = new Uint8ClampedArray([
    20, 30, 80, 255,
    120, 80, 40, 255,
    220, 210, 190, 255,
    255, 250, 240, 255,
  ]);
  enhancePixelBuffer({ width: 2, height: 2, data });

  assert.equal(data.length, 16);
  assert.ok([...data].every((value) => value >= 0 && value <= 255));
  assert.equal(data[3], 255);
  assert.equal(data[7], 255);
  assert.notEqual(data[0], data[2]);
});

test("rejects malformed pixel buffers instead of producing partial output", () => {
  assert.throws(
    () => enhancePixelBuffer({ width: 2, height: 2, data: new Uint8ClampedArray(3) }),
    RangeError,
  );
});
