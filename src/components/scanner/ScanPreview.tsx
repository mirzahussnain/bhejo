interface ScanPreviewProps {
  imageUrl: string;
  onRetake: () => void;
}

export function ScanPreview({ imageUrl, onRetake }: ScanPreviewProps) {
  return (
    <main className="flex h-dvh flex-col bg-slate-950 text-white">
      <header className="px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Check your photo
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          This image stays only on this device and is not saved.
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
        <button
          type="button"
          onClick={onRetake}
          className="min-h-14 w-full rounded-xl bg-white px-6 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          Retake
        </button>
      </footer>
    </main>
  );
}
