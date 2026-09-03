"use client";

import { useMemo, useState } from "react";
import { useOwnerDashboard } from "@/hooks/useOwnerDashboard";
import type { AllowedExpiryHours } from "@/types/remote-scan";
import { NotificationDrawer } from "./NotificationDrawer";
import { SessionDetailModal } from "./SessionDetailModal";
import { ExpirySelector } from "./ui/ExpirySelector";
import { StatusBadge } from "./ui/StatusBadge";

type FilterTab = "all" | "active" | "completed";

interface ActiveCreatedSession {
  readonly id: string;
  readonly publicToken: string;
  readonly otp: string;
  readonly title?: string;
  readonly expiresAt: number;
}

function formatRelativeExpiry(expiresAt: number, status: string): string {
  if (status === "completed") {
    return "Completed";
  }

  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) {
    return "Expired";
  }

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours > 0) {
    return `Expires in ${hours}h`;
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  return `Expires in ${minutes}m`;
}

export function OwnerSessionManager() {
  const {
    sessions,
    notifications,
    unreadCount,
    isLoading,
    error,
    createSession,
    markNotificationRead,
    markAllNotificationsRead,
    refetch,
  } = useOwnerDashboard();

  // Creation State
  const [title, setTitle] = useState("");
  const [expiryHours, setExpiryHours] = useState<AllowedExpiryHours>(24);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Active newly created session (for displaying raw OTP)
  const [activeCreated, setActiveCreated] = useState<ActiveCreatedSession | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedOtp, setCopiedOtp] = useState(false);

  // Filter & Selected Session for Modal
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filter === "active") {
        return s.status === "created" || s.status === "authenticated" || s.status === "uploading";
      }
      if (filter === "completed") {
        return s.status === "completed";
      }
      return true;
    });
  }, [sessions, filter]);

  const activeCount = useMemo(
    () =>
      sessions.filter(
        (s) => s.status === "created" || s.status === "authenticated" || s.status === "uploading",
      ).length,
    [sessions],
  );

  const completedCount = useMemo(
    () => sessions.filter((s) => s.status === "completed").length,
    [sessions],
  );

  // Handle Form Submit
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreationError(null);

    try {
      const created = await createSession(title, expiryHours);
      setActiveCreated({
        id: created.id,
        publicToken: created.publicToken,
        otp: created.otp,
        title: created.title,
        expiresAt: created.expiresAt,
      });
      setTitle("");
      setShowCreateForm(false);
    } catch (err) {
      setCreationError(err instanceof Error ? err.message : "Error creating request");
    } finally {
      setIsCreating(false);
    }
  };

  const activeScanUrl = activeCreated
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/scan/${activeCreated.publicToken}`
    : "";

  const handleCopyLink = async () => {
    if (!activeScanUrl) return;
    await navigator.clipboard.writeText(activeScanUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyOtp = async () => {
    if (!activeCreated?.otp) return;
    await navigator.clipboard.writeText(activeCreated.otp);
    setCopiedOtp(true);
    setTimeout(() => setCopiedOtp(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Scan Requests
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Persistent remote scan sessions and real-time status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Notification Drawer */}
          <NotificationDrawer
            notifications={notifications}
            unreadCount={unreadCount}
            onSelectSession={(id) => setSelectedSessionId(id)}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
          />

          {/* New Request Toggle */}
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <span>{showCreateForm ? "Cancel" : "+ New Scan Request"}</span>
          </button>
        </div>
      </div>

      {/* 2. New Session Creation Box */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6 space-y-4 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Create New Scan Request</h3>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          <div>
            <label htmlFor="scan-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Document Description (optional)
            </label>
            <input
              id="scan-title"
              type="text"
              placeholder="e.g. Passport, Tax Return, Utility Bill"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          {/* Configurable Expiration Selector */}
          <ExpirySelector
            value={expiryHours}
            onChange={(h) => setExpiryHours(h)}
            disabled={isCreating}
          />

          {creationError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {creationError}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isCreating}
              className="flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-400"
            >
              {isCreating ? "Generating secure link…" : "Generate Request"}
            </button>
          </div>
        </form>
      )}

      {/* 3. Active Newly Created Banner */}
      {activeCreated && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Ready to Send
              </span>
              <h3 className="mt-1 text-base font-bold text-slate-900">
                {activeCreated.title || "Scan Request"}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSessionId(activeCreated.id)}
              className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 shadow-2xs"
            >
              View Full Details
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* Link Box */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-500">
                Shareable Link
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  value={activeScanUrl}
                  className="flex-1 truncate rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-800"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* OTP Box */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-500">
                Recipient 6-Digit Code
              </label>
              <div className="mt-1 flex items-center gap-3">
                <span className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-xl font-bold tracking-widest text-slate-900 shadow-2xs">
                  {activeCreated.otp}
                </span>
                <button
                  type="button"
                  onClick={handleCopyOtp}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  {copiedOtp ? "Copied!" : "Copy Code"}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Send this link and 6-digit code to the recipient. Once they verify on their phone, they can scan immediately.
            </p>
          </div>
        </div>
      )}

      {/* 4. Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            filter === "all"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          All ({sessions.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("active")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            filter === "active"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Active ({activeCount})
        </button>

        <button
          type="button"
          onClick={() => setFilter("completed")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            filter === "completed"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Completed ({completedCount})
        </button>
      </div>

      {/* 5. Persistent Session History List */}
      <div className="space-y-3">
        {isLoading && sessions.length === 0 ? (
          <div className="py-16 text-center">
            <span className="size-8 animate-spin rounded-full border-3 border-slate-200 border-t-slate-900" />
            <p className="mt-3 text-xs text-slate-400">Loading session history…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700">
            {error}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
            <p className="text-sm font-medium text-slate-700">No scan requests found</p>
            <p className="mt-1 text-xs text-slate-400">
              {filter === "active"
                ? "No scan requests currently in progress."
                : filter === "completed"
                  ? "No completed scans received yet."
                  : "Create your first scan request above to get started."}
            </p>
            {!showCreateForm && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800"
              >
                + Create Scan Request
              </button>
            )}
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              className="group flex cursor-pointer flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 group-hover:text-slate-950">
                    {session.title || "Scan Request"}
                  </h4>
                  <StatusBadge
                    status={session.status}
                    pageCount={session.pageCount}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  {session.connectedDevice && (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {session.connectedDevice.displayName}
                    </span>
                  )}

                  {session.status === "completed" && session.pageCount > 0 && (
                    <span>
                      {session.pageCount} {session.pageCount === 1 ? "page" : "pages"}
                    </span>
                  )}

                  <span>{formatRelativeExpiry(session.expiresAt, session.status)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 flex items-center gap-1">
                  View details
                  <svg className="size-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 6. Session Detail Modal */}
      {selectedSessionId && (
        <SessionDetailModal
          sessionId={selectedSessionId}
          activeOtp={
            activeCreated?.id === selectedSessionId ? activeCreated.otp : undefined
          }
          onClose={() => {
            setSelectedSessionId(null);
            void refetch();
          }}
          onStartNewScan={() => {
            setSelectedSessionId(null);
            setShowCreateForm(true);
          }}
        />
      )}
    </div>
  );
}
