import type { UploadedPageRecord } from "./remote-scan";

export type EnhancementPreset = "original" | "auto" | "document" | "grayscale";

export interface PageEditState {
  readonly rotation: 0 | 90 | 180 | 270;
  readonly preset: EnhancementPreset;
  readonly isCropped: boolean;
}

export type WorkspaceMode = "preview" | "edit";

export interface WorkspacePageInfo {
  readonly id: string;
  readonly pageNumber: number;
  readonly downloadUrl: string;
  readonly byteSize: number;
  readonly mimeType: string;
}

export function toWorkspacePageInfo(
  sessionId: string,
  page: UploadedPageRecord,
): WorkspacePageInfo {
  return {
    id: page.id,
    pageNumber: page.pageNumber,
    downloadUrl: `/api/owner/sessions/${encodeURIComponent(sessionId)}/document/page/${encodeURIComponent(page.id)}`,
    byteSize: page.byteSize,
    mimeType: page.mimeType,
  };
}
