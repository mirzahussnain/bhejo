import { useState } from "react";
import type { ConnectedDeviceInfo } from "@/types/remote-scan";

interface DeviceCardProps {
  readonly device: ConnectedDeviceInfo | null | undefined;
  readonly defaultExpanded?: boolean;
}

function formatClockTime(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function DeviceCard({ device, defaultExpanded = true }: DeviceCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!device) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Connected Device
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="size-2 rounded-full bg-slate-300" />
            No recipient connected yet
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Device details will appear here once the recipient opens the link and enters the code.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40 transition">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 sm:p-5 text-left hover:bg-emerald-50/70"
        aria-expanded={isExpanded}
      >
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            Connected Device
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-slate-900">
              {device.displayName || "Recipient Device"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {device.os !== "Unknown OS" ? device.os : ""}
          </span>
          <svg
            className={`size-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-emerald-200/60 bg-white/70 p-4 sm:p-5 pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 text-xs">
            <div>
              <dt className="text-slate-500">Operating System</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{device.os || "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Browser</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{device.browser || "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Connected</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {formatClockTime(device.connectedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Last Activity</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {formatClockTime(device.lastActivityAt)}
              </dd>
            </div>
          </dl>

          {device.ipAddress && device.ipAddress !== "Unknown" && (
            <div className="mt-3.5 border-t border-slate-200/60 pt-2.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>Masked IP Address</span>
              <span className="font-mono text-slate-700">{device.ipAddress}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
