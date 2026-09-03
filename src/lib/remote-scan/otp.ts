import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};
const KEY_LEN = 32;

/**
 * Generates a cryptographically random 6-digit numeric OTP string.
 */
export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Generates a 16-byte random hex salt for OTP hashing.
 */
export function generateOtpSalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Hashes a 6-digit OTP with the provided salt using scrypt.
 */
export async function hashOtp(otp: string, salt: string): Promise<string> {
  if (!/^\d{6}$/.test(otp)) {
    throw new Error("OTP must be exactly 6 decimal digits.");
  }
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(otp, salt, KEY_LEN, SCRYPT_OPTIONS, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key as Buffer);
      }
    });
  });
  return derivedKey.toString("hex");
}

/**
 * Verifies a candidate OTP against a stored hash and salt using constant-time comparison.
 */
export async function verifyOtp(
  candidateOtp: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  if (!/^\d{6}$/.test(candidateOtp) || !storedHash || !salt) {
    return false;
  }

  try {
    const computedHash = await hashOtp(candidateOtp, salt);
    const candidateBuf = Buffer.from(computedHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");

    if (candidateBuf.length !== storedBuf.length) {
      return false;
    }

    return timingSafeEqual(candidateBuf, storedBuf);
  } catch {
    return false;
  }
}
