import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialEditState,
  createInitialHistory,
  isPageEdited,
  pushEditState,
  resetEditState,
  rotateClockwise,
  rotateCounterClockwise,
  undoEditState,
} from "./state.ts";

test("initial edit state is not edited", () => {
  const initial = createInitialEditState();
  assert.equal(initial.rotation, 0);
  assert.equal(initial.preset, "original");
  assert.equal(initial.isCropped, false);
  assert.equal(isPageEdited(initial), false);
});

test("isPageEdited returns true if rotation, preset, or crop is modified", () => {
  assert.equal(isPageEdited({ rotation: 90, preset: "original", isCropped: false }), true);
  assert.equal(isPageEdited({ rotation: 0, preset: "auto", isCropped: false }), true);
  assert.equal(isPageEdited({ rotation: 0, preset: "original", isCropped: true }), true);
  assert.equal(isPageEdited({ rotation: 270, preset: "grayscale", isCropped: true }), true);
});

test("rotateClockwise rotates deterministically in 90 degree increments", () => {
  let rot: 0 | 90 | 180 | 270 = 0;
  rot = rotateClockwise(rot);
  assert.equal(rot, 90);
  rot = rotateClockwise(rot);
  assert.equal(rot, 180);
  rot = rotateClockwise(rot);
  assert.equal(rot, 270);
  rot = rotateClockwise(rot);
  assert.equal(rot, 0);
});

test("rotateCounterClockwise rotates deterministically in -90 degree increments", () => {
  let rot: 0 | 90 | 180 | 270 = 0;
  rot = rotateCounterClockwise(rot);
  assert.equal(rot, 270);
  rot = rotateCounterClockwise(rot);
  assert.equal(rot, 180);
  rot = rotateCounterClockwise(rot);
  assert.equal(rot, 90);
  rot = rotateCounterClockwise(rot);
  assert.equal(rot, 0);
});

test("edit history tracks past states and supports undo", () => {
  let history = createInitialHistory();
  assert.equal(history.past.length, 0);
  assert.equal(history.present.rotation, 0);

  // Apply rotation
  history = pushEditState(history, { rotation: 90, preset: "original", isCropped: false });
  assert.equal(history.past.length, 1);
  assert.equal(history.present.rotation, 90);

  // Apply preset
  history = pushEditState(history, { rotation: 90, preset: "document", isCropped: false });
  assert.equal(history.past.length, 2);
  assert.equal(history.present.preset, "document");

  // Undo preset change
  history = undoEditState(history);
  assert.equal(history.past.length, 1);
  assert.equal(history.present.preset, "original");
  assert.equal(history.present.rotation, 90);

  // Undo rotation change
  history = undoEditState(history);
  assert.equal(history.past.length, 0);
  assert.equal(history.present.rotation, 0);

  // Redundant undo when empty leaves state intact
  history = undoEditState(history);
  assert.equal(history.past.length, 0);
  assert.equal(history.present.rotation, 0);
});

test("resetEditState clears history and restores default state", () => {
  let history = createInitialHistory();
  history = pushEditState(history, { rotation: 180, preset: "grayscale", isCropped: true });
  assert.equal(isPageEdited(history.present), true);

  history = resetEditState();
  assert.equal(history.past.length, 0);
  assert.equal(isPageEdited(history.present), false);
  assert.equal(history.present.rotation, 0);
  assert.equal(history.present.preset, "original");
  assert.equal(history.present.isCropped, false);
});
