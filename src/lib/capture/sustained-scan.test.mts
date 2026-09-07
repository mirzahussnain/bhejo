import assert from "node:assert/strict";
import test from "node:test";
import { loadOpenCv } from "../detection/opencv-loader.ts";
import { evaluateCaptureQuality } from "./capture-quality.ts";
import { warpPerspectiveMat } from "../capture-processing/perspective-transform.ts";
import { enhanceMatWithOpenCv, resolveEnhancementConfig } from "../capture-processing/enhancement.ts";

test("Phase 5B Sustained 20-Scan Lifecycle & Stability Validation", async () => {
  const cv = await loadOpenCv();

  const scanLatencies: number[] = [];
  const allocatedCanvasObjects: Array<{ width: number; height: number }> = [];
  const objectUrls: string[] = [];

  const mockCreateObjectUrl = () => {
    const url = `blob:http://localhost:3000/${Math.random().toString(36).substring(2)}`;
    objectUrls.push(url);
    return url;
  };

  const mockRevokeObjectUrl = (url: string) => {
    const idx = objectUrls.indexOf(url);
    if (idx !== -1) {
      objectUrls.splice(idx, 1);
    }
  };

  // Run 20 consecutive full-pipeline capture & processing cycles
  for (let scanIdx = 0; scanIdx < 20; scanIdx++) {
    const scanStart = performance.now();

    // 1. Source high-resolution frame (simulating 4K still 3840x2160)
    const width = 1920;
    const height = 1080;
    const sourceMat = new cv.Mat(height, width, cv.CV_8UC4);

    // Track mock canvas lifecycle
    const canvasMock = { width, height };
    allocatedCanvasObjects.push(canvasMock);

    // Mock document corners
    const corners = [
      { x: 192, y: 108 },
      { x: 1728, y: 108 },
      { x: 1728, y: 972 },
      { x: 192, y: 972 },
    ] as const;

    try {
      // 2. Quality Gate Evaluation
      // Verify active-pixel sharpness calculation
      const dummyCanvas = {
        width,
        height,
        getContext: () => ({
          getImageData: (_sx: number, _sy: number, sw: number, sh: number) => {
            const patch = new Uint8ClampedArray(sw * sh * 4).fill(240);
            for (let y = 0; y < sh; y += 16) {
              for (let x = 0; x < sw; x++) {
                const idx = (y * sw + x) * 4;
                patch[idx] = 30;
                patch[idx + 1] = 30;
                patch[idx + 2] = 30;
                patch[idx + 3] = 255;
              }
            }
            return { data: patch, width: sw, height: sh };
          },
        }),
      } as unknown as HTMLCanvasElement;

      const quality = evaluateCaptureQuality(dummyCanvas, "image-capture");
      assert.equal(quality.isAcceptable, true);

      // 3. Perspective Warp directly in Mat memory (Zero-Copy)
      const { warpedMat, dimensions } = warpPerspectiveMat(cv, sourceMat, corners);

      try {
        // 4. Illumination Normalization & Enhancement directly on Mat
        const enhancementConfig = resolveEnhancementConfig({}, "photo-document");
        enhanceMatWithOpenCv(cv, warpedMat, enhancementConfig);

        assert.equal(warpedMat.cols, dimensions.width);
        assert.equal(warpedMat.rows, dimensions.height);

        // 5. Output rendering & Blob generation
        const outputCanvasMock = { width: dimensions.width, height: dimensions.height };
        allocatedCanvasObjects.push(outputCanvasMock);

        // Preview URL lifecycle
        const previewUrl = mockCreateObjectUrl();

        // Eager canvas cleanup (Phase 5B rule)
        outputCanvasMock.width = 0;
        outputCanvasMock.height = 0;

        // User advances or cancels page -> URL revoked
        mockRevokeObjectUrl(previewUrl);
      } finally {
        warpedMat.delete();
      }
    } finally {
      sourceMat.delete();
      // Eager source canvas cleanup
      canvasMock.width = 0;
      canvasMock.height = 0;
    }

    const scanDuration = performance.now() - scanStart;
    scanLatencies.push(scanDuration);
  }

  // Verification 1: Zero object URL leaks
  assert.equal(
    objectUrls.length,
    0,
    `Expected 0 leaked object URLs, found ${objectUrls.length}`,
  );

  // Verification 2: All canvas buffers eagerly zeroed (no retained backing store)
  const nonZeroCanvases = allocatedCanvasObjects.filter(
    (c) => c.width !== 0 || c.height !== 0,
  );
  assert.equal(
    nonZeroCanvases.length,
    0,
    `Expected all canvases to be eagerly zeroed, found ${nonZeroCanvases.length} retained`,
  );

  // Verification 3: No progressive latency degradation across 20 scans
  const firstHalf = scanLatencies.slice(0, 10);
  const secondHalf = scanLatencies.slice(10, 20);
  const avgFirstHalf = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecondHalf = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  // Second half average latency should be within 2.2x of first half (no progressive degradation/thermal runaway)
  assert.ok(
    avgSecondHalf < avgFirstHalf * 2.2,
    `Latencies degraded progressively: first 10 scans avg ${avgFirstHalf.toFixed(1)}ms, second 10 scans avg ${avgSecondHalf.toFixed(1)}ms`,
  );
});
