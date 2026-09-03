import { useEffect, useRef, useState } from "react";
import type { OwnerSessionDetail } from "@/lib/remote-scan/session-service";
import { ActivityTimeline } from "./ui/ActivityTimeline";
import { DeviceCard } from "./ui/DeviceCard";
import { StatusBadge } from "./ui/StatusBadge";

interface SessionDetailModalProps {
  readonly sessionId: string;
  readonly activeOtp?: string;
  readonly onClose: () => void;
  readonly onStartNewScan: () => void;
}

function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

export function SessionDetailModal({
  sessionId,
  activeOtp,
  onClose,
  onStartNewScan,
}: SessionDetailModalProps) {
  const [detail, setDetail] = useState<OwnerSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedOtp, setCopiedOtp] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const isPollingRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    async function fetchSessionDetail() {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch(`/api/owner/sessions/${encodeURIComponent(sessionId)}`);
        if (isCancelled) return;

        if (!res.ok) {
          throw new Error("Failed to load session details");
        }
        const data = (await res.json()) as OwnerSessionDetail;
        setDetail(data);
        setError(null);
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Error loading session");
        }
      } finally {
        isPollingRef.current = false;
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    void fetchSessionDetail();

    // Live polling every 3 seconds while viewing session
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchSessionDetail();
      }
    }, 3000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  const scanUrl = detail
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/scan/${detail.session.publicToken}`
    : "";

  const handleCopyLink = async () => {
    if (!scanUrl) return;
    await navigator.clipboard.writeText(scanUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyOtp = async (otp: string) => {
    await navigator.clipboard.writeText(otp);
    setCopiedOtp(true);
    setTimeout(() => setCopiedOtp(false), 2000);
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this scan request? The link will no longer work.")) {
      return;
    }

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/owner/sessions/${encodeURIComponent(sessionId)}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to cancel session");
      }
      // Re-fetch detail
      const updatedRes = await fetch(`/api/owner/sessions/${encodeURIComponent(sessionId)}`);
      if (updatedRes.ok) {
        const updated = (await updatedRes.json()) as OwnerSessionDetail;
        setDetail(updated);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error cancelling session");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs sm:p-6 animate-in fade-in duration-150">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/50">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Scan Session Details
            </span>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 truncate">
              {detail?.session.title || "Scan Request"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !detail ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="size-8 animate-spin rounded-full border-3 border-slate-200 border-t-slate-900" />
              <p className="mt-4 text-xs font-medium text-slate-500">Loading session details…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700">
              {error}
            </div>
          ) : detail ? (
            <>
              {/* 1. STATUS & OVERVIEW */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-slate-500">Current Status</span>
                    <div className="mt-1">
                      <StatusBadge
                        status={detail.session.status}
                        pageCount={detail.pageCount}
                      />
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <span className="text-slate-500">Expires</span>
                    <p className="mt-0.5 font-medium text-slate-900">
                      {formatDate(detail.session.expiresAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-200/60 pt-3 text-xs sm:grid-cols-3">
                  <div>
                    <span className="text-slate-500">Created</span>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {formatDate(detail.session.createdAt)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Configured TTL</span>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {detail.session.configuredExpiryHours || 24} hours
                    </p>
                  </div>
                  {detail.session.completedAt && (
                    <div>
                      <span className="text-slate-500">Completed</span>
                      <p className="mt-0.5 font-medium text-emerald-700">
                        {formatDate(detail.session.completedAt)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. RECIPIENT INVITATION (If in 'created' state) */}
              {detail.session.status === "created" && (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                      Share with Recipient
                    </h3>
                    <span className="text-xs font-medium text-amber-800">
                      🟡 Waiting for recipient to connect
                    </span>
                  </div>

                  {/* Public Link Box */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600">
                      Private Scan Link
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        readOnly
                        value={scanUrl}
                        className="flex-1 truncate rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs"
                      >
                        {copiedLink ? "Copied!" : "Copy Link"}
                      </button>
                    </div>
                  </div>

                  {/* 6-Digit Code */}
                  {activeOtp && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">
                        Recipient 6-Digit Code
                      </label>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-xl font-bold tracking-widest text-slate-900 shadow-xs">
                          {activeOtp}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyOtp(activeOtp)}
                          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs"
                        >
                          {copiedOtp ? "Copied!" : "Copy Code"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. CONNECTED DEVICE SECTION */}
              <DeviceCard device={detail.connectedDevice} />

              {/* 4. COMPLETED DOCUMENT PREVIEW (When completed) */}
              {detail.session.status === "completed" && detail.pages.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                        Document Received
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        {detail.pages.length} {detail.pages.length === 1 ? "Page" : "Pages"}
                      </h3>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Immutable
                    </span>
                  </div>

                  {/* Thumbnail Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {detail.pages.map((p) => {
                      const downloadUrl = `/api/owner/sessions/${sessionId}/document/page/${p.id}`;
                      return (
                        <div
                          key={p.id}
                          className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
                        >
                          <div className="aspect-[3/4] w-full bg-slate-100 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={downloadUrl}
                              alt={`Page ${p.pageNumber}`}
                              className="h-full w-full object-contain transition-transform group-hover:scale-102"
                            />
                          </div>

                          <div className="flex items-center justify-between p-2 border-t border-slate-100 bg-white text-xs">
                            <span className="font-semibold text-slate-700">
                              Page {p.pageNumber}
                            </span>
                            <a
                              href={downloadUrl}
                              download={`document-page-${p.pageNumber}.jpg`}
                              className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. ACTIVITY TIMELINE */}
              <ActivityTimeline activities={detail.activities} />
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            {detail?.session.status !== "completed" && detail?.session.status !== "cancelled" && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition shadow-xs disabled:opacity-50"
              >
                {isCancelling ? "Cancelling…" : "Cancel Session"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onStartNewScan();
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-xs"
            >
              Start New Scan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
