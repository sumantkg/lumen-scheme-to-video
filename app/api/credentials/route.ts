import { NextResponse } from "next/server";

import { listCredentials, saveCredential } from "@/lib/credentials";
import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { verifyProviderCredential } from "@/lib/provider-verify";
import { credentialSaveSchema } from "@/lib/validation";

/**
 * Per-user provider API keys.
 *
 *   GET  /api/credentials  → masked key list (plaintext never leaves the server)
 *   POST /api/credentials  → verify the pasted key, then store it encrypted
 *
 * Every save goes through the provider's own cheap metadata call first, so an
 * invalid key is rejected before it is ever persisted.
 */
export async function GET() {
  const user = await requireUser();
  const credentials = await listCredentials(user.id);
  return NextResponse.json({ credentials });
}

export async function POST(request: Request) {
  const user = await requireUser();

  const limited = enforceRateLimit(`credentials:${user.id}`, RATE_LIMITS.credentials);
  if (limited) return limited;

  let body: ReturnType<typeof credentialSaveSchema.parse>;
  try {
    body = credentialSaveSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Pick a provider and paste an API key." },
      { status: 400 }
    );
  }

  try {
    // Verify against the real service before storing anything.
    const verified = await verifyProviderCredential(body.provider, body.apiKey);
    const credential = await saveCredential({
      userId: user.id,
      provider: body.provider,
      apiKey: body.apiKey,
      label: body.label,
    });
    return NextResponse.json({ credential, models: verified.models });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}