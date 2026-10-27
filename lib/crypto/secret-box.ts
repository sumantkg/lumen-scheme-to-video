import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for provider API keys at rest.
 *
 * The key comes from CREDENTIAL_ENCRYPTION_KEY (32 bytes, base64). Each secret
 * gets its own random 12-byte nonce and a 16-byte auth tag, so the same
 * plaintext never encrypts to the same bytes and tampering is detected.
 *
 * Only server/worker code ever touches these helpers — the browser only ever
 * sees a masked suffix.
 */

export interface EncryptedSecret {
  /** base64 ciphertext */
  ciphertext: string;
  /** base64 12-byte nonce */
  iv: string;
  /** base64 16-byte auth tag */
  authTag: string;
}

function encryptionKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and add it to .env so stored API keys can be encrypted."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded " +
        "(e.g. `openssl rand -base64 32`)."
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(secret.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Display suffix, e.g. `…ab12`. The plaintext is never shown in full. */
export function maskKey(plaintext: string, tail = 4): string {
  if (plaintext.length <= tail) return "•".repeat(plaintext.length);
  return `…${plaintext.slice(-tail)}`;
}