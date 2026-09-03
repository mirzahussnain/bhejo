import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelOwnerSession,
  createOwnerSession,
  finalizeSession,
  getOwnerDocument,
  getOwnerNotifications,
  getOwnerPageBinary,
  getOwnerSessionDetail,
  getOwnerSessionHistory,
  getPublicSessionInfo,
  markAllNotificationsAsRead,
  markNotificationAsRead,
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

test("Phase 3B: Configurable expiry options validation and persistence", async () => {
  setupTestEnvironment();
  const now = Date.now();

  // 1. Default expiry is 24h
  const defaultSession = await createOwnerSession("owner_cfg", "Default Expiry");
  assert.strictEqual(defaultSession.configuredExpiryHours, 24);
  const diffDefault = defaultSession.expiresAt - now;
  assert.ok(diffDefault >= 23 * 3600 * 1000 && diffDefault <= 25 * 3600 * 1000);

  // 2. Explicit 6h expiry
  const session6h = await createOwnerSession("owner_cfg", "6h Expiry", 6);
  assert.strictEqual(session6h.configuredExpiryHours, 6);
  const diff6h = session6h.expiresAt - now;
  assert.ok(diff6h >= 5.9 * 3600 * 1000 && diff6h <= 6.1 * 3600 * 1000);

  // 3. Explicit 72h expiry
  const session72h = await createOwnerSession("owner_cfg", "72h Expiry", 72);
  assert.strictEqual(session72h.configuredExpiryHours, 72);
  const diff72h = session72h.expiresAt - now;
  assert.ok(diff72h >= 71.9 * 3600 * 1000 && diff72h <= 72.1 * 3600 * 1000);

  // 4. Invalid expiry falls back to 24h
  const sessionInvalid = await createOwnerSession("owner_cfg", "Invalid Expiry", 999 as unknown as number);
  assert.strictEqual(sessionInvalid.configuredExpiryHours, 24);
});

test("Phase 3B: Single device enforcement - Device A authenticates, Device B is rejected", async () => {
  setupTestEnvironment();

  const session = await createOwnerSession("owner_devices", "Passport");
  const uaDeviceA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1";
  const ipDeviceA = "82.165.20.12";

  // Device A enters OTP -> succeeds
  const authResA = await verifySessionOtp(session.publicToken, session.otp, uaDeviceA, ipDeviceA);
  assert.strictEqual(authResA.status, 200);
  assert.strictEqual(authResA.body.success, true);
  assert.ok(authResA.body.recipientToken);

  // Device B attempts to enter OTP on same session -> rejected with already_authenticated
  const uaDeviceB = "Mozilla/5.0 (Linux; Android 15; Pixel 8) Chrome/130.0.0.0 Mobile Safari/537.36";
  const ipDeviceB = "90.120.40.50";

  const authResB = await verifySessionOtp(session.publicToken, session.otp, uaDeviceB, ipDeviceB);
  assert.strictEqual(authResB.status, 409);
  assert.strictEqual(authResB.body.success, false);
  assert.strictEqual(authResB.body.error, "already_authenticated");
  assert.strictEqual(authResB.body.recipientToken, undefined);
});

test("Phase 3B: Device metadata is captured and displayed in session detail", async () => {
  setupTestEnvironment();

  const session = await createOwnerSession("owner_meta", "Car Title");
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1";
  const ip = "82.165.20.12";

  await verifySessionOtp(session.publicToken, session.otp, ua, ip);

  const detailRes = await getOwnerSessionDetail("owner_meta", session.id);
  assert.strictEqual(detailRes.status, 200);
  assert.ok("session" in detailRes.body);

  const device = detailRes.body.connectedDevice;
  assert.ok(device);
  assert.strictEqual(device.deviceFamily, "iPhone");
  assert.strictEqual(device.browser, "Safari");
  assert.strictEqual(device.os, "iOS 18.1");
  assert.strictEqual(device.displayName, "iPhone · Safari");
  assert.strictEqual(device.ipAddress, "82.xxx.xxx.xxx");
});

