import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCaptureQuality,
  DEFAULT_CAPTURE_QUALITY_CONFIG,
} from "./capture-quality.ts";
import { RecentFrameBuffer } from "./recent-frame-buffer.ts";
import {
  calculatePerspectiveOutputDimensions,
  expandCornersWithSafetyMargin,
} from "../capture-processing/perspective-transform.ts";

/**
 * Creates a mock canvas where getImageData correctly samples from the internal buffer.
 */
function createTestCanvas(
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

test("Capture Quality Benchmark: High-Resolution Still vs Low-Resolution Video Frame", () => {
  // Scenario A: 1080p Video snapshot (1920x1080, ~2MP) with mild video blur
  const videoCanvas = createTestCanvas(1920, 1080, (x, y) => {
    const isDoc = x > 192 && x < 1728 && y > 108 && y < 972;
    if (!isDoc) return [210, 210, 210];
    // Coarser text line pattern (lower frequency)
    const isLine = y % 30 < 6;
    return isLine ? [50, 50, 50] : [245, 245, 245];
  });
  const videoEval = evaluateCaptureQuality(videoCanvas, "video-frame");

  // Scenario B: 12MP Still Capture (4032x3024, ~12.2MP) with ultra-crisp micro text
  const stillCanvas = createTestCanvas(4032, 3024, (x, y) => {
    const isDoc = x > 403 && x < 3629 && y > 302 && y < 2722;
    if (!isDoc) return [210, 210, 210];
    // Crisp fine text line pattern (high spatial frequency)
    const isLine = y % 12 < 3 && x % 8 !== 0;
    return isLine ? [25, 25, 25] : [248, 248, 248];
  });
  const stillEval = evaluateCaptureQuality(stillCanvas, "image-capture");

  // Verify resolution multiplier: 4032x3024 vs 1920x1080 is 5.88x
  const videoPixels = 1920 * 1080;
  const stillPixels = 4032 * 3024;
  const resolutionMultiplier = stillPixels / videoPixels;

  assert.ok(
    resolutionMultiplier >= 5.8,
    `Expected >= 5.8x resolution increase, got ${resolutionMultiplier.toFixed(2)}x`,
  );

  // Both should pass quality gate
  assert.equal(videoEval.isAcceptable, true);
  assert.equal(stillEval.isAcceptable, true);

  // Still photo must exhibit measurably higher fine-edge sharpness
  assert.ok(
    stillEval.sharpness > videoEval.sharpness,
    `Still sharpness (${stillEval.sharpness}) must exceed video sharpness (${videoEval.sharpness})`,
  );
});

test("Motion Tests: Test A — Stable document capture accepted without retry", () => {
  const canvas = createTestCanvas(4032, 3024, (x, y) => {
    const isDoc = x > 400 && x < 3600 && y > 300 && y < 2700;
    if (!isDoc) return [200, 200, 200];
    const isText = y % 16 < 4;
    return isText ? [30, 30, 30] : [245, 245, 245];
  });
  const evaluation = evaluateCaptureQuality(canvas, "image-capture");

  assert.equal(evaluation.isAcceptable, true);
  assert.equal(evaluation.isBlurry, false);
  assert.equal(evaluation.rejectionReason, undefined);
});

test("Motion Tests: Test B — Immediate slight phone movement triggers quality rejection for retry", () => {
  // Simulate directional motion blur across camera axis (sharpness drops into settle zone, extreme anisotropy)
  const canvas = createTestCanvas(4032, 3024, (_x, y) => {
    const v = Math.round(128 + 21 * Math.sin(y / 3));
    return [v, v, v];
  });
  const evaluation = evaluateCaptureQuality(canvas, "image-capture");

  // Extreme motion anisotropy between X and Y gradients triggers severe-motion
  assert.ok(
    evaluation.motionAnisotropy > DEFAULT_CAPTURE_QUALITY_CONFIG.maxMotionAnisotropy,
    `Expected motionAnisotropy > ${DEFAULT_CAPTURE_QUALITY_CONFIG.maxMotionAnisotropy}, got ${evaluation.motionAnisotropy}`,
  );
  assert.equal(evaluation.isAcceptable, false);
  assert.equal(evaluation.rejectionReason, "severe-motion");
});

test("Motion Tests: Test C — Severe movement rejected and successfully falls back to buffered video frame", () => {
  const buffer = new RecentFrameBuffer(2);

  const originalCreateElement = globalThis.document?.createElement;
  globalThis.document = {
    createElement: () => ({
      width: 1920,
      height: 1080,
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray(240 * 240 * 4).fill(128),
        }),
      }),
    }),
  } as unknown as Document;

  try {
    const mockVideo = {
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement;

    buffer.recordFrame(mockVideo, 0.90, 1000);
    const bestBefore = buffer.getBestFrame();
    assert.ok(bestBefore !== null);

    // Blurry still photo (flat color with negligible sharpness)
    const blurryStill = createTestCanvas(4032, 3024, () => [200, 200, 200]);
    const evaluation = evaluateCaptureQuality(blurryStill, "image-capture");

    assert.equal(evaluation.isAcceptable, false);
    assert.equal(evaluation.rejectionReason, "severe-blur");

    // System falls back to buffered video frame
    const fallback = buffer.getBestFrame();
    assert.ok(fallback !== null);
    assert.equal(fallback.width, 1920);
    assert.equal(fallback.height, 1080);

    buffer.releaseAll();
  } finally {
    if (originalCreateElement && globalThis.document) {
      globalThis.document.createElement = originalCreateElement;
    }
  }
});

