import test from "node:test";
import assert from "node:assert/strict";
import {
  createOwnerSession,
  finalizeSession,
  getOwnerDocument,
  getOwnerPageBinary,
  getPublicSessionInfo,
  processPageUpload,
  verifySessionOtp,
} from "./session-service.ts";
import { getAuthenticatedOwner } from "../auth/owner-context.ts";
import { setSessionRepositoryForTest, InMemoryScanSessionRepository } from "./session-repository.ts";
import { setStorageServiceForTest, InMemoryStorageService } from "./storage-service.ts";
import { computeChecksum } from "./token.ts";


function setupTestEnvironment() {
  const repo = new InMemoryScanSessionRepository();
  const storage = new InMemoryStorageService();
  setSessionRepositoryForTest(repo);
  setStorageServiceForTest(storage);
  return { repo, storage };
}

// Minimal valid 1x1 JPEG bytes for testing
const SAMPLE_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0x7f, 0x00, 0xff, 0xd9,
]);

test("Full End-to-End API lifecycle test", async () => {
  setupTestEnvironment();

  // 1. Owner creates session
  const sessionData = await createOwnerSession("owner_alice", "Alice Passport");
  assert.strictEqual(sessionData.status, "created");
  assert.ok(sessionData.publicToken);
  assert.ok(sessionData.otp);

  const publicToken = sessionData.publicToken;
  const rawOtp = sessionData.otp;
  const sessionId = sessionData.id;

  // 2. Recipient opens public link
  const getRes = await getPublicSessionInfo(publicToken);
  assert.strictEqual(getRes.status, 200);
  assert.ok("status" in getRes.body);
  assert.strictEqual(getRes.body.status, "created");
  assert.strictEqual(getRes.body.title, "Alice Passport");

  // 3. Recipient enters incorrect OTP
  const wrongOtpRes = await verifySessionOtp(publicToken, "000000");
  assert.strictEqual(wrongOtpRes.status, 401);
  assert.strictEqual(wrongOtpRes.body.attemptsRemaining, 4);

  // 4. Recipient enters correct OTP
  const correctOtpRes = await verifySessionOtp(publicToken, rawOtp);
  assert.strictEqual(correctOtpRes.status, 200);
  assert.strictEqual(correctOtpRes.body.success, true);
  assert.ok(correctOtpRes.body.recipientToken);

  const recipientToken = correctOtpRes.body.recipientToken;

  // 5. Upload Page 1
  const checksum1 = computeChecksum(SAMPLE_JPEG_BYTES);
  const uploadRes1 = await processPageUpload({
    publicToken,
    recipientToken,
    pageId: "page_1",
    pageNumber: 1,
    checksum: checksum1,
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(uploadRes1.status, 200);
  assert.strictEqual(uploadRes1.body.status, "uploaded");

  // 6. Test Idempotent Retry of Page 1
  const retryRes = await processPageUpload({
    publicToken,
    recipientToken,
    pageId: "page_1",
    pageNumber: 1,
    checksum: checksum1,
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(retryRes.status, 200);
  assert.strictEqual(retryRes.body.status, "already_uploaded");

  // 7. Test Checksum Mismatch rejection
  const badChecksumRes = await processPageUpload({
    publicToken,
    recipientToken,
    pageId: "page_2",
    pageNumber: 2,
    checksum: "0000000000000000000000000000000000000000000000000000000000000000",
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(badChecksumRes.status, 400);

  // 8. Test Invalid File Format (non-JPEG)
  const nonJpegBytes = Buffer.from("this is a text file not jpeg");
  const nonJpegRes = await processPageUpload({
    publicToken,
    recipientToken,
    pageId: "page_text",
    pageNumber: 2,
    checksum: computeChecksum(nonJpegBytes),
    correctionFallback: false,
    fileBuffer: nonJpegBytes,
  });
  assert.strictEqual(nonJpegRes.status, 415);

  // 9. Finalize Complete with valid Page 1
  const completeRes = await finalizeSession({
    publicToken,
    recipientToken,
    clientPageIds: ["page_1"],
  });
  assert.strictEqual(completeRes.status, 200);
  assert.ok("pageCount" in completeRes.body);
  assert.strictEqual(completeRes.body.pageCount, 1);

  // 10. Post-completion mutation is rejected (token revoked)
  const postCompleteRes = await processPageUpload({
    publicToken,
    recipientToken,
    pageId: "page_1",
    pageNumber: 1,
    checksum: checksum1,
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(postCompleteRes.status, 401);

  // 11. Owner B attempts to access Owner A's completed document (Forbidden)
  const ownerBRes = await getOwnerDocument("owner_bob", sessionId);
  assert.strictEqual(ownerBRes.status, 403);

  // 12. Owner A retrieves completed document (Authorized)
  const ownerARes = await getOwnerDocument("owner_alice", sessionId);
  assert.strictEqual(ownerARes.status, 200);
  assert.ok("document" in ownerARes.body);
  assert.strictEqual(ownerARes.body.document.pageCount, 1);
  assert.strictEqual(ownerARes.body.document.pages[0].id, "page_1");

  // 13. Owner A retrieves page image binary
  const pageImageRes = await getOwnerPageBinary("owner_alice", sessionId, "page_1");
  assert.strictEqual(pageImageRes.status, 200);
  assert.ok(pageImageRes.buffer);
  assert.strictEqual(pageImageRes.buffer.length, SAMPLE_JPEG_BYTES.length);
});

test("Security Audit: Public endpoint strictly excludes all secrets", async () => {
  setupTestEnvironment();
  const sessionData = await createOwnerSession("owner_sec", "Confidential Scan");
  const getRes = await getPublicSessionInfo(sessionData.publicToken);
  assert.strictEqual(getRes.status, 200);

  const body = getRes.body as Record<string, unknown>;
  // Public fields allowed
  assert.ok("status" in body);
  assert.ok("title" in body);
  assert.ok("expiresAt" in body);

  // Strictly prohibited secret fields
  assert.strictEqual(body.otp, undefined);
  assert.strictEqual(body.otpHash, undefined);
  assert.strictEqual(body.otpSalt, undefined);
  assert.strictEqual(body.recipientToken, undefined);
  assert.strictEqual(body.recipientTokenHash, undefined);
  assert.strictEqual(body.ownerId, undefined);
  assert.strictEqual(body.id, undefined);
  assert.strictEqual(body.storagePath, undefined);
  assert.strictEqual(body.pages, undefined);
});

test("Security Audit: Owner A vs Owner B isolation on document and page binary", async () => {
  setupTestEnvironment();
  const session = await createOwnerSession("owner_A", "Owner A Doc");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  assert.strictEqual(authRes.status, 200);
  const recipientToken = authRes.body.recipientToken!;

  // Upload page 1
  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_A_1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  // Finalize
  await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_A_1"],
  });

  // Owner B cannot access Owner A document metadata
  const docResB = await getOwnerDocument("owner_B", session.id);
  assert.strictEqual(docResB.status, 403);

  // Owner B cannot access Owner A page image binary
  const pageResB = await getOwnerPageBinary("owner_B", session.id, "page_A_1");
  assert.strictEqual(pageResB.status, 403);

  // Owner A can access both
  const docResA = await getOwnerDocument("owner_A", session.id);
  assert.strictEqual(docResA.status, 200);
  const pageResA = await getOwnerPageBinary("owner_A", session.id, "page_A_1");
  assert.strictEqual(pageResA.status, 200);
});

test("Security Audit: Production auth fallback cannot be bypassed via X-Test-Owner-Id", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    const request = new Request("http://localhost/api/sessions", {
      headers: { "X-Test-Owner-Id": "attacker_impersonated_id" },
    });
    const authResult = await getAuthenticatedOwner(request);
    // In production, X-Test-Owner-Id MUST be ignored
    assert.strictEqual(authResult, null);
  } finally {
    env.NODE_ENV = originalEnv;
  }
});

test("Security Audit: Enforces 2-hour active scan window", async () => {
  const { repo } = setupTestEnvironment();
  const session = await createOwnerSession("owner_active_ttl", "Active TTL Scan");
  const now = Date.now();

  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  assert.strictEqual(authRes.status, 200);
  const recipientToken = authRes.body.recipientToken!;

  // Fast-forward past 2-hour active scan expiration
  // Manually update stored session to simulate elapsed time
  const stored = await repo.findById(session.id);
  assert.ok(stored);
  await repo.createSession({
    ...stored,
    activeScanExpiresAt: now - 10, // already expired
  });

  // Upload after active scan expiry is rejected with 410
  const uploadRes = await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_late",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(uploadRes.status, 410);

  // Public status query reports expired
  const publicRes = await getPublicSessionInfo(session.publicToken);
  assert.strictEqual(publicRes.status, 200);
  assert.strictEqual((publicRes.body as { status: string }).status, "expired");
});

test("Security Audit: Cross-session recipient token is rejected", async () => {
  setupTestEnvironment();
  // Create Session 1 and Session 2
  const session1 = await createOwnerSession("owner_1", "Session 1");
  const session2 = await createOwnerSession("owner_2", "Session 2");

  const auth1 = await verifySessionOtp(session1.publicToken, session1.otp);
  const auth2 = await verifySessionOtp(session2.publicToken, session2.otp);

  const token1 = auth1.body.recipientToken!;
  const token2 = auth2.body.recipientToken!;

  // Use Token 1 against Session 2 -> 401 Unauthorized
  const crossUploadRes = await processPageUpload({
    publicToken: session2.publicToken,
    recipientToken: token1,
    pageId: "page_cross",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(crossUploadRes.status, 401);

  // Use Token 2 against Session 2 -> 200 OK
  const validUploadRes = await processPageUpload({
    publicToken: session2.publicToken,
    recipientToken: token2,
    pageId: "page_cross",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(validUploadRes.status, 200);
});

test("Security Audit: Completed session cannot be resurrected or mutated", async () => {
  setupTestEnvironment();
  const session = await createOwnerSession("owner_immut", "Immutable Doc");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  const recipientToken = authRes.body.recipientToken!;

  // Upload and complete
  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_immut_1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_immut_1"],
  });

  // Re-authenticating with OTP on completed session fails with 409
  const reAuthRes = await verifySessionOtp(session.publicToken, session.otp);
  assert.strictEqual(reAuthRes.status, 409);
  assert.strictEqual(reAuthRes.body.error, "already_completed");

  // Re-completing fails with 409
  const reCompleteRes = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_immut_1"],
  });
  // Token was revoked on complete -> 401
  assert.strictEqual(reCompleteRes.status, 401);
});

test("Security Audit: Concurrent OTP verification results in exactly ONE winner", async () => {
  setupTestEnvironment();
  const session = await createOwnerSession("owner_race", "Race Session");

  // Two simultaneous OTP verification calls
  const [res1, res2] = await Promise.all([
    verifySessionOtp(session.publicToken, session.otp),
    verifySessionOtp(session.publicToken, session.otp),
  ]);

  // Exactly one must succeed with 200, the other must fail with 409 already_authenticated
  const statuses = [res1.status, res2.status].sort();
  assert.deepStrictEqual(statuses, [200, 409]);

  const winner = res1.status === 200 ? res1 : res2;
  const loser = res1.status === 409 ? res1 : res2;

  assert.strictEqual(winner.body.success, true);
  assert.ok(winner.body.recipientToken);
  assert.strictEqual(loser.body.success, false);
  assert.strictEqual(loser.body.error, "already_authenticated");
});

test("Security Audit: Concurrent finalization results in exactly ONE successful complete", async () => {
  setupTestEnvironment();
  const session = await createOwnerSession("owner_final_race", "Final Race");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  const recipientToken = authRes.body.recipientToken!;

  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_fr_1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  // Two simultaneous complete calls
  const [res1, res2] = await Promise.all([
    finalizeSession({
      publicToken: session.publicToken,
      recipientToken,
      clientPageIds: ["page_fr_1"],
    }),
    finalizeSession({
      publicToken: session.publicToken,
      recipientToken,
      clientPageIds: ["page_fr_1"],
    }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  // One must succeed (200), the other must fail (409 or 401 because token revoked)
  assert.strictEqual(statuses[0], 200);
  assert.ok(statuses[1] === 409 || statuses[1] === 401);
});

test("Security Audit: Page number and ordering security", async () => {
  setupTestEnvironment();
  const session = await createOwnerSession("owner_order", "Order Test");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  const recipientToken = authRes.body.recipientToken!;

  // 1. Upload page 1
  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_o1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  // 2. Reject uploading another page with duplicate pageNumber 1
  const dupPageNumRes = await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_o_duplicate_num",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });
  assert.strictEqual(dupPageNumRes.status, 409);

  // 3. Upload page 3 (creating a gap: 1, 3 with missing 2)
  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_o3",
    pageNumber: 3,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  // Finalizing with gap [page_o1, page_o3] is rejected
  const gapRes = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_o1", "page_o3"],
  });
  assert.strictEqual(gapRes.status, 400);
  assert.match((gapRes.body as { error: string }).error, /Non-contiguous page numbers detected/);
});

test("Security Audit: Missing storage file is detected during finalization", async () => {
  const { storage } = setupTestEnvironment();
  const session = await createOwnerSession("owner_storage_fail", "Storage Fail Test");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  const recipientToken = authRes.body.recipientToken!;

  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_sf_1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  // Simulate storage failure/deletion before finalization
  await storage.deleteSessionPages(session.id);

  // Finalization must detect that storage file is missing and reject with 500
  const finalRes = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_sf_1"],
  });
  assert.strictEqual(finalRes.status, 500);
  assert.match((finalRes.body as { error: string }).error, /Storage file for page 1 is missing/);
});
