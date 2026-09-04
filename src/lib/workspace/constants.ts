import type { EnhancementPreset, PageEditState } from "../../types/workspace.ts";

export const DEFAULT_PAGE_EDIT_STATE: PageEditState = {
  rotation: 0,
  preset: "original",
  isCropped: false,
};

export const DEFAULT_EXPORT_JPEG_QUALITY = 0.94;

export interface PresetOption {
  readonly id: EnhancementPreset;
  readonly label: string;
  readonly description: string;
}

export const ENHANCEMENT_PRESET_OPTIONS: readonly PresetOption[] = [
  {
    id: "original",
    label: "Original",
    description: "Pristine scan without alteration",
  },
  {
    id: "auto",
    label: "Auto",
    description: "Balanced lighting and contrast normalization",
  },
  {
    id: "document",
    label: "Document",
    description: "Enhanced text legibility and document contrast",
  },
  {
    id: "grayscale",
    label: "Grayscale",
    description: "High-contrast monochrome for forms & receipts",
  },
] as const;
