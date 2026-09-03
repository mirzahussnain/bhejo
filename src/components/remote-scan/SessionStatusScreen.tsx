interface SessionStatusScreenProps {
  readonly status: "expired" | "locked" | "already_completed" | "not_found";
}

export function SessionStatusScreen({ status }: SessionStatusScreenProps) {
  let title = "Scan link unavailable";
  let message = "This scan link is invalid or no longer exists. Please ask the sender to send a new link.";
  let badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  let badgeText = "Unavailable";

  if (status === "expired") {
    title = "This scan link has expired";
    message = "Scan links expire after 24 hours for privacy and security. Please ask the sender to create a new scan request.";
    badgeText = "Link Expired";
    badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  } else if (status === "locked") {
    title = "Scan link locked";
    message = "Too many incorrect code attempts were entered. For security, this link has been locked. Please contact the sender for a new link.";
    badgeText = "Security Lockout";
    badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
  } else if (status === "already_completed") {
    title = "Document already sent";
    message = "This document has already been scanned and safely delivered to the sender. No further action is required.";
    badgeText = "Completed";
    badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="mx-auto mb-5 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide">
          <span className={`rounded-full px-2.5 py-0.5 border ${badgeColor}`}>
            {badgeText}
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white">
          {title}
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          {message}
        </p>

        <div className="mt-8 border-t border-slate-800/80 pt-6">
          <p className="text-xs text-slate-500">
            Bhejo — Private &amp; secure remote scanning
          </p>
        </div>
      </div>
    </main>
  );
}
