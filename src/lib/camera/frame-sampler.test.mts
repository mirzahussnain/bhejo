import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FRAME_SAMPLER_CONFIG,
  calculateAnalysisDimensions,
  resolveFrameSamplerConfig,
} from "./frame-sampler.ts";

test("uses the default frame sampler configuration", () => {
  assert.deepEqual(resolveFrameSamplerConfig(), DEFAULT_FRAME_SAMPLER_CONFIG);
});

test("accepts valid configuration overrides", () => {
  assert.deepEqual(resolveFrameSamplerConfig({ analysisWidth: 480 }), {
    analysisWidth: 480,
    analysisFps: 10,
  });
});

test("rejects invalid configuration values", () => {
  assert.throws(
    () => resolveFrameSamplerConfig({ analysisWidth: 0 }),
    RangeError,
  );
  assert.throws(
    () => resolveFrameSamplerConfig({ analysisFps: Number.NaN }),
    RangeError,
  );
});

test("preserves a landscape camera aspect ratio", () => {
  assert.deepEqual(calculateAnalysisDimensions(1920, 1080, 640), {
    width: 640,
    height: 360,
  });
});

test("preserves a portrait camera aspect ratio", () => {
  assert.deepEqual(calculateAnalysisDimensions(1080, 1920, 640), {
    width: 640,
    height: 1138,
  });
});

test("does not upscale a camera frame below the configured width", () => {
  assert.deepEqual(calculateAnalysisDimensions(320, 240, 640), {
    width: 320,
    height: 240,
  });
});

test("does not return dimensions until the video is ready", () => {
  assert.equal(calculateAnalysisDimensions(0, 0, 640), null);
});
