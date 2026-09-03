import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generates an unguessable 256-bit URL-safe public session token.
 */
export function generatePublicToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generates an opaque 256-bit URL-safe recipient session bearer token.
 */
export function generateRecipientToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generates an opaque session ID (UUID v4 or secure random hex).
 */
export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return randomBytes(16).toString("hex");
}

/**
 * Computes a SHA-256 hash of a string token.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Computes the SHA-256 checksum of a binary Buffer.
 */
export function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Compares two token hashes in constant time to prevent timing side-channels.
 */
export function verifyTokenHash(incomingToken: string, storedHash: string): boolean {
  if (!incomingToken || !storedHash) {
    return false;
  }
  const incomingHash = hashToken(incomingToken);
  const incomingBuf = Buffer.from(incomingHash, "hex");
  const storedBuf = Buffer.from(storedHash, "hex");

  if (incomingBuf.length !== storedBuf.length) {
    return false;
  }

  return timingSafeEqual(incomingBuf, storedBuf);
}
