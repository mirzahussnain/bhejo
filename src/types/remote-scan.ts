export type SessionStatus =
  | "created"
  | "authenticated"
  | "uploading"
  | "completed"
  | "expired"
  | "locked"
  | "cancelled";

export const LINK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (default)
export const ACTIVE_SCAN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
export const MAX_OTP_ATTEMPTS = 5;
export const MAX_PAGES_PER_DOCUMENT = 50;
export const MAX_PAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_EXPIRY_HOURS = [1, 6, 24, 48, 72] as const;
export type AllowedExpiryHours = (typeof ALLOWED_EXPIRY_HOURS)[number];

export interface ConnectedDeviceInfo {
  readonly deviceFamily: string; // e.g. "iPhone", "Android", "Mac", "Windows", "Unknown"
  readonly browser: string; // e.g. "Safari", "Chrome", "Firefox", "Edge"
  readonly os: string; // e.g. "iOS 18", "Android 15", "macOS"
  readonly displayName: string; // e.g. "iPhone · Safari"
  readonly ipAddress: string; // Masked for display, e.g. "82.xxx.xxx.xxx"
  readonly connectedAt: number;
  readonly lastActivityAt: number;
}

export type ActivityEventType =
  | "created"
  | "link_opened"
  | "otp_verified"
  | "device_connected"
  | "page_uploaded"
  | "document_completed"
  | "session_cancelled";

export interface SessionActivityEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly eventType: ActivityEventType;
  readonly description: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: number;
}

export interface OwnerNotification {
  readonly id: string;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly message: string;
  readonly pageCount: number;
  readonly deviceDisplay: string;
  readonly isRead: boolean;
  readonly createdAt: number;
  readonly readAt: number | null;
}

export interface ScanSession {
  readonly id: string;
  readonly ownerId: string;
  readonly publicToken: string;
  readonly title?: string;
  readonly status: SessionStatus;
  readonly otpHash: string | null;
  readonly otpSalt: string | null;
  readonly otpAttempts: number;
  readonly maxOtpAttempts: number;
  readonly recipientTokenHash: string | null;
  readonly expiresAt: number;
  readonly configuredExpiryHours?: number;
  readonly activeScanExpiresAt: number | null;
  readonly connectedDevice?: ConnectedDeviceInfo | null;
  readonly lastActivityAt?: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
}

export interface UploadedPageRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly pageNumber: number;
  readonly storagePath: string;
  readonly mimeType: "image/jpeg";
  readonly byteSize: number;
  readonly sha256Checksum: string;
  readonly correctionFallback: boolean;
  readonly createdAt: number;
}

export interface UploadedDocumentRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly ownerId: string;
  readonly pageCount: number;
  readonly pages: readonly UploadedPageRecord[];
  readonly createdAt: number;
  readonly completedAt: number;
}

export interface PublicSessionInfo {
  readonly status: SessionStatus;
  readonly title?: string;
  readonly expiresAt: number;
}

export interface VerifyOtpResult {
  readonly success: boolean;
  readonly recipientToken?: string;
  readonly attemptsRemaining?: number;
  readonly error?:
    | "invalid_otp"
    | "locked"
    | "expired"
    | "already_authenticated"
    | "already_completed"
    | "cancelled"
    | "not_found";
}

export interface UploadPageResult {
  readonly success: boolean;
  readonly pageId: string;
  readonly pageNumber: number;
  readonly status: "uploaded" | "already_uploaded";
  readonly error?: string;
}

export interface CompleteSessionResult {
  readonly success: boolean;
  readonly status: "completed";
  readonly pageCount: number;
  readonly error?: string;
}
