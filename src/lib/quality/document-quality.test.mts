import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DOCUMENT_QUALITY_CONFIG,
  evaluateDocumentQuality,
  type PixelBuffer,
} from "./document-quality.ts";

const width = 100;
const height = 80;
const corners = [
  { x: 15, y: 10 },
  { x: 85, y: 10 },
  { x: 85, y: 70 },
  { x: 15, y: 70 },
] as const;

function createPixels({
  brightness = 150,
  sharp = true,
}: {
  readonly brightness?: number;
  readonly sharp?: boolean;
} = {}): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const value = sharp && (x + y) % 2 === 0 ? brightness + 30 : brightness;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

function evaluate(overrides: Partial<Parameters<typeof evaluateDocumentQuality>[0]> = {}) {
  return evaluateDocumentQuality({
    corners,
    areaRatio: 0.525,
    pixels: createPixels(),
    ...overrides,
  });
}

test("accepts a well-framed, sharp, normally lit document", () => {
  const result = evaluate();
  assert.equal(result.isAcceptable, true);
  assert.equal(result.guidance, "ready");
});

test("rejects insufficient document coverage", () => {
  const result = evaluate({ areaRatio: 0.08 });
  assert.equal(result.coverage, false);
  assert.equal(result.guidance, "move-closer");
});

test("rejects a document touching the usable frame boundary", () => {
  const result = evaluate({
    corners: [
      { x: 1, y: 10 },
      { x: 85, y: 10 },
      { x: 85, y: 70 },
      { x: 1, y: 70 },
    ],
  });
  assert.equal(result.boundaries, false);
  assert.equal(result.guidance, "move-away-from-edge");
});

test("rejects a blur score below the configured threshold", () => {
  const result = evaluate({ pixels: createPixels({ sharp: false }) });
  assert.equal(result.sharpness, false);
  assert.equal(result.guidance, "hold-still");
});

test("rejects an unusably dark document region", () => {
  const result = evaluate({ pixels: createPixels({ brightness: 25 }) });
  assert.equal(result.brightness, false);
  assert.equal(result.guidance, "move-into-better-light");
});

test("prioritizes framing guidance over later quality failures", () => {
  const result = evaluate({
    areaRatio: DEFAULT_DOCUMENT_QUALITY_CONFIG.minCoverageRatio / 2,
    pixels: createPixels({ brightness: 25, sharp: false }),
  });
  assert.equal(result.isAcceptable, false);
  assert.equal(result.guidance, "move-closer");
});
