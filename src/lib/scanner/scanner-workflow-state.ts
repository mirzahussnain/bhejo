/**
 * Scanner workflow state machine.
 * Provides explicit, observable transitions for document capture and processing:
 * SCANNING -> CAPTURE_PREPARING -> CAPTURING_HIGH_QUALITY -> PROCESSING -> COMPLETE
 */

export type ScannerWorkflowState =
  | "SCANNING"
  | "CAPTURE_PREPARING"
  | "CAPTURING_HIGH_QUALITY"
  | "PROCESSING"
  | "COMPLETE";

export const WORKFLOW_LABELS: Record<ScannerWorkflowState, string> = {
  SCANNING: "Align document within frame",
  CAPTURE_PREPARING: "Hold steady...",
  CAPTURING_HIGH_QUALITY: "Capturing high-resolution photo...",
  PROCESSING: "Processing scan...",
  COMPLETE: "Scan ready",
};

export const MAX_CAPTURE_RETRIES = 2;

export function getWorkflowLabel(state: ScannerWorkflowState): string {
  return WORKFLOW_LABELS[state];
}

export function canTransitionTo(
  current: ScannerWorkflowState,
  next: ScannerWorkflowState,
): boolean {
  if (current === next) {
    return true;
  }

  switch (current) {
    case "SCANNING":
      return next === "CAPTURE_PREPARING" || next === "CAPTURING_HIGH_QUALITY";
    case "CAPTURE_PREPARING":
      return next === "CAPTURING_HIGH_QUALITY" || next === "SCANNING";
    case "CAPTURING_HIGH_QUALITY":
      return (
        next === "PROCESSING" ||
        next === "CAPTURE_PREPARING" ||
        next === "SCANNING"
      );
    case "PROCESSING":
      return (
        next === "COMPLETE" ||
        next === "CAPTURE_PREPARING" ||
        next === "SCANNING"
      );
    case "COMPLETE":
      return next === "SCANNING" || next === "CAPTURE_PREPARING";
  }
}

export function isCaptureInProgress(state: ScannerWorkflowState): boolean {
  return (
    state === "CAPTURE_PREPARING" ||
    state === "CAPTURING_HIGH_QUALITY" ||
    state === "PROCESSING"
  );
}

export function shouldIgnoreCaptureTrigger(state: ScannerWorkflowState): boolean {
  return isCaptureInProgress(state) || state === "COMPLETE";
}

export interface RetryEvaluation {
  readonly shouldRetry: boolean;
  readonly nextState: ScannerWorkflowState;
  readonly updatedRetryCount: number;
}

export function evaluateQualityFailureRetry(
  currentRetryCount: number,
  maxRetries = MAX_CAPTURE_RETRIES,
): RetryEvaluation {
  if (currentRetryCount < maxRetries) {
    return {
      shouldRetry: true,
      nextState: "CAPTURE_PREPARING",
      updatedRetryCount: currentRetryCount + 1,
    };
  }

  return {
    shouldRetry: false,
    nextState: "SCANNING",
    updatedRetryCount: currentRetryCount,
  };
}
