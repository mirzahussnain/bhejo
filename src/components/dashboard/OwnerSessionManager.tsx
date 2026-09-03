"use client";

import { useCallback, useState } from "react";

interface CreatedSession {
  readonly id: string;
  readonly publicToken: string;
  readonly otp: string;
  readonly expiresAt: number;
  readonly title?: string;
}

interface CompletedDocumentData {
  readonly id: string;
  readonly sessionId: string;
  readonly pageCount: number;
  readonly pages: Array<{
    readonly id: string;
    readonly pageNumber: number;
    readonly downloadUrl: string;
    readonly byteSize: number;
  }>;
}

export function OwnerSessionManager() {
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdSession, setCreatedSession] = useState<CreatedSession | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedOtp, setCopiedOtp] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [documentData, setDocumentData] = useState<CompletedDocumentData | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setStatusMessage(null);
    setDocumentData(null);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        throw new Error("Failed to create scan session");
      }

      const data = (await res.json()) as CreatedSession;
      setCreatedSession(data);
      setTitle("");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Error creating session");
    } finally {
      setIsCreating(false);
    }
  };

  const scanUrl = createdSession
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/scan/${createdSession.publicToken}`
    : "";

  const handleCopyLink = useCallback(async () => {
    if (!scanUrl) return;
    await navigator.clipboard.writeText(scanUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [scanUrl]);

  const handleCopyOtp = useCallback(async () => {
    if (!createdSession?.otp) return;
    await navigator.clipboard.writeText(createdSession.otp);
    setCopiedOtp(true);
    setTimeout(() => setCopiedOtp(false), 2000);
  }, [createdSession]);

  const handleCheckStatus = async () => {
    if (!createdSession) return;
    setIsChecking(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/owner/sessions/${createdSession.id}/document`);
      if (res.status === 400) {
        setStatusMessage("Recipient has not finished scanning yet.");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load document");
      }

      const data = (await res.json()) as { document: CompletedDocumentData };
      setDocumentData(data.document);
      setStatusMessage("Document is ready!");
    } catch {
      setStatusMessage("Document is not ready yet. Please check back after recipient completes scan.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Request Creation Form */}
      <form onSubmit={handleCreateSession} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-slate-700">
            Document description (optional)
          </label>
          <input
            id="title"
            type="text"
            placeholder="e.g. Passport, Tax return, Gas bill"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <button
          type="submit"
          disabled={isCreating}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-6 text-base font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
        >
          {isCreating ? "Generating secure link…" : "Create Scan Request"}
        </button>
      </form>

      {/* 2. Active Session Card */}
      {createdSession && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-7">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                Active Session
              </span>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                {createdSession.title || "Scan Request"}
              </h2>
            </div>
            <span className="text-xs text-slate-500">Expires in 24h</span>
          </div>

          <div className="mt-5 space-y-4">
            {/* Link Box */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Shareable Scan Link
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  readOnly
                  value={scanUrl}
                  className="flex-1 truncate rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50"
                >
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* OTP Box */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recipient 6-Digit Code
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-mono text-2xl font-bold tracking-widest text-slate-900">
                  {createdSession.otp}
                </span>
                <button
                  type="button"
                  onClick={handleCopyOtp}
                  className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50"
                >
                  {copiedOtp ? "Copied!" : "Copy Code"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Send both the link and this code to the recipient via WhatsApp, SMS, or email.
              </p>
            </div>

            {/* Check Status */}
            <div className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={isChecking}
                className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {isChecking ? "Checking…" : "Check for Completed Scans"}
              </button>

              {statusMessage && (
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {statusMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Received Document Display */}
      {documentData && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 sm:p-7">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">
              ✓
            </span>
            <h3 className="text-lg font-semibold text-slate-900">
              Completed Scan Received ({documentData.pageCount} {documentData.pageCount === 1 ? "page" : "pages"})
            </h3>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {documentData.pages.map((p) => (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="aspect-[3/4] w-full bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.downloadUrl}
                    alt={`Page ${p.pageNumber}`}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="p-2.5 text-center text-xs font-semibold text-slate-700">
                  Page {p.pageNumber}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
