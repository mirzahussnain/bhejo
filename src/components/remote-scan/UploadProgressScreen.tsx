import type { UploadProgress } from "@/lib/remote-scan/uploader";

interface UploadProgressScreenProps {
  readonly progress: UploadProgress;
}

export function UploadProgressScreen({ progress }: UploadProgressScreenProps) {
  let statusTitle = "Preparing upload…";
  let statusSubtitle = "Preparing your scanned pages for secure transmission.";

  if (progress.status === "uploading") {
    statusTitle = `Sending page ${progress.currentPage} of ${progress.totalPages}…`;
    statusSubtitle = "Transmitting directly and securely to the sender.";
  } else if (progress.status === "finalizing") {
    statusTitle = "Finalizing document…";
    statusSubtitle = "Verifying document integrity and delivery.";
  } else if (progress.status === "done") {
    statusTitle = "Upload complete!";
    statusSubtitle = "Document received safely.";
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-white/10 text-white">
          <span className="size-7 animate-spin rounded-full border-3 border-white/20 border-t-white motion-reduce:animate-none" />
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white">
          {statusTitle}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {statusSubtitle}
        </p>

        {/* Progress Bar */}
        <div className="mt-8">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-white transition-all duration-300 ease-out"
              style={{ width: `${Math.max(5, progress.percent)}%` }}
            />
          </div>
          <div className="mt-2.5 flex justify-between text-xs font-medium text-slate-400">
            <span>Progress</span>
            <span>{progress.percent}%</span>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Please keep this window open until upload completes.
        </p>
      </div>
    </main>
  );
}
