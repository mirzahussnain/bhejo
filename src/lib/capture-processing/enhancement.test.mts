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
});

test("resolves document enhancement profile with higher contrast and sharpening", () => {
  const config = resolveEnhancementConfig({ profile: "document" });

  assert.equal(config.profile, "document");
  assert.equal(config.claheClipLimit, DEFAULT_DOCUMENT_ENHANCEMENT_CONFIG.claheClipLimit);
  assert.ok(config.claheClipLimit > DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.claheClipLimit);
  assert.ok(config.sharpeningAmount > DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.sharpeningAmount);
});

test("merges custom parameter overrides without corrupting other defaults", () => {
  const config = resolveEnhancementConfig({
    profile: "photo-document",
    claheClipLimit: 1.8,
    sharpeningAmount: 0.4,
  });

  assert.equal(config.profile, "photo-document");
  assert.equal(config.claheClipLimit, 1.8);
  assert.equal(config.sharpeningAmount, 0.4);
  assert.equal(config.claheGridSize, 8);
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
