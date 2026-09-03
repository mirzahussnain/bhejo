export interface ScannedPage {
  readonly id: string;
  readonly pageNumber: number;
  readonly imageBlob: Blob;
  readonly previewUrl: string;
  readonly correctionFallback: boolean;
  readonly createdAt: number;
}

export interface ScannedDocument {
  readonly id: string;
  readonly pages: readonly ScannedPage[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RetakeTarget {
  readonly pageId: string;
  readonly pageNumber: number;
  readonly index: number;
}
