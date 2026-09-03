import {
  ACTIVE_SCAN_TTL_MS,
  MAX_OTP_ATTEMPTS,
  type ScanSession,
  type UploadedDocumentRecord,
  type UploadedPageRecord,
} from "../../types/remote-scan.ts";

export interface AddPageResult {
  readonly success: boolean;
  readonly isDuplicate: boolean;
  readonly conflict: boolean;
}

export interface FailedOtpResult {
  readonly session: ScanSession | null;
  readonly isLocked: boolean;
  readonly attemptsRemaining: number;
}

export interface ScanSessionRepository {
  createSession(session: ScanSession): Promise<ScanSession>;
  findByPublicToken(publicToken: string): Promise<ScanSession | null>;
  findById(id: string): Promise<ScanSession | null>;
  findByOwnerId(ownerId: string): Promise<readonly ScanSession[]>;
  recordFailedOtpAttempt(publicToken: string, now: number): Promise<FailedOtpResult>;
  authenticateSession(
    publicToken: string,
    recipientTokenHash: string,
    now: number,
  ): Promise<ScanSession | null>;
  markUploading(sessionId: string, now: number): Promise<boolean>;
  addUploadedPage(page: UploadedPageRecord): Promise<AddPageResult>;
  getPagesForSession(sessionId: string): Promise<readonly UploadedPageRecord[]>;
  completeSession(sessionId: string, pageCount: number, now: number): Promise<boolean>;
  getCompletedDocument(sessionId: string): Promise<UploadedDocumentRecord | null>;
}

/**
 * In-Memory repository used strictly as an isolated unit test double.
 * Implements authoritative atomic state transitions and concurrency rules.
 */
export class InMemoryScanSessionRepository implements ScanSessionRepository {
  private readonly sessions = new Map<string, ScanSession>();
  private readonly pages = new Map<string, UploadedPageRecord[]>();

  async createSession(session: ScanSession): Promise<ScanSession> {
    this.sessions.set(session.id, { ...session });
    this.pages.set(session.id, []);
    return session;
  }

  async findByPublicToken(publicToken: string): Promise<ScanSession | null> {
    for (const session of this.sessions.values()) {
      if (session.publicToken === publicToken) {
        return { ...session };
      }
    }
    return null;
  }

