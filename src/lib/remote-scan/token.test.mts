import test from "node:test";
import assert from "node:assert/strict";
import {
  computeChecksum,
  generatePublicToken,
  generateRecipientToken,
  generateSessionId,
  hashToken,
  verifyTokenHash,
} from "./token.ts";

test("generatePublicToken produces 256-bit base64url string", () => {
  const token = generatePublicToken();
  assert.strictEqual(token.length, 43); // 32 bytes base64url = 43 chars
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("generateRecipientToken produces unguessable tokens", () => {
  const token1 = generateRecipientToken();
  const token2 = generateRecipientToken();
  assert.strictEqual(token1.length, 43);
  assert.notStrictEqual(token1, token2);
});

test("generateSessionId produces valid unique identifier", () => {
  const id1 = generateSessionId();
  const id2 = generateSessionId();
  assert.ok(id1.length >= 16);
  assert.notStrictEqual(id1, id2);
});

test("hashToken produces consistent SHA-256 hex", () => {
  const token = "test_token_value_12345";
  const hash1 = hashToken(token);
  const hash2 = hashToken(token);
  assert.strictEqual(hash1.length, 64);
  assert.strictEqual(hash1, hash2);
});

test("verifyTokenHash validates correct token and rejects invalid token", () => {
  const token = generateRecipientToken();
  const hash = hashToken(token);

  assert.strictEqual(verifyTokenHash(token, hash), true);
  assert.strictEqual(verifyTokenHash("tampered_token", hash), false);
  assert.strictEqual(verifyTokenHash("", hash), false);
});

test("computeChecksum calculates valid SHA-256 for buffer", () => {
  const buf = Buffer.from("test image content data");
  const checksum = computeChecksum(buf);
  assert.strictEqual(checksum.length, 64);
  assert.match(checksum, /^[0-9a-f]{64}$/);
});
