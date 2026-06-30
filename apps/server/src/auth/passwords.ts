import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

/** Hash a password as `salt:derivedKey`, both hex-encoded. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

/** Constant-time comparison of a plaintext password against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) {
    return false;
  }

  const derived = scryptSync(password, salt, KEY_LENGTH);
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(keyBuffer, derived);
}
