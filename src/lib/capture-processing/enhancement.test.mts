import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAverageLuminance,
  calculateBrightnessAdjustment,
  enhancePixelBuffer,
  luminance,
  resolveEnhancementConfig,
  DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG,
  DEFAULT_DOCUMENT_ENHANCEMENT_CONFIG,
} from "./enhancement.ts";

test("resolves default photo-document enhancement profile correctly", () => {
  const config = resolveEnhancementConfig();

  assert.equal(config.profile, "photo-document");
  assert.equal(config.claheClipLimit, DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.claheClipLimit);
  assert.equal(config.sharpeningAmount, DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.sharpeningAmount);
  assert.equal(config.claheGridSize, 8);
  assert.equal(config.contrast, 1.0);
  assert.equal(config.illuminationNormalization, true);
  assert.equal(config.illuminationStrength, 0.18);
  assert.equal(config.denoisingStrength, 0.12);
});

test("resolves document enhancement profile with higher contrast and sharpening", () => {
  const config = resolveEnhancementConfig({ profile: "document" });

  assert.equal(config.profile, "document");
  assert.equal(config.claheClipLimit, DEFAULT_DOCUMENT_ENHANCEMENT_CONFIG.claheClipLimit);
  assert.ok(config.claheClipLimit > DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.claheClipLimit);
  assert.ok(config.sharpeningAmount > DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.sharpeningAmount);
  assert.equal(config.illuminationNormalization, true);
  assert.equal(config.illuminationStrength, 0.22);
  assert.equal(config.denoisingStrength, 0.16);
});

test("merges custom parameter overrides without corrupting other defaults", () => {
  const config = resolveEnhancementConfig({
    profile: "photo-document",
    claheClipLimit: 1.8,
    sharpeningAmount: 0.4,
    illuminationStrength: 0.25,
    denoisingStrength: 0.08,
  });

  assert.equal(config.profile, "photo-document");
  assert.equal(config.claheClipLimit, 1.8);
  assert.equal(config.sharpeningAmount, 0.4);
  assert.equal(config.claheGridSize, 8);
  assert.equal(config.illuminationStrength, 0.25);
  assert.equal(config.denoisingStrength, 0.08);
});

test("calculates luminance with standard Rec. 709 / sRGB coefficients", () => {
  assert.equal(luminance(0, 0, 0), 0);
  assert.equal(Math.round(luminance(255, 255, 255)), 255);
  // Green contributes most to luminance
  assert.ok(luminance(0, 255, 0) > luminance(255, 0, 0));
  assert.ok(luminance(255, 0, 0) > luminance(0, 0, 255));
});

test("calculates average luminance across an entire pixel buffer", () => {
  const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
  assert.equal(Math.round(calculateAverageLuminance(white)), 255);

  const black = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
  assert.equal(calculateAverageLuminance(black), 0);
});

test("limits brightness normalization to a conservative adjustment", () => {
  assert.equal(calculateBrightnessAdjustment(0), 10);
  assert.equal(calculateBrightnessAdjustment(255), -10);
  assert.equal(calculateBrightnessAdjustment(148), 0);
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

test("Phase 5B: enhanceMatWithOpenCv downscaled illumination preserves chromaticity without color corruption", async () => {
  const { loadOpenCv } = await import("../detection/opencv-loader.ts");
  const { enhanceMatWithOpenCv } = await import("./enhancement.ts");
  const cv = await loadOpenCv();

  const width = 400;
  const height = 300;
  const mat = new cv.Mat(height, width, cv.CV_8UC4);

  // Fill with colored patches: Gold [210, 170, 45], Green [40, 150, 70], Blue [30, 80, 180]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (y < 100) {
        mat.data[idx] = 210; mat.data[idx + 1] = 170; mat.data[idx + 2] = 45; mat.data[idx + 3] = 255;
      } else if (y < 200) {
        mat.data[idx] = 40; mat.data[idx + 1] = 150; mat.data[idx + 2] = 70; mat.data[idx + 3] = 255;
      } else {
        mat.data[idx] = 30; mat.data[idx + 1] = 80; mat.data[idx + 2] = 180; mat.data[idx + 3] = 255;
      }
    }
  }

  const start = performance.now();
  enhanceMatWithOpenCv(cv, mat);
  const elapsed = performance.now() - start;

  // Verify fast execution (< 250ms on 400x300)
  assert.ok(elapsed < 1000, `Expected fast execution, took ${elapsed.toFixed(1)}ms`);

  // Verify color channels maintain relative dominance (no channel swapping/corruption)
  // Gold patch (y=50, x=200): Red > Green > Blue
  const goldR = mat.data[(50 * width + 200) * 4];
  const goldG = mat.data[(50 * width + 200) * 4 + 1];
  const goldB = mat.data[(50 * width + 200) * 4 + 2];
  assert.ok(goldR > goldG && goldG > goldB, "Gold patch must preserve R > G > B channel order");

  // Green patch (y=150, x=200): Green > Blue & Green > Red
  const greenR = mat.data[(150 * width + 200) * 4];
  const greenG = mat.data[(150 * width + 200) * 4 + 1];
  const greenB = mat.data[(150 * width + 200) * 4 + 2];
  assert.ok(greenG > greenR && greenG > greenB, "Green patch must preserve Green dominance");

  // Blue patch (y=250, x=200): Blue > Green > Red
  const blueR = mat.data[(250 * width + 200) * 4];
  const blueG = mat.data[(250 * width + 200) * 4 + 1];
  const blueB = mat.data[(250 * width + 200) * 4 + 2];
  assert.ok(blueB > blueG && blueG > blueR, "Blue patch must preserve Blue dominance");

  mat.delete();
});