test("Exposure Tests: Extreme underexposure and overexposure detected", () => {
  // Dark canvas: 90% pixels black
  const darkCanvas = createTestCanvas(800, 600, () => [8, 8, 8]);
  const darkEval = evaluateCaptureQuality(darkCanvas);
  assert.equal(darkEval.isAcceptable, false);
  assert.equal(darkEval.isUnderexposed, true);
  assert.equal(darkEval.rejectionReason, "severe-underexposure");

  // Blown-out canvas: 90% pixels 255
  const blownCanvas = createTestCanvas(800, 600, () => [253, 253, 253]);
  const blownEval = evaluateCaptureQuality(blownCanvas);
  assert.equal(blownEval.isAcceptable, false);
  assert.equal(blownEval.isOverexposed, true);
  assert.equal(blownEval.rejectionReason, "severe-overexposure");
});

test("Geometry & Margin Tests: Adaptive 1.5% safety margin preserves document borders", () => {
  const sourceDimensions = { width: 4032, height: 3024 };
  const corners = [
    { x: 400, y: 300 },
    { x: 3600, y: 300 },
    { x: 3600, y: 2700 },
    { x: 400, y: 2700 },
  ] as const;

  const expanded = expandCornersWithSafetyMargin(corners, sourceDimensions, 0.015);

  // Expanded corners should expand outward by ~1.5% from centroid (2000, 1500)
  assert.ok(expanded[0].x < corners[0].x, "Top-left X should expand leftward");
  assert.ok(expanded[0].y < corners[0].y, "Top-left Y should expand upward");
  assert.ok(expanded[1].x > corners[1].x, "Top-right X should expand rightward");
  assert.ok(expanded[2].y > corners[2].y, "Bottom-right Y should expand downward");

  // Must not exceed canvas bounds
  assert.ok(expanded[0].x >= 0 && expanded[0].y >= 0);
  assert.ok(expanded[2].x <= 4032 && expanded[2].y <= 3024);
});

test("Perspective Resolution Snapping: Supports 4096px / 16MP maximum ceiling for high-res stills", () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 4032, y: 0 },
    { x: 4032, y: 3024 },
    { x: 0, y: 3024 },
  ] as const;

  const output = calculatePerspectiveOutputDimensions(corners, {
    maxDimension: 4096,
    maxPixels: 16_000_000,
  });

  assert.ok(output !== null);
  // Preserves full 4032 long edge without artificial downsampling to 2400
  assert.equal(output.width, 4032);
  assert.equal(output.height, 3024);
  assert.ok(output.width * output.height > 12_000_000);
});