test("Phase 3B: Owner session history retrieval and strict owner isolation", async () => {
  setupTestEnvironment();

  await createOwnerSession("owner_X", "X Doc 1");
  await createOwnerSession("owner_X", "X Doc 2");
  await createOwnerSession("owner_Y", "Y Doc 1");

  const histX = await getOwnerSessionHistory("owner_X");
  assert.strictEqual(histX.status, 200);
  assert.ok("sessions" in histX.body);
  assert.strictEqual(histX.body.sessions.length, 2);
  assert.strictEqual(histX.body.sessions.every((s) => s.title?.startsWith("X Doc")), true);

  const histY = await getOwnerSessionHistory("owner_Y");
  assert.strictEqual(histY.status, 200);
  assert.ok("sessions" in histY.body);
  assert.strictEqual(histY.body.sessions.length, 1);
  assert.strictEqual(histY.body.sessions[0].title, "Y Doc 1");

  // Owner Y cannot access detail of Owner X's session
  const xSessionId = histX.body.sessions[0].id;
  const forbiddenRes = await getOwnerSessionDetail("owner_Y", xSessionId);
  assert.strictEqual(forbiddenRes.status, 403);
});

test("Phase 3B: Persistent notifications created upon document completion and marked as read", async () => {
  setupTestEnvironment();

  const session = await createOwnerSession("owner_notif", "Utility Bill");
  const authRes = await verifySessionOtp(
    session.publicToken,
    session.otp,
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1",
    "82.165.20.12",
  );
  const recipientToken = authRes.body.recipientToken!;

  // Upload page 1
  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_notif_1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  // Finalize
  const finalizeRes = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_notif_1"],
  });
  assert.strictEqual(finalizeRes.status, 200);

  // Check owner notifications
  const notifRes = await getOwnerNotifications("owner_notif");
  assert.strictEqual(notifRes.status, 200);
  assert.ok("notifications" in notifRes.body);
  assert.strictEqual(notifRes.body.unreadCount, 1);
  assert.strictEqual(notifRes.body.notifications.length, 1);

  const notif = notifRes.body.notifications[0];
  assert.strictEqual(notif.title, "Document received");
  assert.strictEqual(notif.isRead, false);
  assert.strictEqual(notif.deviceDisplay, "iPhone · Safari");

  // Mark single as read
  const markRes = await markNotificationAsRead("owner_notif", notif.id);
  assert.strictEqual(markRes.status, 200);

  const updatedNotifRes = await getOwnerNotifications("owner_notif");
  assert.ok("unreadCount" in updatedNotifRes.body);
  assert.strictEqual(updatedNotifRes.body.unreadCount, 0);
  assert.strictEqual(updatedNotifRes.body.notifications[0].isRead, true);

  // Mark all as read
  const markAllRes = await markAllNotificationsAsRead("owner_notif");
  assert.strictEqual(markAllRes.status, 200);
});

test("Phase 3B: Activity timeline records session lifecycle events in order", async () => {
  setupTestEnvironment();

  const session = await createOwnerSession("owner_act", "Contract");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  const recipientToken = authRes.body.recipientToken!;

  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_act_1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_act_1"],
  });

  const detailRes = await getOwnerSessionDetail("owner_act", session.id);
  assert.strictEqual(detailRes.status, 200);
  assert.ok("activities" in detailRes.body);

  const types = detailRes.body.activities.map((a) => a.eventType);
  assert.ok(types.includes("created"));
  assert.ok(types.includes("otp_verified"));
  assert.ok(types.includes("device_connected"));
  assert.ok(types.includes("page_uploaded"));
  assert.ok(types.includes("document_completed"));
});

test("Phase 3B: Start new session workflow creates a brand new session and preserves completed session", async () => {
  setupTestEnvironment();

  // 1. Session 1 is completed
  const session1 = await createOwnerSession("owner_multiscan", "Doc A");
  const auth1 = await verifySessionOtp(session1.publicToken, session1.otp);
  const token1 = auth1.body.recipientToken!;

  await processPageUpload({
    publicToken: session1.publicToken,
    recipientToken: token1,
    pageId: "p1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  await finalizeSession({
    publicToken: session1.publicToken,
    recipientToken: token1,
    clientPageIds: ["p1"],
  });

  // 2. "Start new scan" creates a NEW independent session
  const session2 = await createOwnerSession("owner_multiscan", "Doc B");
  assert.notStrictEqual(session2.id, session1.id);
  assert.notStrictEqual(session2.publicToken, session1.publicToken);
  assert.strictEqual(session2.status, "created");

  // Verify session 1 remains completed
  const detail1 = await getOwnerSessionDetail("owner_multiscan", session1.id);
  assert.strictEqual(detail1.status, 200);
  assert.ok("session" in detail1.body);
  assert.strictEqual(detail1.body.session.status, "completed");

  // Verify owner history has both
  const history = await getOwnerSessionHistory("owner_multiscan");
  assert.ok("sessions" in history.body);
  assert.strictEqual(history.body.sessions.length, 2);
});

