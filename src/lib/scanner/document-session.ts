import type { ScannedDocument, ScannedPage } from "@/types/document";

export function generateDocumentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `doc_${crypto.randomUUID()}`;
  }
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generatePageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `page_${crypto.randomUUID()}`;
  }
  return `page_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function renumberPages(pages: readonly ScannedPage[]): ScannedPage[] {
  return pages.map((page, index) => {
    const pageNumber = index + 1;
    if (page.pageNumber === pageNumber) {
      return page;
    }
    return {
      ...page,
      pageNumber,
    };
  });
}

export function createScannedDocument(
  pages: readonly ScannedPage[] = [],
  id: string = generateDocumentId(),
  createdAt: number = Date.now(),
): ScannedDocument {
  const renumbered = renumberPages(pages);
  return {
    id,
    pages: renumbered,
    createdAt,
    updatedAt: createdAt,
  };
}

export function appendScannedPage(
  pages: readonly ScannedPage[],
  newPage: ScannedPage,
): ScannedPage[] {
  return renumberPages([...pages, newPage]);
}

export function replaceScannedPage(
  pages: readonly ScannedPage[],
  pageId: string,
  updatedPage: ScannedPage,
): ScannedPage[] {
  const targetIndex = pages.findIndex((p) => p.id === pageId);
  if (targetIndex === -1) {
    return renumberPages(pages);
  }

  const nextPages = [...pages];
  nextPages[targetIndex] = updatedPage;
  return renumberPages(nextPages);
}

export function deleteScannedPage(
  pages: readonly ScannedPage[],
  pageId: string,
): ScannedPage[] {
  const filtered = pages.filter((p) => p.id !== pageId);
  return renumberPages(filtered);
}

export function reorderScannedPages(
  pages: readonly ScannedPage[],
  fromIndex: number,
  toIndex: number,
): ScannedPage[] {
  if (
    pages.length <= 1 ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= pages.length ||
    toIndex < 0 ||
    toIndex >= pages.length
  ) {
    return renumberPages(pages);
  }

  const result = [...pages];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return renumberPages(result);
}

export function moveScannedPage(
  pages: readonly ScannedPage[],
  pageIndex: number,
  direction: "left" | "right",
): ScannedPage[] {
  if (direction === "left") {
    return reorderScannedPages(pages, pageIndex, pageIndex - 1);
  }
  return reorderScannedPages(pages, pageIndex, pageIndex + 1);
}

export function calculateNextActiveIndexAfterDelete(
  currentIndex: number,
  remainingLength: number,
): number {
  if (remainingLength <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(currentIndex, remainingLength - 1));
}

export function calculateNextActiveIndexAfterMove(
  currentIndex: number,
  totalLength: number,
  direction: "left" | "right",
): number {
  if (totalLength <= 1) {
    return 0;
  }
  if (direction === "left") {
    return Math.max(0, currentIndex - 1);
  }
  return Math.min(totalLength - 1, currentIndex + 1);
}

