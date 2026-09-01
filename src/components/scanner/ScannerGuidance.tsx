interface ScannerGuidanceProps {
  autoScanningAvailable?: boolean;
}

export function ScannerGuidance({
  autoScanningAvailable = false,
}: ScannerGuidanceProps) {
  return (
    <div className="text-center text-white">
      <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
        Place your document in view
      </h1>
      {!autoScanningAvailable && (
        <p className="mt-2 text-sm leading-5 text-slate-200 sm:text-base">
          Automatic scanning isn&apos;t available yet. Use Capture when ready.
        </p>
      )}
    </div>
  );
}

