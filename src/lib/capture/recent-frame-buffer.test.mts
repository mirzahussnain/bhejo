import assert from "node:assert/strict";
import test from "node:test";
import { RecentFrameBuffer } from "./recent-frame-buffer.ts";

function createMockVideo(width: number, height: number): HTMLVideoElement {
  return {
    videoWidth: width,
    videoHeight: height,
  } as unknown as HTMLVideoElement;
}

test("RecentFrameBuffer retains best candidate frames up to capacity", () => {
  const buffer = new RecentFrameBuffer(2);

  // In Node environment without real DOM canvas drawImage, mock document.createElement("canvas")
  const originalCreateElement = globalThis.document?.createElement;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray(240 * 240 * 4),
        }),
      }),
    }),
  } as unknown as Document;

  try {
    const video = createMockVideo(1920, 1080);
    buffer.recordFrame(video, 0.50, 1000);
    buffer.recordFrame(video, 0.85, 2000);
    buffer.recordFrame(video, 0.70, 3000);

    const best = buffer.getBestFrame();
    assert.ok(best);
    // Highest confidence candidate should be preferred
    assert.equal(best.confidence, 0.85);

    buffer.releaseAll();
    assert.equal(buffer.getBestFrame(), null);
  } finally {
    if (originalCreateElement && globalThis.document) {
      globalThis.document.createElement = originalCreateElement;
    }
  }
});
