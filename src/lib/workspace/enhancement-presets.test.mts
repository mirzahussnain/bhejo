import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPresetToPixelBuffer,
  calculateBufferMetrics,
} from "./enhancement-presets.ts";
import type { PixelBuffer } from "../capture-processing/enhancement.ts";

/**
 * Creates a realistic 4x4 document fixture containing:
 * - Off-white paper background pixels (RGB: [215, 218, 220])
 * - Dark printed text pixels (RGB: [35, 38, 40])
 * - Colored header/stamp pixels (RGB: [195, 45, 50])
 */
function createDocumentFixture(): PixelBuffer {
  const width = 4;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);

  // Background pixels (10 pixels)
  const bg = [215, 218, 220, 255];
  // Dark text pixels (4 pixels)
  const text = [35, 38, 40, 255];
  // Colored stamp pixels (2 pixels)
  const stamp = [195, 45, 50, 255];

  const layout = [
    bg, bg, text, bg,
    bg, text, text, bg,
    bg, stamp, stamp, bg,
    bg, bg, bg, text,
  ];

  for (let i = 0; i < layout.length; i++) {
    const px = layout[i];
    data[i * 4] = px[0];
    data[i * 4 + 1] = px[1];
    data[i * 4 + 2] = px[2];
    data[i * 4 + 3] = px[3];
  }

  return { width, height, data };
}

test("preset original leaves pixel buffer strictly unchanged", () => {
  const fixture = createDocumentFixture();
  const copy = new Uint8ClampedArray(fixture.data);

  applyPresetToPixelBuffer(fixture, "original");

  assert.deepEqual(fixture.data, copy);
  const metrics = calculateBufferMetrics(fixture);
  assert.equal(metrics.isGrayscale, false);
});

test("preset grayscale converts all pixels to pure monochrome with R === G === B", () => {
  const fixture = createDocumentFixture();
  applyPresetToPixelBuffer(fixture, "grayscale");

  const metrics = calculateBufferMetrics(fixture);
  assert.equal(metrics.isGrayscale, true);

  // Assert every single pixel channel is equal
  for (let i = 0; i < fixture.data.length; i += 4) {
    const r = fixture.data[i];
    const g = fixture.data[i + 1];
    const b = fixture.data[i + 2];
    const a = fixture.data[i + 3];

    assert.equal(r, g, `Pixel ${i / 4}: R (${r}) !== G (${g})`);
    assert.equal(g, b, `Pixel ${i / 4}: G (${g}) !== B (${b})`);
    assert.equal(a, 255, `Alpha altered`);
  }
});

test("preset auto dynamically stretches contrast and levels", () => {
  const fixture = createDocumentFixture();
  const originalMetrics = calculateBufferMetrics(fixture);

  applyPresetToPixelBuffer(fixture, "auto");
  const autoMetrics = calculateBufferMetrics(fixture);

  // Auto should broaden the dynamic range
  assert.notDeepEqual(fixture.data, createDocumentFixture().data);
  assert.ok(
    autoMetrics.stdDevLuminance > 0,
    "Auto should have non-zero contrast",
  );
  // Highlight pixels should reach higher luminance than in original
  assert.ok(
    autoMetrics.maxLuminance >= originalMetrics.maxLuminance,
    `Auto max (${autoMetrics.maxLuminance}) should be >= original max (${originalMetrics.maxLuminance})`,
  );
});

test("preset document enhances text-to-background contrast significantly", () => {
  const fixture = createDocumentFixture();
  const originalMetrics = calculateBufferMetrics(fixture);

  applyPresetToPixelBuffer(fixture, "document");
  const docMetrics = calculateBufferMetrics(fixture);

  // Document mode should increase standard deviation (contrast)
  assert.ok(
    docMetrics.stdDevLuminance >= originalMetrics.stdDevLuminance,
    `Doc contrast (${docMetrics.stdDevLuminance}) should exceed original (${originalMetrics.stdDevLuminance})`,
  );

  // White paper pixels should increase
  assert.ok(
    docMetrics.whitePixelCount >= originalMetrics.whitePixelCount,
    "White paper pixels should increase in document mode",
  );
});

test("all presets produce distinct quantitative metrics", () => {
  const original = createDocumentFixture();
  const auto = createDocumentFixture();
  const doc = createDocumentFixture();
  const gray = createDocumentFixture();

  applyPresetToPixelBuffer(original, "original");
  applyPresetToPixelBuffer(auto, "auto");
  applyPresetToPixelBuffer(doc, "document");
  applyPresetToPixelBuffer(gray, "grayscale");

  const mOrig = calculateBufferMetrics(original);
  const mAuto = calculateBufferMetrics(auto);
  const mDoc = calculateBufferMetrics(doc);
  const mGray = calculateBufferMetrics(gray);

  // Verify non-zero differences
  assert.notEqual(mOrig.meanLuminance, mAuto.meanLuminance);
  assert.notEqual(mOrig.stdDevLuminance, mDoc.stdDevLuminance);
  assert.equal(mGray.isGrayscale, true);
  assert.equal(mOrig.isGrayscale, false);
});

test("rejects malformed pixel buffers with invalid dimensions", () => {
  assert.throws(
    () =>
      applyPresetToPixelBuffer(
        { width: 0, height: 0, data: new Uint8ClampedArray(0) },
        "grayscale",
      ),
    /Invalid pixel buffer dimensions/,
  );
});
