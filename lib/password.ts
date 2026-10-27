import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt — no native dependencies.
 * Stored format: `scrypt$<salt-hex>$<hash-hex>`
 */
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const derived = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");

  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
