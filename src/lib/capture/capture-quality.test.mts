import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCaptureQuality } from "./capture-quality.ts";

function createMockCanvas(
  width: number,
  height: number,
  pixelFill: (x: number, y: number) => [number, number, number],
): HTMLCanvasElement {
  const buffer = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b] = pixelFill(x, y);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = 255;
    }
  }

  return {
    width,
    height,
    getContext: () => ({
      getImageData: (sx: number, sy: number, sw: number, sh: number) => {
        const patch = new Uint8ClampedArray(sw * sh * 4);
        for (let py = 0; py < sh; py++) {
          for (let px = 0; px < sw; px++) {
            const srcIdx = ((sy + py) * width + (sx + px)) * 4;
            const dstIdx = (py * sw + px) * 4;
            patch[dstIdx] = buffer[srcIdx];
            patch[dstIdx + 1] = buffer[srcIdx + 1];
            patch[dstIdx + 2] = buffer[srcIdx + 2];
            patch[dstIdx + 3] = buffer[srcIdx + 3];
          }
        }
        return { data: patch, width: sw, height: sh };
      },
    }),
  } as unknown as HTMLCanvasElement;
}

test("evaluateCaptureQuality accepts sharp, well-exposed high-resolution document image", () => {
  // Document with black text lines on white paper (high contrast, high sharpness)
  const canvas = createMockCanvas(800, 600, (x, y) => {
    const isText = y % 20 < 4 && x > 100 && x < 700;
    return isText ? [30, 30, 30] : [245, 245, 245];
  });

  const evaluation = evaluateCaptureQuality(canvas, "image-capture");
  assert.equal(evaluation.isAcceptable, true);
  assert.equal(evaluation.isBlurry, false);
  assert.equal(evaluation.isUnderexposed, false);
  assert.equal(evaluation.isOverexposed, false);
  assert.ok(evaluation.sharpness > 100);
});

test("evaluateCaptureQuality rejects severely blurred flat image", () => {
  // Flat gray image with zero edge detail
  const canvas = createMockCanvas(400, 300, () => [128, 128, 128]);

  const evaluation = evaluateCaptureQuality(canvas, "image-capture");
  assert.equal(evaluation.isAcceptable, false);
  assert.equal(evaluation.isBlurry, true);
  assert.equal(evaluation.rejectionReason, "severe-blur");
});

test("evaluateCaptureQuality rejects severe underexposure (black screen/lens blocked)", () => {
  // 95% black pixels
  const canvas = createMockCanvas(400, 300, () => [5, 5, 5]);

  const evaluation = evaluateCaptureQuality(canvas, "image-capture");
  assert.equal(evaluation.isAcceptable, false);
  assert.equal(evaluation.isUnderexposed, true);
  assert.equal(evaluation.rejectionReason, "severe-underexposure");
});

test("evaluateCaptureQuality rejects severe overexposure (whiteout/blown highlights)", () => {
  // 95% saturated white pixels
  const canvas = createMockCanvas(400, 300, () => [254, 254, 254]);

  const evaluation = evaluateCaptureQuality(canvas, "image-capture");
  assert.equal(evaluation.isAcceptable, false);
  assert.equal(evaluation.isOverexposed, true);
  assert.equal(evaluation.rejectionReason, "severe-overexposure");
});
