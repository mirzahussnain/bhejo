import type { PageEditState } from "../../types/workspace.ts";
import { DEFAULT_PAGE_EDIT_STATE } from "./constants.ts";

export function createInitialEditState(): PageEditState {
  return { ...DEFAULT_PAGE_EDIT_STATE };
}

export function isPageEdited(state: PageEditState): boolean {
  return (
    state.rotation !== 0 ||
    state.preset !== "original" ||
    state.isCropped
  );
}

export function rotateClockwise(
  current: 0 | 90 | 180 | 270,
): 0 | 90 | 180 | 270 {
  switch (current) {
    case 0:
      return 90;
    case 90:
      return 180;
    case 180:
      return 270;
    case 270:
      return 0;
  }
}

export function rotateCounterClockwise(
  current: 0 | 90 | 180 | 270,
): 0 | 90 | 180 | 270 {
  switch (current) {
    case 0:
      return 270;
    case 90:
      return 0;
    case 180:
      return 90;
    case 270:
      return 180;
  }
}

export interface EditHistoryState {
  readonly past: readonly PageEditState[];
  readonly present: PageEditState;
}

export function createInitialHistory(initial?: PageEditState): EditHistoryState {
  return {
    past: [],
    present: initial ? { ...initial } : createInitialEditState(),
  };
}

export function pushEditState(
  history: EditHistoryState,
  next: PageEditState,
  maxHistory = 20,
): EditHistoryState {
  // If identical to present, no-op
  if (
    history.present.rotation === next.rotation &&
    history.present.preset === next.preset &&
    history.present.isCropped === next.isCropped
  ) {
    return history;
  }

  const updatedPast = [...history.past, history.present];
  if (updatedPast.length > maxHistory) {
    updatedPast.shift();
  }

  return {
    past: updatedPast,
    present: { ...next },
  };
}

export function undoEditState(history: EditHistoryState): EditHistoryState {
  if (history.past.length === 0) {
    return history;
  }

  const previous = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, history.past.length - 1);

  return {
    past: newPast,
    present: previous,
  };
}

export function resetEditState(): EditHistoryState {
  return createInitialHistory(createInitialEditState());
}
