import type { SessionActivityEvent } from "@/types/remote-scan";

interface ActivityTimelineProps {
  readonly activities: readonly SessionActivityEvent[];
}

function formatClockTime(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (!activities || activities.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-slate-400">
        No recorded activity events yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Activity Timeline
      </h4>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {activities.map((act) => {
          const isComplete = act.eventType === "document_completed";
          const isConnected = act.eventType === "device_connected" || act.eventType === "otp_verified";

          return (
            <div key={act.id} className="relative flex items-start justify-between gap-3 text-xs">
              {/* Dot marker */}
              <span
                className={`absolute -left-6 top-1 size-2 rounded-full ring-4 ring-white ${
                  isComplete
                    ? "bg-emerald-600"
                    : isConnected
                      ? "bg-emerald-500"
                      : "bg-slate-400"
                }`}
              />

              <div>
                <span
                  className={`font-medium ${
                    isComplete
                      ? "text-emerald-900 font-semibold"
                      : "text-slate-800"
                  }`}
                >
                  {act.description}
                </span>
              </div>

              <span className="shrink-0 font-mono text-[11px] text-slate-400">
                {formatClockTime(act.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
