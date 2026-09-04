"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendScannedPage,
  calculateNextActiveIndexAfterDelete,
  calculateNextActiveIndexAfterMove,
  createScannedDocument,
  deleteScannedPage,
  generatePageId,
  moveScannedPage,
  reorderScannedPages,
  replaceScannedPage,
} from "@/lib/scanner/document-session";
import type {
  RetakeTarget,
  ScannedDocument,
  ScannedPage,
} from "@/types/document";

export interface NewPagePayload {
  readonly imageBlob: Blob;
  readonly correctionFallback: boolean;
  readonly previewUrl?: string;
}

export function useDocumentSession() {
  const [documentState, setDocumentState] = useState<ScannedDocument>(() =>
    createScannedDocument(),
  );
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [retakeTarget, setRetakeTarget] = useState<RetakeTarget | null>(null);

  // Track all created preview URLs to prevent memory leaks
  const activeUrlsRef = useRef<Set<string>>(new Set());

  const createPreviewUrl = useCallback((blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    activeUrlsRef.current.add(url);
    return url;
  }, []);

  const revokePreviewUrl = useCallback((url: string | null | undefined) => {
    if (!url) {
      return;
    }
    if (activeUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      activeUrlsRef.current.delete(url);
    }
  }, []);

  const addPage = useCallback(
    ({ imageBlob, correctionFallback, previewUrl: existingUrl }: NewPagePayload): ScannedPage => {
      const id = generatePageId();
      const previewUrl = existingUrl ?? createPreviewUrl(imageBlob);
      if (existingUrl) {
        activeUrlsRef.current.add(existingUrl);
      }

      let createdPage: ScannedPage | null = null;
      setDocumentState((prev) => {
        const newPage: ScannedPage = {
          id,
          pageNumber: prev.pages.length + 1,
          imageBlob,
          previewUrl,
          correctionFallback,
          createdAt: Date.now(),
        };
        createdPage = newPage;
        const nextPages = appendScannedPage(prev.pages, newPage);
        return {
          ...prev,
          pages: nextPages,
          updatedAt: Date.now(),
        };
      });

      return (
        createdPage ?? {
          id,
          pageNumber: documentState.pages.length + 1,
          imageBlob,
          previewUrl,
          correctionFallback,
          createdAt: Date.now(),
        }
      );
    },
    [createPreviewUrl, documentState.pages.length],
  );

  const replacePage = useCallback(
    (pageId: string, { imageBlob, correctionFallback, previewUrl: existingUrl }: NewPagePayload): ScannedPage | null => {
      const oldPage = documentState.pages.find((p) => p.id === pageId);
      if (!oldPage) {
        return null;
      }

      // Revoke old URL and use/create new one
      revokePreviewUrl(oldPage.previewUrl);
      const previewUrl = existingUrl ?? createPreviewUrl(imageBlob);
      if (existingUrl) {
        activeUrlsRef.current.add(existingUrl);
      }

      const updatedPage: ScannedPage = {
        id: oldPage.id,
        pageNumber: oldPage.pageNumber,
        imageBlob,
        previewUrl,
        correctionFallback,
        createdAt: Date.now(),
      };

      setDocumentState((prev) => {
        const nextPages = replaceScannedPage(prev.pages, pageId, updatedPage);
        return {
          ...prev,
          pages: nextPages,
          updatedAt: Date.now(),
        };
      });

      setRetakeTarget(null);
      return updatedPage;
    },
    [createPreviewUrl, documentState.pages, revokePreviewUrl],
  );

  const deletePage = useCallback(
    (pageId: string): boolean => {
      const targetIndex = documentState.pages.findIndex((p) => p.id === pageId);
      if (targetIndex === -1) {
        return false;
      }

      const pageToDelete = documentState.pages[targetIndex];
      revokePreviewUrl(pageToDelete.previewUrl);

      const nextPages = deleteScannedPage(documentState.pages, pageId);
      setDocumentState((prev) => ({
        ...prev,
        pages: nextPages,
        updatedAt: Date.now(),
      }));

      // Adjust active index safely
      setActivePageIndex((prevIndex) =>
        calculateNextActiveIndexAfterDelete(prevIndex, nextPages.length),
      );

      return true;
    },
    [documentState.pages, revokePreviewUrl],
  );

  const reorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      setDocumentState((prev) => {
        const nextPages = reorderScannedPages(prev.pages, fromIndex, toIndex);
        return {
          ...prev,
          pages: nextPages,
          updatedAt: Date.now(),
        };
      });
      setActivePageIndex(toIndex);
    },
    [],
  );

  const movePage = useCallback(
    (pageIndex: number, direction: "left" | "right") => {
      const targetIndex = calculateNextActiveIndexAfterMove(
        pageIndex,
        documentState.pages.length,
        direction,
      );
      if (targetIndex === pageIndex) {
        return;
      }

      setDocumentState((prev) => {
        const nextPages = moveScannedPage(prev.pages, pageIndex, direction);
        return {
          ...prev,
          pages: nextPages,
          updatedAt: Date.now(),
        };
      });
      setActivePageIndex(targetIndex);
    },
    [documentState.pages.length],
  );

  const startRetake = useCallback(
    (pageId: string) => {
      const index = documentState.pages.findIndex((p) => p.id === pageId);
      if (index === -1) {
        return;
      }
      const page = documentState.pages[index];
      setRetakeTarget({
        pageId: page.id,
        pageNumber: page.pageNumber,
        index,
      });
    },
    [documentState.pages],
  );

  const cancelRetake = useCallback(() => {
    setRetakeTarget(null);
  }, []);

  const resetDocument = useCallback(() => {
    // Revoke all active object URLs
    activeUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    activeUrlsRef.current.clear();

    setDocumentState(createScannedDocument());
    setActivePageIndex(0);
    setRetakeTarget(null);
  }, []);

  // Revoke all tracked URLs on unmount
  useEffect(() => {
    const urls = activeUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urls.clear();
    };
  }, []);

  return {
    document: documentState,
    pages: documentState.pages,
    pageCount: documentState.pages.length,
    activePageIndex,
    activePage: documentState.pages[activePageIndex] ?? null,
    retakeTarget,
    setActivePageIndex,
    addPage,
    replacePage,
    deletePage,
    reorderPages,
    movePage,
    startRetake,
    cancelRetake,
    resetDocument,
    createPreviewUrl,
    revokePreviewUrl,
    getActiveUrlCount: () => activeUrlsRef.current.size,
  };
}
