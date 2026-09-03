import {
  LINK_TTL_MS,
  MAX_OTP_ATTEMPTS,
  MAX_PAGE_FILE_SIZE_BYTES,
  MAX_PAGES_PER_DOCUMENT,
  type CompleteSessionResult,
  type PublicSessionInfo,
  type ScanSession,
  type UploadedDocumentRecord,
  type UploadedPageRecord,
  type UploadPageResult,
  type VerifyOtpResult,
} from "../../types/remote-scan.ts";
import { generateOtp, generateOtpSalt, hashOtp, verifyOtp } from "./otp.ts";
import { getSessionRepository } from "./session-repository.ts";
import { getStorageService } from "./storage-service.ts";
import {
  computeChecksum,
  generatePublicToken,
  generateRecipientToken,
  generateSessionId,
  hashToken,
  verifyTokenHash,
} from "./token.ts";

export interface CreateSessionResult {
  readonly id: string;
  readonly publicToken: string;
  readonly otp: string;
  readonly expiresAt: number;
  readonly status: ScanSession["status"];
  readonly title?: string;
}

export async function createOwnerSession(
  ownerId: string,
  title?: string,
): Promise<CreateSessionResult> {
  const rawOtp = generateOtp();
  const otpSalt = generateOtpSalt();
  const otpHash = await hashOtp(rawOtp, otpSalt);
  const now = Date.now();
  const expiresAt = now + LINK_TTL_MS;

  const session: ScanSession = {
    id: generateSessionId(),
    ownerId,
    publicToken: generatePublicToken(),
    title: title && title.trim().length > 0 ? title.trim().slice(0, 100) : undefined,
    status: "created",
    otpHash,
    otpSalt,
    otpAttempts: 0,
    maxOtpAttempts: MAX_OTP_ATTEMPTS,
    recipientTokenHash: null,
    expiresAt,
    activeScanExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  const repo = getSessionRepository();
  await repo.createSession(session);

  return {
    id: session.id,
    publicToken: session.publicToken,
    otp: rawOtp,
    expiresAt: session.expiresAt,
    status: session.status,
    title: session.title,
  };
}

export async function getPublicSessionInfo(
  publicToken: string,
): Promise<{ status: number; body: PublicSessionInfo | { error: string } }> {
  if (!publicToken) {
    return { status: 400, body: { error: "Invalid token" } };
  }

  const repo = getSessionRepository();
  const session = await repo.findByPublicToken(publicToken);

  if (!session) {
    return { status: 404, body: { error: "Session not found" } };
  }

  const now = Date.now();
  let status = session.status;

  if (now > session.expiresAt || (session.activeScanExpiresAt && now > session.activeScanExpiresAt)) {
    if (status !== "completed") {
      status = "expired";
    }
  }

  return {
    status: 200,
    body: {
      status,
      title: session.title,
      expiresAt: session.expiresAt,
    },
  };
}

export async function verifySessionOtp(
  publicToken: string,
  rawOtp: string,
): Promise<{ status: number; body: VerifyOtpResult }> {
  const otp = rawOtp ? rawOtp.trim() : "";
  if (!/^\d{6}$/.test(otp)) {
    return { status: 400, body: { success: false, error: "invalid_otp" } };
  }

  const repo = getSessionRepository();
  const session = await repo.findByPublicToken(publicToken);

  if (!session) {
    return { status: 404, body: { success: false, error: "not_found" } };
  }

  const now = Date.now();

  if (now > session.expiresAt) {
    return { status: 410, body: { success: false, error: "expired" } };
  }

  if (session.status === "locked" || session.otpAttempts >= MAX_OTP_ATTEMPTS) {
    return { status: 403, body: { success: false, error: "locked", attemptsRemaining: 0 } };
  }

  if (session.status === "completed") {
    return { status: 409, body: { success: false, error: "already_completed" } };
  }

  if (session.status !== "created") {
    return { status: 409, body: { success: false, error: "already_authenticated" } };
  }

  if (!session.otpHash || !session.otpSalt) {
    return { status: 400, body: { success: false, error: "invalid_otp" } };
  }

  const isMatch = await verifyOtp(otp, session.otpHash, session.otpSalt);

  if (!isMatch) {
    const failedResult = await repo.recordFailedOtpAttempt(publicToken, now);
    const httpStatus = failedResult.isLocked ? 403 : 401;
    return {
      status: httpStatus,
      body: {
        success: false,
        error: failedResult.isLocked ? "locked" : "invalid_otp",
        attemptsRemaining: failedResult.attemptsRemaining,
      },
    };
  }

  // Generate 256-bit opaque recipient token
  const recipientToken = generateRecipientToken();
  const recipientTokenHash = hashToken(recipientToken);

  const updatedSession = await repo.authenticateSession(
    publicToken,
    recipientTokenHash,
    now,
  );

  if (!updatedSession) {
    return { status: 409, body: { success: false, error: "already_authenticated" } };
  }

  return {
    status: 200,
    body: {
      success: true,
      recipientToken,
    },
  };
}

export interface UploadPageParams {
  readonly publicToken: string;
  readonly recipientToken: string;
  readonly pageId: string;
  readonly pageNumber: number;
  readonly checksum: string;
  readonly correctionFallback: boolean;
  readonly fileBuffer: Buffer;
}

export async function processPageUpload(
  params: UploadPageParams,
): Promise<{ status: number; body: UploadPageResult }> {
  const {
    publicToken,
    recipientToken,
    pageId,
    pageNumber,
    checksum,
    correctionFallback,
    fileBuffer,
  } = params;

  if (!publicToken || !recipientToken) {
    return { status: 401, body: { success: false, pageId, pageNumber, status: "uploaded", error: "Unauthorized" } };
  }

  const repo = getSessionRepository();
  const session = await repo.findByPublicToken(publicToken);

  if (!session) {
    return { status: 404, body: { success: false, pageId, pageNumber, status: "uploaded", error: "Session not found" } };
  }

  if (!session.recipientTokenHash || !verifyTokenHash(recipientToken, session.recipientTokenHash)) {
    return { status: 401, body: { success: false, pageId, pageNumber, status: "uploaded", error: "Invalid recipient token" } };
  }

  const now = Date.now();

  if (now > session.expiresAt || (session.activeScanExpiresAt && now > session.activeScanExpiresAt)) {
    return { status: 410, body: { success: false, pageId, pageNumber, status: "uploaded", error: "Session expired" } };
  }

  if (session.status === "completed") {
    return { status: 409, body: { success: false, pageId, pageNumber, status: "uploaded", error: "Session already completed" } };
  }

  if (session.status !== "authenticated" && session.status !== "uploading") {
    return { status: 403, body: { success: false, pageId, pageNumber, status: "uploaded", error: "Invalid session status" } };
  }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(pageId)) {
    return { status: 400, body: { success: false, pageId, pageNumber, status: "uploaded", error: "Invalid page ID format" } };
  }

  if (pageNumber < 1 || pageNumber > MAX_PAGES_PER_DOCUMENT) {
    return {
      status: 400,
      body: { success: false, pageId, pageNumber, status: "uploaded", error: `Page number must be 1-${MAX_PAGES_PER_DOCUMENT}` },
    };
  }

  if (fileBuffer.length > MAX_PAGE_FILE_SIZE_BYTES) {
    return {
      status: 413,
      body: { success: false, pageId, pageNumber, status: "uploaded", error: "Page exceeds 10MB limit" },
    };
  }

  // Magic bytes check (JPEG SOI 0xFF, 0xD8, 0xFF)
  if (fileBuffer.length < 4 || fileBuffer[0] !== 0xff || fileBuffer[1] !== 0xd8 || fileBuffer[2] !== 0xff) {
    return {
      status: 415,
      body: { success: false, pageId, pageNumber, status: "uploaded", error: "Page must be a valid JPEG image" },
    };
  }

  // Checksum verification
  const computedChecksum = computeChecksum(fileBuffer);
  if (computedChecksum.toLowerCase() !== checksum.toLowerCase()) {
    return {
      status: 400,
      body: { success: false, pageId, pageNumber, status: "uploaded", error: "Checksum mismatch" },
    };
  }

  // Save to private storage
  const storage = getStorageService();
  const storagePath = await storage.savePage(session.id, pageId, fileBuffer);

  // Record in database
  const pageRecord: UploadedPageRecord = {
    id: pageId,
    sessionId: session.id,
    pageNumber,
    storagePath,
    mimeType: "image/jpeg",
    byteSize: fileBuffer.length,
    sha256Checksum: computedChecksum.toLowerCase(),
    correctionFallback,
    createdAt: now,
  };

  const dbResult = await repo.addUploadedPage(pageRecord);

  if (dbResult.conflict) {
    return {
      status: 409,
      body: {
        success: false,
        pageId,
        pageNumber,
        status: "uploaded",
        error: "Page with this ID already exists with different contents",
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      pageId,
      pageNumber,
      status: dbResult.isDuplicate ? "already_uploaded" : "uploaded",
    },
  };
}

export interface FinalizeParams {
  readonly publicToken: string;
  readonly recipientToken: string;
  readonly clientPageIds: readonly string[];
}

export async function finalizeSession(
  params: FinalizeParams,
): Promise<{ status: number; body: CompleteSessionResult | { error: string } }> {
  const { publicToken, recipientToken, clientPageIds } = params;

  if (!publicToken || !recipientToken) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const repo = getSessionRepository();
  const session = await repo.findByPublicToken(publicToken);

  if (!session) {
    return { status: 404, body: { error: "Session not found" } };
  }

  if (!session.recipientTokenHash || !verifyTokenHash(recipientToken, session.recipientTokenHash)) {
    return { status: 401, body: { error: "Invalid recipient token" } };
  }

  const now = Date.now();

  if (now > session.expiresAt || (session.activeScanExpiresAt && now > session.activeScanExpiresAt)) {
    return { status: 410, body: { error: "Session expired" } };
  }

  if (session.status === "completed") {
    return { status: 409, body: { error: "Session already completed" } };
  }

  if (session.status !== "uploading" && session.status !== "authenticated") {
    return { status: 403, body: { error: "Invalid session status" } };
  }

  if (!Array.isArray(clientPageIds) || clientPageIds.length === 0) {
    return { status: 400, body: { error: "Document must contain at least 1 page" } };
  }

  if (clientPageIds.length > MAX_PAGES_PER_DOCUMENT) {
    return { status: 400, body: { error: `Document exceeds maximum allowed pages (${MAX_PAGES_PER_DOCUMENT})` } };
  }

  const uniqueIds = new Set(clientPageIds);
  if (uniqueIds.size !== clientPageIds.length) {
    return { status: 400, body: { error: "Duplicate page IDs in submission" } };
  }

  const storedPages = await repo.getPagesForSession(session.id);
  if (storedPages.length === 0) {
    return { status: 400, body: { error: "No uploaded pages found for this session" } };
  }

  if (storedPages.length !== clientPageIds.length) {
    return {
      status: 400,
      body: {
        error: `Page count mismatch: client specified ${clientPageIds.length} pages, but server holds ${storedPages.length} pages`,
      },
    };
  }

  // Sort stored pages by page number ascending
  const sortedPages = [...storedPages].sort((a, b) => a.pageNumber - b.pageNumber);

  // Authoritative check: page numbers must be strictly contiguous from 1 to N
  for (let i = 0; i < sortedPages.length; i++) {
    const expectedPageNum = i + 1;
    if (sortedPages[i].pageNumber !== expectedPageNum) {
      return {
        status: 400,
        body: {
          error: `Non-contiguous page numbers detected: expected page ${expectedPageNum}, found ${sortedPages[i].pageNumber}`,
        },
      };
    }
    if (clientPageIds[i] !== sortedPages[i].id) {
      return {
        status: 400,
        body: {
          error: `Page order mismatch at position ${expectedPageNum}`,
        },
      };
    }
  }

  // Verify storage files
  const storage = getStorageService();
  for (const p of storedPages) {
    const file = await storage.getPage(p.storagePath);
    if (!file || file.length === 0) {
      return { status: 500, body: { error: `Storage file for page ${p.pageNumber} is missing` } };
    }
  }

  if (session.status === "authenticated") {
    await repo.markUploading(session.id, now);
  }

  const completed = await repo.completeSession(session.id, storedPages.length, now);
  if (!completed) {
    return { status: 409, body: { error: "Failed to finalize session (conflict or expired)" } };
  }

  return {
    status: 200,
    body: {
      success: true,
      status: "completed",
      pageCount: storedPages.length,
    },
  };
}

export async function getOwnerDocument(
  ownerId: string,
  sessionId: string,
): Promise<{ status: number; body: { document: UploadedDocumentRecord } | { error: string } }> {
  if (!ownerId || !sessionId) {
    return { status: 400, body: { error: "Invalid parameters" } };
  }

  const repo = getSessionRepository();
  const session = await repo.findById(sessionId);

  if (!session) {
    return { status: 404, body: { error: "Session not found" } };
  }

  if (session.ownerId !== ownerId) {
    return { status: 403, body: { error: "Forbidden: not session owner" } };
  }

  if (session.status !== "completed") {
    return { status: 400, body: { error: "Document is not ready" } };
  }

  const document = await repo.getCompletedDocument(sessionId);
  if (!document) {
    return { status: 404, body: { error: "Document not found" } };
  }

  return { status: 200, body: { document } };
}

export async function getOwnerPageBinary(
  ownerId: string,
  sessionId: string,
  pageId: string,
): Promise<{ status: number; buffer?: Buffer; error?: string }> {
  if (!ownerId || !sessionId || !pageId) {
    return { status: 400, error: "Invalid parameters" };
  }

  const repo = getSessionRepository();
  const session = await repo.findById(sessionId);

  if (!session) {
    return { status: 404, error: "Session not found" };
  }

  if (session.ownerId !== ownerId) {
    return { status: 403, error: "Forbidden: not session owner" };
  }

  if (session.status !== "completed") {
    return { status: 400, error: "Document not ready" };
  }

  const pages = await repo.getPagesForSession(sessionId);
  const targetPage = pages.find((p) => p.id === pageId);

  if (!targetPage) {
    return { status: 404, error: "Page not found" };
  }

  const storage = getStorageService();
  const fileBuffer = await storage.getPage(targetPage.storagePath);

  if (!fileBuffer) {
    return { status: 404, error: "Page file missing" };
  }

  return { status: 200, buffer: fileBuffer };
}
