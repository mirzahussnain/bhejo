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

test("capturing state locks out further automatic and manual capture attempts", () => {
  const controller = new CaptureController({ cooldownMs: 100 });
  controller.observe(valid, 0);
  assert.equal(controller.beginScheduledCapture(), true);
  assert.equal(controller.getState(), "capturing");

  // While in "capturing", new frames cannot schedule or begin another capture
  assert.deepEqual(
    controller.observe(valid, 10),
    { shouldSchedule: false, shouldCancel: false },
  );
  assert.equal(controller.beginScheduledCapture(), false);
  assert.equal(controller.beginManualCapture(), false);
  assert.equal(controller.getState(), "capturing");
});

test("retake reset lifecycle transitions from awaiting-reset back to idle for new captures", () => {
  const controller = new CaptureController({ cooldownMs: 100 });

  // Complete a first capture cycle and advance past cooldown into awaiting-reset
  controller.observe(valid, 0);
  controller.beginScheduledCapture();
  controller.completeCapture(10);
  assert.equal(controller.getState(), "cooldown");

  // Advance time past cooldown
  assert.deepEqual(
    controller.observe(valid, 120),
    { shouldSchedule: false, shouldCancel: false },
  );
  assert.equal(controller.getState(), "awaiting-reset");

  // Duplicate captures remain locked out while awaiting reset
  assert.deepEqual(
    controller.observe(valid, 200),
    { shouldSchedule: false, shouldCancel: false },
  );
  assert.equal(controller.beginScheduledCapture(), false);
  assert.equal(controller.beginManualCapture(), false);

  // Calling reset (e.g. on retake) cleanly returns controller to idle
  controller.reset();
  assert.equal(controller.getState(), "idle");

  // A new valid stable candidate can now schedule a capture
  assert.deepEqual(
    controller.observe(valid, 250),
    { shouldSchedule: true, shouldCancel: false },
  );
  assert.equal(controller.beginScheduledCapture(), true);
  assert.equal(controller.getState(), "capturing");
});