test("Phase 5B Quality Gate Benchmark: Active-pixel sharpness across A4, ID, Passport, and Spread", () => {
  // 1. A4 in-focus with wide margins (75% blank paper, 25% text)
  const a4SharpCanvas = createTestCanvas(1200, 1600, (x, y) => {
    if (x < 200 || x > 1000 || y < 250 || y > 1350) return [245, 245, 245];
    const inLine = (y % 28) < 8;
    if (!inLine) return [245, 245, 245];
    const isInk = (x % 14) < 9;
    return isInk ? [30, 30, 30] : [245, 245, 245];
  });
  const a4SharpEval = evaluateCaptureQuality(a4SharpCanvas, "image-capture");
  assert.equal(a4SharpEval.isAcceptable, true, "In-focus A4 with wide margins must be accepted");
  assert.ok(
    (a4SharpEval.activeSharpness ?? 0) >= 40,
    `Active sharpness should be >= 40, got ${a4SharpEval.activeSharpness}`,
  );

  // 2. A4 blurry (out of focus, smudged text)
  const a4BlurryCanvas = createTestCanvas(1200, 1600, (x, y) => {
    if (x < 200 || x > 1000 || y < 250 || y > 1350) return [245, 245, 245];
    const lineY = y % 28;
    if (lineY > 14) return [245, 245, 245];
    const factor = Math.sin((lineY / 14) * Math.PI);
    const val = Math.round(245 - 40 * factor);
    return [val, val, val];
  });
  const a4BlurryEval = evaluateCaptureQuality(a4BlurryCanvas, "image-capture");
  assert.equal(a4BlurryEval.isAcceptable, false, "Blurry A4 must be rejected");
  assert.ok(
    a4BlurryEval.rejectionReason === "severe-blur" || a4BlurryEval.rejectionReason === "severe-motion",
    `Rejection reason should indicate blur/motion, got ${a4BlurryEval.rejectionReason}`,
  );

  // 3. ID card in-focus
  const idSharpCanvas = createTestCanvas(1200, 800, (x, y) => {
    return ((x % 8 < 4) !== (y % 8 < 4)) ? [40, 40, 40] : [230, 230, 230];
  });
  const idSharpEval = evaluateCaptureQuality(idSharpCanvas, "image-capture");
  assert.equal(idSharpEval.isAcceptable, true, "In-focus ID card must be accepted");

  // 4. ID card blurry
  const idBlurryCanvas = createTestCanvas(1200, 800, (x, y) => {
    const s = Math.sin(x / 16) * Math.cos(y / 16);
    const val = Math.round(135 + s * 15);
    return [val, val, val];
  });
  const idBlurryEval = evaluateCaptureQuality(idBlurryCanvas, "image-capture");
  assert.equal(idBlurryEval.isAcceptable, false, "Blurry ID card must be rejected");

  // 5. Passport in-focus
  const passportSharpCanvas = createTestCanvas(1200, 1600, (x, y) => {
    const isMRZ = y > 1300 && (y % 16 < 6) && (x % 8 < 6);
    if (isMRZ) return [30, 30, 30];
    const isLine = (y % 24 < 6) && (x % 10 < 6);
    return isLine ? [40, 40, 40] : [240, 240, 240];
  });
  const passportSharpEval = evaluateCaptureQuality(passportSharpCanvas, "image-capture");
  assert.equal(passportSharpEval.isAcceptable, true, "In-focus passport must be accepted");

  // 6. Passport blurry
  const passportBlurryCanvas = createTestCanvas(1200, 1600, (x, y) => {
    const s = Math.sin(y / 18);
    const val = Math.round(210 - 20 * Math.abs(s));
    return [val, val, val];
  });
  const passportBlurryEval = evaluateCaptureQuality(passportBlurryCanvas, "image-capture");
  assert.equal(passportBlurryEval.isAcceptable, false, "Blurry passport must be rejected");

  // 7. Open passport spread in-focus
  const spreadSharpCanvas = createTestCanvas(1600, 1200, (x, y) => {
    const isSpine = Math.abs(x - 800) < 10;
    if (isSpine) return [60, 60, 60];
    const inLine = (y % 24 < 6) && (x % 12 < 7);
    return inLine ? [35, 35, 35] : [240, 240, 240];
  });
  const spreadSharpEval = evaluateCaptureQuality(spreadSharpCanvas, "image-capture");
  assert.equal(spreadSharpEval.isAcceptable, true, "In-focus spread must be accepted");

  // 8. Open passport spread blurry
  const spreadBlurryCanvas = createTestCanvas(1600, 1200, (x, y) => {
    const s = Math.sin(y / 22);
    const val = Math.round(210 - 18 * Math.abs(s));
    return [val, val, val];
  });
  const spreadBlurryEval = evaluateCaptureQuality(spreadBlurryCanvas, "image-capture");
  assert.equal(spreadBlurryEval.isAcceptable, false, "Blurry spread must be rejected");
});

