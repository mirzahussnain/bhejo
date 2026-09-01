import type { DocumentDetection } from "@/lib/detection/document-detection";
import type { DocumentQuality } from "@/lib/quality/document-quality";
import type { DocumentStability } from "@/lib/stability/document-stability";

export type ScannerState =
  | "searching"
  | "document-detected"
  | "quality-problem"
  | "hold-still"
  | "ready"
  | "capturing"
  | "preview"
  | "error";

export function deriveScannerState({
  detection,
  quality,
  stability,
  capturing,
}: {
  readonly detection: DocumentDetection | null;
  readonly quality: DocumentQuality | null;
  readonly stability: DocumentStability | null;
  readonly capturing: boolean;
}): ScannerState {
  if (capturing) {
    return "capturing";
  }
  if (!detection) {
    return "searching";
  }
  if (!quality) {
    return "document-detected";
  }
  if (!quality.isAcceptable) {
    return "quality-problem";
  }
  if (!stability?.isReady) {
    return "hold-still";
  }
  return "ready";
}
