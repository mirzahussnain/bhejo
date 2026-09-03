import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryScanSessionRepository,
} from "./session-repository.ts";
import {
  LINK_TTL_MS,
  MAX_OTP_ATTEMPTS,
  type ScanSession,
  type UploadedPageRecord,
} from "../../types/remote-scan.ts";
import { generateOtp, generateOtpSalt, hashOtp } from "./otp.ts";
import { generatePublicToken, generateRecipientToken, generateSessionId, hashToken } from "./token.ts";

async function createSampleSession(
  repo: InMemoryScanSessionRepository,
  overrides?: Partial<ScanSession>,
): Promise<{ session: ScanSession; rawOtp: string }> {
  const rawOtp = generateOtp();
  const salt = generateOtpSalt();
  const otpHash = await hashOtp(rawOtp, salt);
  const now = Date.now();

  const session: ScanSession = {
    id: generateSessionId(),
    ownerId: "owner_123",
    publicToken: generatePublicToken(),
    title: "Passport Scan",
    status: "created",
    otpHash,
    otpSalt: salt,
    otpAttempts: 0,
    maxOtpAttempts: MAX_OTP_ATTEMPTS,
    recipientTokenHash: null,
    expiresAt: now + LINK_TTL_MS,
    activeScanExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  };

  await repo.createSession(session);
  return { session, rawOtp };
}

test("createSession and findByPublicToken retrieve session correctly", async () => {
  const repo = new InMemoryScanSessionRepository();
  const { session } = await createSampleSession(repo);

  const found = await repo.findByPublicToken(session.publicToken);
  assert.ok(found);
  assert.strictEqual(found.id, session.id);
  assert.strictEqual(found.status, "created");
  assert.strictEqual(found.title, "Passport Scan");
});

test("findByOwnerId returns all sessions belonging to owner", async () => {
  const repo = new InMemoryScanSessionRepository();
  await createSampleSession(repo, { ownerId: "owner_A" });
  await createSampleSession(repo, { ownerId: "owner_A" });
  await createSampleSession(repo, { ownerId: "owner_B" });

  const ownerASessions = await repo.findByOwnerId("owner_A");
  assert.strictEqual(ownerASessions.length, 2);

  const ownerBSessions = await repo.findByOwnerId("owner_B");
  assert.strictEqual(ownerBSessions.length, 1);
});

test("recordFailedOtpAttempt increments count and locks on 5th attempt", async () => {
  const repo = new InMemoryScanSessionRepository();
  const { session } = await createSampleSession(repo);
  const now = Date.now();

  for (let i = 1; i <= 4; i++) {
    const result = await repo.recordFailedOtpAttempt(session.publicToken, now);
    assert.strictEqual(result.isLocked, false);
    assert.strictEqual(result.attemptsRemaining, MAX_OTP_ATTEMPTS - i);
    assert.strictEqual(result.session?.otpAttempts, i);
    assert.strictEqual(result.session?.status, "created");
  }

  // 5th failed attempt -> locks session
  const fifthResult = await repo.recordFailedOtpAttempt(session.publicToken, now);
  assert.strictEqual(fifthResult.isLocked, true);
  assert.strictEqual(fifthResult.attemptsRemaining, 0);
  assert.strictEqual(fifthResult.session?.status, "locked");

  // Subsequent attempt remains locked
  const sixthResult = await repo.recordFailedOtpAttempt(session.publicToken, now);
  assert.strictEqual(sixthResult.isLocked, true);
  assert.strictEqual(sixthResult.attemptsRemaining, 0);
});

test("authenticateSession atomically authenticates and wipes OTP credentials", async () => {
  const repo = new InMemoryScanSessionRepository();
  const { session } = await createSampleSession(repo);
  const recipientToken = generateRecipientToken();
  const recipientTokenHash = hashToken(recipientToken);
  const now = Date.now();

  const authResult = await repo.authenticateSession(
    session.publicToken,
    recipientTokenHash,
    now,
  );

  assert.ok(authResult);
  assert.strictEqual(authResult.status, "authenticated");
  assert.strictEqual(authResult.recipientTokenHash, recipientTokenHash);
  assert.strictEqual(authResult.otpHash, null);
  assert.strictEqual(authResult.otpSalt, null);
  assert.ok(authResult.activeScanExpiresAt !== null);

  // Second concurrent authentication attempt fails (CAS violation)
  const concurrentResult = await repo.authenticateSession(
    session.publicToken,
    hashToken(generateRecipientToken()),
    now,
  );
  assert.strictEqual(concurrentResult, null);
});

