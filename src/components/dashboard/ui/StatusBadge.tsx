import type { SessionStatus } from "@/types/remote-scan";

interface StatusBadgeProps {
  readonly status: SessionStatus;
  readonly pageCount?: number;
  readonly totalPages?: number;
  readonly className?: string;
}

export function StatusBadge({ status, pageCount, totalPages, className = "" }: StatusBadgeProps) {
  switch (status) {
    case "created":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200/80 ${className}`}
        >
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
          Waiting for recipient
        </span>
      );
    case "authenticated":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200/80 ${className}`}
        >
          <span className="size-2 rounded-full bg-emerald-500" />
          Recipient connected
        </span>
      );
    case "uploading":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 border border-sky-200/80 ${className}`}
        >
          <span className="size-2 rounded-full bg-sky-500 animate-pulse" />
          {pageCount && totalPages
            ? `Uploading ${pageCount}/${totalPages}`
            : pageCount
              ? `Uploading ${pageCount} ${pageCount === 1 ? "page" : "pages"}`
              : "Uploading pages"}
        </span>
      );
    case "completed":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 border border-emerald-300 ${className}`}
        >
          <svg className="size-3 text-emerald-700" viewBox="0 0 16 16" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.739a.75.75 0 0 1 1.04-.208Z"
              clipRule="evenodd"
            />
          </svg>
          Document received
        </span>
      );
    case "expired":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200 ${className}`}
        >
          <span className="size-2 rounded-full bg-slate-400" />
          Expired
        </span>
      );
    case "locked":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 border border-rose-200 ${className}`}
        >
          <span className="size-2 rounded-full bg-rose-500" />
          Locked (too many attempts)
        </span>
      );
    case "cancelled":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 border border-slate-200 ${className}`}
        >
          <span className="size-2 rounded-full bg-slate-400" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ${className}`}>
          {status}
        </span>
      );
  }
}
