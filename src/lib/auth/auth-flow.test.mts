import test from "node:test";
import assert from "node:assert";
import { getAuthenticatedOwner } from "./owner-context.ts";

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
  } finally {
    env.NODE_ENV = originalEnv;
  }
});

test("Auth Security: Never expose SUPABASE_SECRET_KEY to client-facing code", () => {
  // Ensure no NEXT_PUBLIC variable contains secret key
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
