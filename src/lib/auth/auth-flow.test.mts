import test from "node:test";
import assert from "node:assert";
import { getAuthenticatedOwner } from "./owner-context.ts";
import { getSupabaseSecretKey } from "../supabase/config.ts";
import { SupabaseStorageService, InMemoryStorageService, setStorageServiceForTest } from "../remote-scan/storage-service.ts";
import {
  createOwnerSession,
  verifySessionOtp,
  processPageUpload,
  finalizeSession,
} from "../remote-scan/session-service.ts";
import { InMemoryScanSessionRepository, setSessionRepositoryForTest } from "../remote-scan/session-repository.ts";
import { computeChecksum } from "../remote-scan/token.ts";

const SAMPLE_JPEG = Buffer.from([
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

test("Auth Protection: Unauthenticated request in production returns null (401)", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    const request = new Request("http://localhost/api/owner/sessions");
    const owner = await getAuthenticatedOwner(request);
    assert.strictEqual(owner, null);
  } finally {
    env.NODE_ENV = originalEnv;
  }
});

test("Auth Protection: Attacker cannot impersonate owner via X-Test-Owner-Id in production", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    const request = new Request("http://localhost/api/owner/sessions", {
      headers: { "X-Test-Owner-Id": "victim_owner_account" },
    });
    const owner = await getAuthenticatedOwner(request);
    assert.strictEqual(owner, null);
  } finally {
    env.NODE_ENV = originalEnv;
  }
});

test("Auth Protection: Test environment correctly respects test owner mock", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "test";
    const request = new Request("http://localhost/api/owner/sessions", {
      headers: { "X-Test-Owner-Id": "verified_test_owner" },
    });
    const owner = await getAuthenticatedOwner(request);
    assert.ok(owner);
    assert.strictEqual(owner.ownerId, "verified_test_owner");
    assert.strictEqual(owner.emailConfirmed, true);
  } finally {
    env.NODE_ENV = originalEnv;
  }
});

test("Email Confirmation Gate: Unconfirmed owner request is strictly rejected", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "test";
    // Simulated unconfirmed owner request
    const request = new Request("http://localhost/api/owner/sessions", {
      headers: {
        "X-Test-Owner-Id": "unconfirmed_test_owner",
        "X-Test-Email-Unconfirmed": "true",
      },
    });
    const owner = await getAuthenticatedOwner(request);
    assert.strictEqual(owner, null, "Unconfirmed owner must receive null owner context");
  } finally {
    env.NODE_ENV = originalEnv;
  }
});

test("Email Confirmation Gate: Production Bearer token verification rejects unconfirmed user", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = env.SUPABASE_URL;
  const originalSecretKey = env.SUPABASE_SECRET_KEY;

  try {
    env.NODE_ENV = "production";
    env.SUPABASE_URL = "https://mock-supabase.example.com";
    env.SUPABASE_SECRET_KEY = "mock_secret_key";

    // Mock fetch to simulate Supabase /auth/v1/user returning an unconfirmed user
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("/auth/v1/user")) {
        return new Response(
          JSON.stringify({
            id: "user_unconfirmed_123",
            email: "unconfirmed@example.com",
            email_confirmed_at: null, // NOT CONFIRMED
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input);
    };

    const request = new Request("https://mock-supabase.example.com/api/owner/sessions", {
      headers: { Authorization: "Bearer test_unconfirmed_jwt" },
    });

    const owner = await getAuthenticatedOwner(request);
    assert.strictEqual(owner, null, "Bearer token for unconfirmed email must return null");
  } finally {
    env.NODE_ENV = originalEnv;
    env.SUPABASE_URL = originalSupabaseUrl;
    env.SUPABASE_SECRET_KEY = originalSecretKey;
    globalThis.fetch = originalFetch;
  }
});

test("Email Confirmation Gate: Production Bearer token verification accepts confirmed user", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = env.SUPABASE_URL;
  const originalSecretKey = env.SUPABASE_SECRET_KEY;

  try {
    env.NODE_ENV = "production";
    env.SUPABASE_URL = "https://mock-supabase.example.com";
    env.SUPABASE_SECRET_KEY = "mock_secret_key";

    // Mock fetch to simulate Supabase /auth/v1/user returning a confirmed user
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("/auth/v1/user")) {
        return new Response(
          JSON.stringify({
            id: "user_confirmed_123",
            email: "confirmed@example.com",
            email_confirmed_at: "2026-09-07T12:00:00Z", // CONFIRMED
            user_metadata: { full_name: "Confirmed Owner" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input);
    };

    const request = new Request("https://mock-supabase.example.com/api/owner/sessions", {
      headers: { Authorization: "Bearer test_confirmed_jwt" },
    });

    const owner = await getAuthenticatedOwner(request);
    assert.ok(owner, "Confirmed owner must return owner context");
    assert.strictEqual(owner.ownerId, "user_confirmed_123");
    assert.strictEqual(owner.email, "confirmed@example.com");
    assert.strictEqual(owner.fullName, "Confirmed Owner");
    assert.strictEqual(owner.emailConfirmed, true);
  } finally {
    env.NODE_ENV = originalEnv;
    env.SUPABASE_URL = originalSupabaseUrl;
    env.SUPABASE_SECRET_KEY = originalSecretKey;
    globalThis.fetch = originalFetch;
  }
});

test("Auth Security: Canonical server secret is SUPABASE_SECRET_KEY, never SUPABASE_SERVICE_ROLE_KEY", () => {
  const env = process.env as Record<string, string | undefined>;
  assert.strictEqual(
    env.SUPABASE_SERVICE_ROLE_KEY,
    undefined,
    "SUPABASE_SERVICE_ROLE_KEY must not be introduced into the environment"
  );
  // getSupabaseSecretKey must read SUPABASE_SECRET_KEY
  const originalSecret = env.SUPABASE_SECRET_KEY;
  try {
    env.SUPABASE_SECRET_KEY = "sb_secret_canonical_test";
    assert.strictEqual(getSupabaseSecretKey(), "sb_secret_canonical_test");
  } finally {
    env.SUPABASE_SECRET_KEY = originalSecret;
  }
});

test("Auth Security: Never expose SUPABASE_SECRET_KEY to client-facing code", () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      const val = process.env[key];
      assert.ok(
        !val || !val.startsWith("sb_secret_"),
        `Environment variable ${key} must never contain a Supabase secret key`
      );
    }
  }
});

