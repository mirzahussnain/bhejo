import assert from "node:assert/strict";
import test from "node:test";
import { CaptureController } from "./capture-controller.ts";

const valid = {
  documentDetected: true,
  qualityAcceptable: true,
  stable: true,
};

test("invalid quality and unstable detections cannot schedule capture", () => {
  const controller = new CaptureController({ cooldownMs: 100 });
  assert.deepEqual(
    controller.observe({ ...valid, qualityAcceptable: false }, 0),
    { shouldSchedule: false, shouldCancel: false },
  );
  assert.deepEqual(
    controller.observe({ ...valid, stable: false }, 10),
    { shouldSchedule: false, shouldCancel: false },
  );
});

test("a valid stable document schedules exactly one automatic capture", () => {
  const controller = new CaptureController({ cooldownMs: 100 });
  assert.equal(controller.observe(valid, 0).shouldSchedule, true);
  assert.equal(controller.observe(valid, 1).shouldSchedule, false);
  assert.equal(controller.beginScheduledCapture(), true);
});

test("capture cooldown prevents duplicate automatic captures", () => {
  const controller = new CaptureController({ cooldownMs: 100 });
  controller.observe(valid, 0);
  controller.beginScheduledCapture();
  controller.completeCapture(10);
  assert.equal(controller.observe(valid, 50).shouldSchedule, false);
  assert.equal(controller.observe(valid, 120).shouldSchedule, false);
  assert.equal(controller.getState(), "awaiting-reset");
});

test("manual capture cannot race an automatic capture that is scheduled", () => {
  const controller = new CaptureController({ cooldownMs: 100 });
  controller.observe(valid, 0);
  assert.equal(controller.beginManualCapture(), false);
  assert.equal(controller.beginScheduledCapture(), true);
  assert.equal(controller.beginManualCapture(), false);
});
