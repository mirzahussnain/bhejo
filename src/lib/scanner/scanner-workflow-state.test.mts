import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionTo,
  evaluateQualityFailureRetry,
  getWorkflowLabel,
  isCaptureInProgress,
  shouldIgnoreCaptureTrigger,
  type ScannerWorkflowState,
} from "./scanner-workflow-state.ts";

test("allows valid workflow state progression", () => {
  // Normal happy path: SCANNING -> CAPTURE_PREPARING -> CAPTURING_HIGH_QUALITY -> PROCESSING -> COMPLETE
  assert.equal(canTransitionTo("SCANNING", "CAPTURE_PREPARING"), true);
  assert.equal(canTransitionTo("CAPTURE_PREPARING", "CAPTURING_HIGH_QUALITY"), true);
  assert.equal(canTransitionTo("CAPTURING_HIGH_QUALITY", "PROCESSING"), true);
  assert.equal(canTransitionTo("PROCESSING", "COMPLETE"), true);

  // Manual capture direct path: SCANNING -> CAPTURING_HIGH_QUALITY
  assert.equal(canTransitionTo("SCANNING", "CAPTURING_HIGH_QUALITY"), true);

  // Restart / new page path: COMPLETE -> SCANNING
  assert.equal(canTransitionTo("COMPLETE", "SCANNING"), true);

  // Identity transitions
  assert.equal(canTransitionTo("SCANNING", "SCANNING"), true);
  assert.equal(canTransitionTo("PROCESSING", "PROCESSING"), true);
});

test("rejects invalid workflow state jumps", () => {
  // Cannot jump straight from SCANNING to PROCESSING or COMPLETE
  assert.equal(canTransitionTo("SCANNING", "PROCESSING"), false);
  assert.equal(canTransitionTo("SCANNING", "COMPLETE"), false);

  // Cannot jump straight from CAPTURE_PREPARING to PROCESSING or COMPLETE
  assert.equal(canTransitionTo("CAPTURE_PREPARING", "PROCESSING"), false);
  assert.equal(canTransitionTo("CAPTURE_PREPARING", "COMPLETE"), false);

  // Cannot jump from COMPLETE straight to PROCESSING or CAPTURING_HIGH_QUALITY
  assert.equal(canTransitionTo("COMPLETE", "PROCESSING"), false);
  assert.equal(canTransitionTo("COMPLETE", "CAPTURING_HIGH_QUALITY"), false);
});

test("identifies active capture and duplicate trigger suppression", () => {
  const inProgressStates: ScannerWorkflowState[] = [
    "CAPTURE_PREPARING",
    "CAPTURING_HIGH_QUALITY",
    "PROCESSING",
  ];

  for (const s of inProgressStates) {
    assert.equal(isCaptureInProgress(s), true, `${s} should be in progress`);
    assert.equal(shouldIgnoreCaptureTrigger(s), true, `${s} should ignore duplicate triggers`);
  }

  assert.equal(isCaptureInProgress("SCANNING"), false);
  assert.equal(shouldIgnoreCaptureTrigger("SCANNING"), false);

  assert.equal(isCaptureInProgress("COMPLETE"), false);
  assert.equal(shouldIgnoreCaptureTrigger("COMPLETE"), true);
});

test("evaluates quality failure retry limits deterministically", () => {
  // First retry
  const first = evaluateQualityFailureRetry(0, 2);
  assert.equal(first.shouldRetry, true);
  assert.equal(first.nextState, "CAPTURE_PREPARING");
  assert.equal(first.updatedRetryCount, 1);

  // Second retry
  const second = evaluateQualityFailureRetry(first.updatedRetryCount, 2);
  assert.equal(second.shouldRetry, true);
  assert.equal(second.nextState, "CAPTURE_PREPARING");
  assert.equal(second.updatedRetryCount, 2);

  // Exhausted retries -> fallback to SCANNING
  const third = evaluateQualityFailureRetry(second.updatedRetryCount, 2);
  assert.equal(third.shouldRetry, false);
  assert.equal(third.nextState, "SCANNING");
  assert.equal(third.updatedRetryCount, 2);
});

test("provides non-technical user-facing labels for all workflow states", () => {
  const allStates: ScannerWorkflowState[] = [
    "SCANNING",
    "CAPTURE_PREPARING",
    "CAPTURING_HIGH_QUALITY",
    "PROCESSING",
    "COMPLETE",
  ];

  for (const s of allStates) {
    const label = getWorkflowLabel(s);
    assert.ok(label.length > 0);
    // Labels must not contain internal code symbols or jargon
    assert.doesNotMatch(label, /[_A-Z]{4,}/);
  }
});
