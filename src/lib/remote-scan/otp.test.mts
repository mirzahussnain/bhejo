import test from "node:test";
import assert from "node:assert/strict";
import {
  generateOtp,
  generateOtpSalt,
  hashOtp,
  verifyOtp,
} from "./otp.ts";

test("generateOtp produces valid 6-digit decimal string", () => {
  for (let i = 0; i < 50; i++) {
    const otp = generateOtp();
    assert.strictEqual(otp.length, 6);
    assert.match(otp, /^\d{6}$/);
    const num = Number.parseInt(otp, 10);
    assert.ok(num >= 100000 && num <= 999999);
  }
});

test("generateOtpSalt produces 32-char hex string (16 bytes)", () => {
  const salt1 = generateOtpSalt();
  const salt2 = generateOtpSalt();
  assert.strictEqual(salt1.length, 32);
  assert.match(salt1, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(salt1, salt2);
});

test("hashOtp and verifyOtp accept matching OTP", async () => {
  const otp = "582910";
  const salt = generateOtpSalt();
  const hash = await hashOtp(otp, salt);

  assert.ok(hash.length > 0);
  const isValid = await verifyOtp(otp, hash, salt);
  assert.strictEqual(isValid, true);
});

test("verifyOtp rejects incorrect OTP", async () => {
  const otp = "123456";
  const wrongOtp = "654321";
  const salt = generateOtpSalt();
  const hash = await hashOtp(otp, salt);

  const isValid = await verifyOtp(wrongOtp, hash, salt);
  assert.strictEqual(isValid, false);
});

test("verifyOtp rejects malformed OTP strings", async () => {
  const otp = "123456";
  const salt = generateOtpSalt();
  const hash = await hashOtp(otp, salt);

  assert.strictEqual(await verifyOtp("12345", hash, salt), false);
  assert.strictEqual(await verifyOtp("1234567", hash, salt), false);
  assert.strictEqual(await verifyOtp("abcdef", hash, salt), false);
  assert.strictEqual(await verifyOtp("", hash, salt), false);
});

test("hashOtp throws on malformed OTP", async () => {
  const salt = generateOtpSalt();
  await assert.rejects(async () => {
    await hashOtp("12345", salt);
  });
});
