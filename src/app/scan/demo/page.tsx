export default function ScanDemoPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-950 text-slate-100">
      <div className="flex flex-1 flex-col px-5 py-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-300">Bhejo</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Place your document in view
        </h1>

        <div className="my-8 flex flex-1 items-center justify-center">
          <div className="h-[55vh] min-h-80 w-full rounded-3xl border-2 border-dashed border-slate-500/80 bg-slate-900/80 p-4">
            <div className="flex h-full items-center justify-center rounded-2xl border border-slate-700">
              <div className="h-56 w-40 rounded-lg border-2 border-slate-400/90 bg-slate-800" />
            </div>
          </div>
        </div>

        <p className="text-center text-base text-slate-300">Camera scanner coming next.</p>
      </div>
    </main>
  );
}
