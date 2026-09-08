import type { QualityGuidance } from "@/lib/quality/document-quality";
import type { ScannerState } from "@/lib/scanner/scanner-state";
import {
  type ScannerWorkflowState,
  getWorkflowLabel,
} from "@/lib/scanner/scanner-workflow-state";

export interface ScannerGuidanceProps {
  readonly scannerState: ScannerState;
  readonly qualityGuidance: QualityGuidance | null;
  readonly workflowState?: ScannerWorkflowState;
}

const qualityMessages: Record<QualityGuidance, string> = {
  "move-closer": "Move closer",
  "move-away-from-edge": "Move away from the edge",
  "move-into-better-light": "Move into better light",
  "hold-still": "Hold still",
  "move-into-position": "Move your phone into position",
  ready: "Ready",
};

export function ScannerGuidance({
  scannerState,
  qualityGuidance,
  workflowState,
}: ScannerGuidanceProps) {
  let message: string;

  if (workflowState && workflowState !== "SCANNING") {
    message = getWorkflowLabel(workflowState);
  } else {
    message =
      scannerState === "capturing"
        ? "Scanning…"
        : scannerState === "ready"
          ? "Ready"
          : scannerState === "hold-still"
            ? "Hold still"
            : scannerState === "quality-problem" && qualityGuidance
              ? qualityMessages[qualityGuidance]
              : scannerState === "document-detected"
                ? "Move your phone into position"
                : "Place your document in view";
  }

  const isWorking =
    workflowState === "CAPTURE_PREPARING" ||
    workflowState === "CAPTURING_HIGH_QUALITY" ||
    workflowState === "PROCESSING";

  return (
    <div className="text-center text-white" aria-live="polite" role="status">
      <div className="inline-flex items-center justify-center gap-2">
        {isWorking && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"
            aria-hidden="true"
          />
        )}
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          {message}
        </h1>
      </div>
    </div>
  );
}