test("authenticateSession rejects locked or expired session", async () => {
  const repo = new InMemoryScanSessionRepository();
  const now = Date.now();

  // Expired session
  const { session: expiredSession } = await createSampleSession(repo, {
    expiresAt: now - 1000,
  });
  const res1 = await repo.authenticateSession(
    expiredSession.publicToken,
    hashToken("token"),
    now,
  );
  assert.strictEqual(res1, null);

  // Locked session
  const { session: lockedSession } = await createSampleSession(repo, {
    status: "locked",
    otpAttempts: 5,
  });
  const res2 = await repo.authenticateSession(
    lockedSession.publicToken,
    hashToken("token"),
    now,
  );
  assert.strictEqual(res2, null);
});

test("addUploadedPage handles new upload, idempotent retry, and conflict", async () => {
  const repo = new InMemoryScanSessionRepository();
  const { session } = await createSampleSession(repo);
  const recipientTokenHash = hashToken(generateRecipientToken());
  const now = Date.now();

  await repo.authenticateSession(session.publicToken, recipientTokenHash, now);

  const page1: UploadedPageRecord = {
    id: "page_101",
    sessionId: session.id,
    pageNumber: 1,
    storagePath: `sessions/${session.id}/page_101.jpg`,
    mimeType: "image/jpeg",
    byteSize: 1024,
    sha256Checksum: "checksum_aaa_111",
    correctionFallback: false,
    createdAt: now,
  };

  // 1. Initial upload succeeds
  const res1 = await repo.addUploadedPage(page1);
  assert.deepStrictEqual(res1, { success: true, isDuplicate: false, conflict: false });

  // Session state transitioned to 'uploading'
  const updatedSession = await repo.findById(session.id);
  assert.strictEqual(updatedSession?.status, "uploading");

  // 2. Idempotent retry with same pageId and same checksum succeeds
  const res2 = await repo.addUploadedPage(page1);
  assert.deepStrictEqual(res2, { success: true, isDuplicate: true, conflict: false });

  // 3. Retry with same pageId but differing checksum fails as conflict
  const conflictingPage: UploadedPageRecord = {
    ...page1,
    sha256Checksum: "different_tampered_checksum",
  };
  const res3 = await repo.addUploadedPage(conflictingPage);
  assert.deepStrictEqual(res3, { success: false, isDuplicate: false, conflict: true });
});

test("completeSession atomically finalizes and revokes recipient token", async () => {
  const repo = new InMemoryScanSessionRepository();
  const { session } = await createSampleSession(repo);
  const recipientTokenHash = hashToken(generateRecipientToken());
  const now = Date.now();

  await repo.authenticateSession(session.publicToken, recipientTokenHash, now);

  const page: UploadedPageRecord = {
    id: "page_201",
    sessionId: session.id,
    pageNumber: 1,
    storagePath: `sessions/${session.id}/page_201.jpg`,
    mimeType: "image/jpeg",
    byteSize: 2048,
    sha256Checksum: "checksum_201",
    correctionFallback: false,
    createdAt: now,
  };
  await repo.addUploadedPage(page);

  // Complete session
  const completed = await repo.completeSession(session.id, 1, now + 100);
  assert.strictEqual(completed, true);

  const finalizedSession = await repo.findById(session.id);
  assert.strictEqual(finalizedSession?.status, "completed");
  assert.strictEqual(finalizedSession?.recipientTokenHash, null); // Revoked
  assert.strictEqual(finalizedSession?.completedAt, now + 100);

  // Further page upload to completed session is rejected
  const postCompletePage: UploadedPageRecord = {
    ...page,
    id: "page_202",
    pageNumber: 2,
  };
  const postCompleteResult = await repo.addUploadedPage(postCompletePage);
  assert.strictEqual(postCompleteResult.success, false);

  // Document retrieval for owner
  const doc = await repo.getCompletedDocument(session.id);
  assert.ok(doc);
  assert.strictEqual(doc.sessionId, session.id);
  assert.strictEqual(doc.ownerId, session.ownerId);
  assert.strictEqual(doc.pageCount, 1);
  assert.strictEqual(doc.pages.length, 1);
});
