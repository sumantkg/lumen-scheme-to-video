import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto/secret-box";

/**
 * Per-user provider credential store.
 *
 * The browser only ever sees a masked suffix; ciphertext stays server-side and
 * the worker decrypts a key briefly for the duration of one call.
 */

import {
  type CredentialProvider,
} from "@/lib/credential-providers";
export type { CredentialProvider } from "@/lib/credential-providers";
export {
  CREDENTIAL_PROVIDERS,
  isCredentialProvider,
} from "@/lib/credential-providers";

export interface CredentialView {
  id: string;
  provider: string;
  label: string | null;
  /** Masked suffix like `…ab12`. */
  last4: string;
  verifiedAt: string | null;
}

export function toCredentialView(row: {
  id: string;
  provider: string;
  label: string | null;
  last4: string;
  verifiedAt: Date | null;
}): CredentialView {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    last4: row.last4,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

/** Save a verified key. Verifying is the caller's responsibility. */
export async function saveCredential(params: {
  userId: string;
  provider: CredentialProvider;
  apiKey: string;
  label?: string | null;
}): Promise<CredentialView> {
  const secret = encryptSecret(params.apiKey.trim());
  const row = await prisma.apiCredential.upsert({
    where: { userId_provider: { userId: params.userId, provider: params.provider } },
    create: {
      userId: params.userId,
      provider: params.provider,
      label: params.label?.trim() || null,
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.authTag,
      last4: maskKey(params.apiKey.trim()),
      verifiedAt: new Date(),
      lastError: null,
    },
    update: {
      label: params.label?.trim() || null,
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.authTag,
      last4: maskKey(params.apiKey.trim()),
      verifiedAt: new Date(),
      lastError: null,
    },
  });

  return toCredentialView(row);
}

export async function listCredentials(userId: string): Promise<CredentialView[]> {
  const rows = await prisma.apiCredential.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toCredentialView);
}

export async function deleteCredential(userId: string, id: string): Promise<boolean> {
  const removed = await prisma.apiCredential.deleteMany({ where: { id, userId } });
  return removed.count > 0;
}

/** True when the user has a stored key for a provider. */
export async function hasCredential(userId: string, provider: string): Promise<boolean> {
  const count = await prisma.apiCredential.count({ where: { userId, provider } });
  return count > 0;
}

/**
 * Decrypt a user's key. Returns null when none is stored. Callers must not log
 * the returned value.
 */
export async function getDecryptedKey(
  userId: string,
  provider: string
): Promise<string | null> {
  const row = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!row) return null;
  return decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
}