test("Phase 3B: Owner can cancel active session", async () => {
  setupTestEnvironment();

  const session = await createOwnerSession("owner_cancel", "To Be Cancelled");
  const cancelRes = await cancelOwnerSession("owner_cancel", session.id);
  assert.strictEqual(cancelRes.status, 200);

  const detail = await getOwnerSessionDetail("owner_cancel", session.id);
  assert.ok("session" in detail.body);
  assert.strictEqual(detail.body.session.status, "cancelled");

  // Public endpoint reflects cancellation / non-readiness
  const pubRes = await getPublicSessionInfo(session.publicToken);
  assert.ok("status" in pubRes.body);
  assert.strictEqual(pubRes.body.status, "cancelled");
});

test("Phase 3B: Cancelled session rejects OTP with explicit cancelled error", async () => {
  setupTestEnvironment();

  const session = await createOwnerSession("owner_cancel_otp", "Cancelled Document");
  await cancelOwnerSession("owner_cancel_otp", session.id);

  // Recipient attempting to submit OTP on cancelled session
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  assert.strictEqual(authRes.status, 410);
  assert.strictEqual(authRes.body.success, false);
  assert.strictEqual(authRes.body.error, "cancelled");
});

test("Phase 3B: Finalization retry idempotency prevents duplicate notifications or activities", async () => {
  setupTestEnvironment();

  const session = await createOwnerSession("owner_retry_final", "Finalize Retry Test");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  const recipientToken = authRes.body.recipientToken!;

  await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_rf_1",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
  });

  // First finalization
  const res1 = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_rf_1"],
  });
  assert.strictEqual(res1.status, 200);

  // Second finalization retry
  const res2 = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_rf_1"],
  });
  // Must reject as already completed or conflict
  assert.ok(res2.status === 409 || res2.status === 401);

  // Notifications must contain exactly 1 notification
  const notifs = await getOwnerNotifications("owner_retry_final");
  assert.ok("notifications" in notifs.body);
  assert.strictEqual(notifs.body.notifications.length, 1);
  assert.strictEqual(notifs.body.unreadCount, 1);

  // Activities must contain exactly 1 document_completed event
  const detail = await getOwnerSessionDetail("owner_retry_final", session.id);
  assert.ok("activities" in detail.body);
  const completedEvents = detail.body.activities.filter((a) => a.eventType === "document_completed");
  assert.strictEqual(completedEvents.length, 1);
});

test("Phase 3B: Configured 72h expiry does not extend authenticated 2-hour scan window", async () => {
  const { repo } = setupTestEnvironment();

  // Create session with 72h link TTL
  const session = await createOwnerSession("owner_ttl", "Long TTL", 72);
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  const recipientToken = authRes.body.recipientToken!;

  // Verify activeScanExpiresAt is set to ~2 hours from now, NOT 72 hours
  const stored = await repo.findById(session.id);
  assert.ok(stored);
  assert.ok(stored.activeScanExpiresAt);
  const windowDurationMs = stored.activeScanExpiresAt - stored.createdAt;
  // ~2 hours (7200000 ms) within 5 seconds tolerance
  assert.ok(windowDurationMs >= 7190000 && windowDurationMs <= 7210000);

  // Simulate time fast-forward past 2-hour scan window (e.g. +2h 5m), even though 72h has not passed
  const simulatedExpiredNow = stored.activeScanExpiresAt + 5 * 60 * 1000;
  // Uploading page with current time past activeScanExpiresAt must be rejected as expired
  const uploadRes = await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_late",
    pageNumber: 1,
    checksum: computeChecksum(SAMPLE_JPEG_BYTES),
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG_BYTES,
    now: simulatedExpiredNow,
  });
  assert.strictEqual(uploadRes.status, 410);
  assert.strictEqual((uploadRes.body as { error: string }).error, "Session expired");
});


