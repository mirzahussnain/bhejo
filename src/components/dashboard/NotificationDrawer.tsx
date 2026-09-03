import { useState } from "react";
import type { OwnerNotification } from "@/types/remote-scan";

interface NotificationDrawerProps {
  readonly notifications: readonly OwnerNotification[];
  readonly unreadCount: number;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onMarkRead: (notificationId: string) => void;
  readonly onMarkAllRead: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationDrawer({
  notifications,
  unreadCount,
  onSelectSession,
  onMarkRead,
  onMarkAllRead,
}: NotificationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleReview = (notification: OwnerNotification) => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    setIsOpen(false);
    onSelectSession(notification.sessionId);
  };

  return (
    <div className="relative">
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
        className="relative flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-5 h-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white shadow-sm ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover / Dropdown Drawer */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {/* List */}
            <div className="mt-3 max-h-96 space-y-2.5 overflow-y-auto pr-0.5">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3.5 transition ${
                      n.isRead
                        ? "border-slate-100 bg-slate-50/50"
                        : "border-emerald-200/80 bg-emerald-50/40 shadow-xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {!n.isRead && (
                          <span className="size-2 rounded-full bg-emerald-500" />
                        )}
                        <span className="text-xs font-semibold text-slate-900">
                          {n.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatTimeAgo(n.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                      {n.message}
                    </p>

                    <div className="mt-2 text-[11px] text-slate-500">
                      {n.pageCount} {n.pageCount === 1 ? "page" : "pages"} received from{" "}
                      <strong className="font-semibold text-slate-700">{n.deviceDisplay}</strong>
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200/50">
                      <button
                        type="button"
                        onClick={() => handleReview(n)}
                        className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 transition shadow-xs"
                      >
                        Review document
                      </button>

                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(n.id)}
                          className="text-[11px] text-slate-400 hover:text-slate-600"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
