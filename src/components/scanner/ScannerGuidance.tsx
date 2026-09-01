import type { QualityGuidance } from "@/lib/quality/document-quality";
import type { ScannerState } from "@/lib/scanner/scanner-state";

interface ScannerGuidanceProps {
  readonly scannerState: ScannerState;
  readonly qualityGuidance: QualityGuidance | null;
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
}: ScannerGuidanceProps) {
  const message =
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

  return (
    <div className="text-center text-white" aria-live="polite" role="status">
      <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
        {message}
      </h1>
    </div>
  );
}
