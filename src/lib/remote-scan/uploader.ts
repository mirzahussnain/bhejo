import type { ScannedDocument, ScannedPage } from "@/types/document";

export interface UploadProgress {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly percent: number;
  readonly status: "preparing" | "uploading" | "finalizing" | "done" | "error";
  readonly error?: string;
}

const MAX_PAGE_RETRIES = 3;
const RETRY_DELAYS_MS = [400, 1000, 2000];

/**
 * Computes the SHA-256 hex checksum of a Blob using the browser's native Web Crypto API.
 */
export async function computeBlobChecksum(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Uploads a single page with up to 3 retries on network or transient failure.
 */
async function uploadSinglePageWithRetry(
  page: ScannedPage,
  publicToken: string,
  recipientToken: string,
  checksum: string,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_PAGE_RETRIES; attempt++) {
    try {
      const formData = new FormData();
      formData.append("pageId", page.id);
      formData.append("pageNumber", page.pageNumber.toString());
      formData.append("checksum", checksum);
      formData.append("correctionFallback", page.correctionFallback ? "true" : "false");
      formData.append("file", page.imageBlob, `${page.id}.jpg`);

      const res = await fetch(`/api/sessions/${encodeURIComponent(publicToken)}/upload-page`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${recipientToken}`,
        },
        body: formData,
      });

      if (res.ok) {
        return; // Upload or already_uploaded succeeded
      }

      if (res.status === 409) {
        const errorData = (await res.json()) as { error?: string };
        throw new Error(errorData.error || "Page conflict detected");
      }

      if (res.status === 401 || res.status === 403 || res.status === 410) {
        const errorData = (await res.json()) as { error?: string };
        throw new Error(errorData.error || "Authorization expired");
      }

      const errorText = await res.text();
      lastError = new Error(`Upload failed with status ${res.status}: ${errorText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Non-retryable authorization or conflict errors
      if (
        lastError.message.includes("Authorization expired") ||
        lastError.message.includes("Page conflict")
      ) {
        throw lastError;
      }
    }

    if (attempt < MAX_PAGE_RETRIES) {
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error(`Failed to upload page ${page.pageNumber} after ${MAX_PAGE_RETRIES} attempts`);
}

/**
 * Orchestrates page-by-page sequential upload and authoritative document finalization.
 */
export async function uploadRemoteDocument(
  document: ScannedDocument,
  publicToken: string,
  recipientToken: string,
  onProgress: (progress: UploadProgress) => void,
): Promise<void> {
  const totalPages = document.pages.length;
  if (totalPages === 0) {
    throw new Error("No pages to upload");
  }

  onProgress({
    currentPage: 0,
    totalPages,
    percent: 0,
    status: "preparing",
  });

  // 1. Upload pages sequentially
  for (let i = 0; i < totalPages; i++) {
    const page = document.pages[i];
    const pageNumber = i + 1;

    onProgress({
      currentPage: pageNumber,
      totalPages,
      percent: Math.round((i / totalPages) * 90),
      status: "uploading",
    });

    const checksum = await computeBlobChecksum(page.imageBlob);
    await uploadSinglePageWithRetry(page, publicToken, recipientToken, checksum);
  }

  // 2. Finalize completion on server
  onProgress({
    currentPage: totalPages,
    totalPages,
    percent: 95,
    status: "finalizing",
  });

  const completeRes = await fetch(`/api/sessions/${encodeURIComponent(publicToken)}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${recipientToken}`,
    },
    body: JSON.stringify({
      pageIds: document.pages.map((p) => p.id),
    }),
  });

  if (!completeRes.ok) {
    const errorData = (await completeRes.json()) as { error?: string };
    throw new Error(errorData.error || "Failed to finalize document");
  }

  onProgress({
    currentPage: totalPages,
    totalPages,
    percent: 100,
    status: "done",
  });
}