  async findById(id: string): Promise<ScanSession | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  async findByOwnerId(ownerId: string): Promise<readonly ScanSession[]> {
    const results: ScanSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.ownerId === ownerId) {
        results.push({ ...session });
      }
    }
    return results;
  }

  async recordFailedOtpAttempt(publicToken: string, now: number): Promise<FailedOtpResult> {
    const session = await this.findByPublicToken(publicToken);
    if (!session) {
      return { session: null, isLocked: false, attemptsRemaining: 0 };
    }

    // If already expired or terminal
    if (now > session.expiresAt || session.status === "expired") {
      const updated: ScanSession = { ...session, status: "expired", updatedAt: now };
      this.sessions.set(session.id, updated);
      return { session: updated, isLocked: false, attemptsRemaining: 0 };
    }

    if (session.status === "locked") {
      return { session, isLocked: true, attemptsRemaining: 0 };
    }

    const nextAttempts = session.otpAttempts + 1;
    const isLocked = nextAttempts >= MAX_OTP_ATTEMPTS;
    const attemptsRemaining = Math.max(0, MAX_OTP_ATTEMPTS - nextAttempts);

    const updated: ScanSession = {
      ...session,
      otpAttempts: nextAttempts,
      status: isLocked ? "locked" : session.status,
      updatedAt: now,
    };
    this.sessions.set(session.id, updated);

    return { session: updated, isLocked, attemptsRemaining };
  }

  /**
   * Atomic CAS: Only transitions if session is in 'created' state and not expired.
   * Immediately clears otpHash and otpSalt for security.
   */
  async authenticateSession(
    publicToken: string,
    recipientTokenHash: string,
    now: number,
  ): Promise<ScanSession | null> {
    const session = await this.findByPublicToken(publicToken);
    if (!session) {
      return null;
    }

    // Atomic pre-conditions
    if (
      session.status !== "created" ||
      now > session.expiresAt ||
      session.otpAttempts >= MAX_OTP_ATTEMPTS
    ) {
      return null;
    }

    const activeScanExpiresAt = Math.min(session.expiresAt, now + ACTIVE_SCAN_TTL_MS);

    const updated: ScanSession = {
      ...session,
      status: "authenticated",
      recipientTokenHash,
      otpHash: null,
      otpSalt: null,
      activeScanExpiresAt,
      updatedAt: now,
    };
    this.sessions.set(session.id, updated);
    return { ...updated };
  }

  async markUploading(sessionId: string, now: number): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.status !== "authenticated" && session.status !== "uploading") {
      return false;
    }

    if (now > session.expiresAt || (session.activeScanExpiresAt && now > session.activeScanExpiresAt)) {
      return false;
    }

    if (session.status === "authenticated") {
      this.sessions.set(sessionId, {
        ...session,
        status: "uploading",
        updatedAt: now,
      });
    }
    return true;
  }

  async addUploadedPage(page: UploadedPageRecord): Promise<AddPageResult> {
    const session = this.sessions.get(page.sessionId);
    if (!session) {
      return { success: false, isDuplicate: false, conflict: false };
    }

    if (session.status !== "authenticated" && session.status !== "uploading") {
      return { success: false, isDuplicate: false, conflict: false };
    }

    const sessionPages = this.pages.get(page.sessionId) ?? [];
    const existing = sessionPages.find((p) => p.id === page.id);

    if (existing) {
      if (existing.sha256Checksum === page.sha256Checksum) {
        return { success: true, isDuplicate: true, conflict: false };
      }
      return { success: false, isDuplicate: false, conflict: true };
    }

    const existingPageNum = sessionPages.find((p) => p.pageNumber === page.pageNumber);
    if (existingPageNum && existingPageNum.id !== page.id) {
      return { success: false, isDuplicate: false, conflict: true };
    }

    sessionPages.push({ ...page });
    this.pages.set(page.sessionId, sessionPages);

    if (session.status === "authenticated") {
      this.sessions.set(session.id, {
        ...session,
        status: "uploading",
        updatedAt: page.createdAt,
      });
    }

    return { success: true, isDuplicate: false, conflict: false };
  }

  async getPagesForSession(sessionId: string): Promise<readonly UploadedPageRecord[]> {
    const sessionPages = this.pages.get(sessionId) ?? [];
    return sessionPages.map((p) => ({ ...p })).sort((a, b) => a.pageNumber - b.pageNumber);
  }

  /**
   * Atomic CAS: Transitions from 'uploading' to 'completed'.
   * Wipes recipientTokenHash so upload bearer token is permanently revoked.
   */
  async completeSession(sessionId: string, pageCount: number, now: number): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.status !== "uploading") {
      return false;
    }

    if (now > session.expiresAt || (session.activeScanExpiresAt && now > session.activeScanExpiresAt)) {
      return false;
    }

    this.sessions.set(sessionId, {
      ...session,
      status: "completed",
      recipientTokenHash: null,
      completedAt: now,
      updatedAt: now,
    });
    return true;
  }

  async getCompletedDocument(sessionId: string): Promise<UploadedDocumentRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "completed") {
      return null;
    }

    const sessionPages = await this.getPagesForSession(sessionId);
    return {
      id: `doc_${session.id}`,
      sessionId: session.id,
      ownerId: session.ownerId,
      pageCount: sessionPages.length,
      pages: sessionPages,
      createdAt: session.createdAt,
      completedAt: session.completedAt ?? session.updatedAt,
    };
  }
}

/**
 * Production implementation backed by Supabase Postgres REST API.
 * Uses native fetch with service role key, maintaining zero new npm dependencies.
 */
