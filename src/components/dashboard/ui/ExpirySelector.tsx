import { ALLOWED_EXPIRY_HOURS, type AllowedExpiryHours } from "@/types/remote-scan";

interface ExpirySelectorProps {
  readonly value: AllowedExpiryHours;
  readonly onChange: (hours: AllowedExpiryHours) => void;
  readonly disabled?: boolean;
}

export function ExpirySelector({ value, onChange, disabled }: ExpirySelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Link Expiration
        </label>
        <span className="text-xs text-slate-500">
          Active scan window: <strong>2h</strong>
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {ALLOWED_EXPIRY_HOURS.map((hours) => {
          const isSelected = value === hours;
          return (
            <button
              key={hours}
              type="button"
              disabled={disabled}
              onClick={() => onChange(hours)}
              className={`flex flex-col items-center justify-center rounded-xl border py-2 px-1 text-center transition-all ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white shadow-sm font-semibold"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="text-sm leading-none">{hours}h</span>
              <span className={`text-[10px] mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                {hours === 24 ? "Default" : hours < 24 ? "Short" : "Extended"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">
        The public scan link will expire after {value} hours. Once the recipient enters the code, they have 2 hours to scan and submit.
      </p>
    </div>
  );
}
