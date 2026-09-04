"use client";

import type { EnhancementPreset } from "@/types/workspace";
import { ENHANCEMENT_PRESET_OPTIONS } from "@/lib/workspace/constants";

interface PresetSelectorProps {
  readonly activePreset: EnhancementPreset;
  readonly onSelectPreset: (preset: EnhancementPreset) => void;
  readonly disabled?: boolean;
}

export function PresetSelector({
  activePreset,
  onSelectPreset,
  disabled = false,
}: PresetSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
      {ENHANCEMENT_PRESET_OPTIONS.map((option) => {
        const isActive = activePreset === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelectPreset(option.id)}
            disabled={disabled}
            title={option.description}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition shadow-2xs ${
              isActive
                ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
            } disabled:opacity-50`}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
