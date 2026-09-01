interface ScanPreviewProps {
  readonly imageUrl: string;
  readonly onRetake: () => void;
  readonly onAccept: () => void;
  readonly accepted: boolean;
  readonly correctionFallback: boolean;
}

export function ScanPreview({
  imageUrl,
  onRetake,
  onAccept,
  accepted,
  correctionFallback,
}: ScanPreviewProps) {
  return (
    <main className="flex h-dvh flex-col bg-slate-950 text-white">
      <header className="px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          {accepted ? "Scan ready" : "Check your scan"}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          {accepted
            ? "This scan is ready to continue and remains only in this browser."
            : "This scan stays only in this browser and is not saved."}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Your captured document"
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <footer className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        {correctionFallback && !accepted && (
          <p className="mb-3 text-center text-sm leading-5 text-amber-100" role="status">
            We couldn&apos;t straighten this one. Retake it if you need a cleaner edge.
          </p>
        )}
        {!accepted && (
          <button
            type="button"
            onClick={onAccept}
            className="min-h-14 w-full rounded-xl bg-white px-6 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          >
            Use this scan
          </button>
        )}
        <button
          type="button"
          onClick={onRetake}
          className={`min-h-14 w-full rounded-xl border border-slate-500 px-6 text-base font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 ${
            accepted ? "" : "mt-3"
          }`}
        >
          Retake
        </button>
      </footer>
    </main>
  );
}