export class SupabaseScanSessionRepository implements ScanSessionRepository {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.baseUrl = supabaseUrl.replace(/\/$/, "");
    this.serviceRoleKey = serviceRoleKey;
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      Prefer: "return=representation",
    };
  }

  async createSession(session: ScanSession): Promise<ScanSession> {
    const res = await fetch(`${this.baseUrl}/rest/v1/scan_sessions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        id: session.id,
        owner_id: session.ownerId,
        public_token: session.publicToken,
        title: session.title,
        status: session.status,
        otp_hash: session.otpHash,
        otp_salt: session.otpSalt,
        otp_attempts: session.otpAttempts,
        max_otp_attempts: session.maxOtpAttempts,
        recipient_token_hash: session.recipientTokenHash,
        expires_at: session.expiresAt,
        active_scan_expires_at: session.activeScanExpiresAt,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
        completed_at: session.completedAt,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to insert session: ${res.statusText}`);
    }
    return session;
  }

  async findByPublicToken(publicToken: string): Promise<ScanSession | null> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/scan_sessions?public_token=eq.${encodeURIComponent(publicToken)}&limit=1`,
      {
        headers: this.headers(),
      },
    );
    if (!res.ok) {
      return null;
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.mapSessionRow(rows[0]);
  }

  async findById(id: string): Promise<ScanSession | null> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/scan_sessions?id=eq.${encodeURIComponent(id)}&limit=1`,
      {
        headers: this.headers(),
      },
    );
    if (!res.ok) {
      return null;
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.mapSessionRow(rows[0]);
  }

  async findByOwnerId(ownerId: string): Promise<readonly ScanSession[]> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/scan_sessions?owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc`,
      {
        headers: this.headers(),
      },
    );
    if (!res.ok) {
      return [];
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return (rows || []).map((r) => this.mapSessionRow(r));
  }

  async recordFailedOtpAttempt(publicToken: string, now: number): Promise<FailedOtpResult> {
    const session = await this.findByPublicToken(publicToken);
    if (!session) {
      return { session: null, isLocked: false, attemptsRemaining: 0 };
    }

    if (now > session.expiresAt) {
      await fetch(
        `${this.baseUrl}/rest/v1/scan_sessions?id=eq.${encodeURIComponent(session.id)}`,
        {
          method: "PATCH",
          headers: this.headers(),
          body: JSON.stringify({ status: "expired", updated_at: now }),
        },
      );
      return {
        session: { ...session, status: "expired" },
        isLocked: false,
        attemptsRemaining: 0,
      };
    }

    const nextAttempts = session.otpAttempts + 1;
    const isLocked = nextAttempts >= MAX_OTP_ATTEMPTS;
    const attemptsRemaining = Math.max(0, MAX_OTP_ATTEMPTS - nextAttempts);

    const patchBody: Record<string, unknown> = {
      otp_attempts: nextAttempts,
      updated_at: now,
    };
    if (isLocked) {
      patchBody.status = "locked";
    }

    const res = await fetch(
      `${this.baseUrl}/rest/v1/scan_sessions?id=eq.${encodeURIComponent(session.id)}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify(patchBody),
      },
    );

    if (!res.ok) {
      return { session, isLocked, attemptsRemaining };
    }

    const updatedRows = (await res.json()) as Array<Record<string, unknown>>;
    const updated = updatedRows?.[0] ? this.mapSessionRow(updatedRows[0]) : session;
    return { session: updated, isLocked, attemptsRemaining };
  }

  async authenticateSession(
    publicToken: string,
    recipientTokenHash: string,
    now: number,
  ): Promise<ScanSession | null> {
    const activeScanExpiresAt = now + ACTIVE_SCAN_TTL_MS;

    // Atomic CAS: Only update if status=created and expires_at > now and otp_attempts < 5
    const res = await fetch(
      `${this.baseUrl}/rest/v1/scan_sessions?public_token=eq.${encodeURIComponent(publicToken)}&status=eq.created&expires_at=gt.${now}&otp_attempts=lt.${MAX_OTP_ATTEMPTS}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({
          status: "authenticated",
          recipient_token_hash: recipientTokenHash,
          otp_hash: null,
          otp_salt: null,
          active_scan_expires_at: activeScanExpiresAt,
          updated_at: now,
        }),
      },
    );

    if (!res.ok) {
      return null;
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.mapSessionRow(rows[0]);
  }

  async markUploading(sessionId: string, now: number): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/scan_sessions?id=eq.${encodeURIComponent(sessionId)}&status=eq.authenticated&expires_at=gt.${now}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({
          status: "uploading",
          updated_at: now,
        }),
      },
    );
    if (!res.ok) {
      return false;
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return (rows && rows.length > 0);
  }

  async addUploadedPage(page: UploadedPageRecord): Promise<AddPageResult> {
    // Check if existing page exists
    const checkRes = await fetch(
      `${this.baseUrl}/rest/v1/uploaded_pages?session_id=eq.${encodeURIComponent(page.sessionId)}&id=eq.${encodeURIComponent(page.id)}&limit=1`,
      { headers: this.headers() },
    );
    if (checkRes.ok) {
      const existing = (await checkRes.json()) as Array<Record<string, unknown>>;
      if (existing && existing.length > 0) {
        if (existing[0].sha256_checksum === page.sha256Checksum) {
          return { success: true, isDuplicate: true, conflict: false };
        }
        return { success: false, isDuplicate: false, conflict: true };
      }
    }

    const insertRes = await fetch(`${this.baseUrl}/rest/v1/uploaded_pages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        id: page.id,
        session_id: page.sessionId,
        page_number: page.pageNumber,
        storage_path: page.storagePath,
        mime_type: page.mimeType,
        byte_size: page.byteSize,
        sha256_checksum: page.sha256Checksum,
        correction_fallback: page.correctionFallback,
        created_at: page.createdAt,
      }),
    });

    if (!insertRes.ok) {
      return { success: false, isDuplicate: false, conflict: false };
    }

    await this.markUploading(page.sessionId, page.createdAt);
    return { success: true, isDuplicate: false, conflict: false };
  }

  async getPagesForSession(sessionId: string): Promise<readonly UploadedPageRecord[]> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/uploaded_pages?session_id=eq.${encodeURIComponent(sessionId)}&order=page_number.asc`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      return [];
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return (rows || []).map((r) => this.mapPageRow(r));
  }

  async completeSession(sessionId: string, pageCount: number, now: number): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/scan_sessions?id=eq.${encodeURIComponent(sessionId)}&status=eq.uploading&expires_at=gt.${now}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({
          status: "completed",
          recipient_token_hash: null,
          completed_at: now,
          updated_at: now,
        }),
      },
    );
    if (!res.ok) {
      return false;
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return (rows && rows.length > 0);
  }

  async getCompletedDocument(sessionId: string): Promise<UploadedDocumentRecord | null> {
    const session = await this.findById(sessionId);
    if (!session || session.status !== "completed") {
      return null;
    }
    const pages = await this.getPagesForSession(sessionId);
    return {
      id: `doc_${session.id}`,
      sessionId: session.id,
      ownerId: session.ownerId,
      pageCount: pages.length,
      pages,
      createdAt: session.createdAt,
      completedAt: session.completedAt ?? session.updatedAt,
    };
  }

  private mapSessionRow(r: Record<string, unknown>): ScanSession {
    return {
      id: String(r.id),
      ownerId: String(r.owner_id),
      publicToken: String(r.public_token),
      title: r.title ? String(r.title) : undefined,
      status: String(r.status) as ScanSession["status"],
      otpHash: r.otp_hash ? String(r.otp_hash) : null,
      otpSalt: r.otp_salt ? String(r.otp_salt) : null,
      otpAttempts: Number(r.otp_attempts || 0),
      maxOtpAttempts: Number(r.max_otp_attempts || MAX_OTP_ATTEMPTS),
      recipientTokenHash: r.recipient_token_hash ? String(r.recipient_token_hash) : null,
      expiresAt: Number(r.expires_at),
      activeScanExpiresAt: r.active_scan_expires_at ? Number(r.active_scan_expires_at) : null,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      completedAt: r.completed_at ? Number(r.completed_at) : null,
    };
  }

  private mapPageRow(r: Record<string, unknown>): UploadedPageRecord {
    return {
      id: String(r.id),
      sessionId: String(r.session_id),
      pageNumber: Number(r.page_number),
      storagePath: String(r.storage_path),
      mimeType: "image/jpeg",
      byteSize: Number(r.byte_size),
      sha256Checksum: String(r.sha256_checksum),
      correctionFallback: Boolean(r.correction_fallback),
      createdAt: Number(r.created_at),
    };
  }
}

let repositoryInstance: ScanSessionRepository | null = null;

/**
 * Returns the singleton repository instance based on environment configuration.
 */
export function getSessionRepository(): ScanSessionRepository {
  if (repositoryInstance) {
    return repositoryInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    repositoryInstance = new SupabaseScanSessionRepository(supabaseUrl, serviceRoleKey);
  } else {
    repositoryInstance = new InMemoryScanSessionRepository();
  }

  return repositoryInstance;
}

/**
 * Helper to override repository in unit tests.
 */
export function setSessionRepositoryForTest(repo: ScanSessionRepository | null): void {
  repositoryInstance = repo;
}