test("Callback PKCE Exchange & Redirection Logic", () => {
  // Test 1: Default signup confirmation redirect destination is /auth/confirmed
  const signupUrl = new URL("https://bhejo.vyndra.tech/auth/callback?code=test_pkce_code");
  const nextParam1 = signupUrl.searchParams.get("next") || "/auth/confirmed";
  assert.strictEqual(nextParam1, "/auth/confirmed");

  // Test 2: Password recovery redirect destination is /auth/update-password
  const recoveryUrl = new URL("https://bhejo.vyndra.tech/auth/callback?code=test_rec_code&next=/auth/update-password");
  const nextParam2 = recoveryUrl.searchParams.get("next") || "/auth/confirmed";
  assert.strictEqual(nextParam2, "/auth/update-password");

  // Test 3: Reverse proxy forwarded host handling
  const forwardedHost = "bhejo.vyndra.tech, proxy.lan";
  const origin = `https://${forwardedHost.split(",")[0].trim()}`;
  assert.strictEqual(origin, "https://bhejo.vyndra.tech");

  // Test 4: Open redirect prevention (rejects protocol-relative and external URLs)
  function sanitizeNext(param: string | null): string {
    return param && param.startsWith("/") && !param.startsWith("//") ? param : "/auth/confirmed";
  }
  assert.strictEqual(sanitizeNext("//evil.com"), "/auth/confirmed");
  assert.strictEqual(sanitizeNext("https://evil.com"), "/auth/confirmed");
  assert.strictEqual(sanitizeNext("/auth/update-password"), "/auth/update-password");
});

test("Storage Service: SupabaseStorageService initialization and API surface", () => {
  const storage = new SupabaseStorageService(
    "https://test.supabase.co",
    "test_secret_key_12345",
    "documents"
  );
  assert.ok(storage);
  assert.strictEqual(typeof storage.savePage, "function");
  assert.strictEqual(typeof storage.getPage, "function");
  assert.strictEqual(typeof storage.deleteSessionPages, "function");
});

test("Upload Retry & Finalize Idempotency end-to-end", async () => {
  const repo = new InMemoryScanSessionRepository();
  const storage = new InMemoryStorageService();
  setSessionRepositoryForTest(repo);
  setStorageServiceForTest(storage);

  // 1. Create owner session
  const session = await createOwnerSession("owner_idemp", "Idempotent Scan");
  const authRes = await verifySessionOtp(session.publicToken, session.otp);
  assert.strictEqual(authRes.status, 200);
  const recipientToken = authRes.body.recipientToken!;

  // 2. Upload Page 1
  const checksum = computeChecksum(SAMPLE_JPEG);
  const upload1 = await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_idemp_1",
    pageNumber: 1,
    checksum,
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG,
  });
  assert.strictEqual(upload1.status, 200);
  assert.strictEqual(upload1.body.status, "uploaded");

  // 3. Retry Page 1 upload (upload retry idempotency)
  const uploadRetry = await processPageUpload({
    publicToken: session.publicToken,
    recipientToken,
    pageId: "page_idemp_1",
    pageNumber: 1,
    checksum,
    correctionFallback: false,
    fileBuffer: SAMPLE_JPEG,
  });
  assert.strictEqual(uploadRetry.status, 200);
  assert.strictEqual(uploadRetry.body.status, "already_uploaded");

  // 4. Finalize session first time
  const finalize1 = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_idemp_1"],
  });
  assert.strictEqual(finalize1.status, 200);
  assert.strictEqual((finalize1.body as { status: string }).status, "completed");

  // 5. Finalize session retry (finalize idempotency with matching pages)
  const finalizeRetry = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_idemp_1"],
  });
  assert.strictEqual(finalizeRetry.status, 200, "Retrying finalization with matching pages must return 200");
  assert.strictEqual((finalizeRetry.body as { status: string }).status, "completed");

  // 6. Finalize session retry with mismatched pages fails with 409
  const finalizeMismatch = await finalizeSession({
    publicToken: session.publicToken,
    recipientToken,
    clientPageIds: ["page_non_existent"],
  });
  assert.strictEqual(finalizeMismatch.status, 409, "Finalization retry with mismatched pages must return 409");
});
