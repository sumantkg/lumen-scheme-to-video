import type { CredentialProvider } from "@/lib/credential-providers";
import { verifyGeminiKey } from "@/lib/llm/gemini";
import { verifyOpenAIKey } from "@/lib/llm/openai";

/**
 * Verify a pasted key against the provider that will spend it, before it is
 * ever stored. Every check is a cheap, read-only metadata call — never a
 * generation request — so validating a key costs the user nothing.
 *
 * LLM keys (Gemini/OpenAI) also power their video models (Veo / Sora), so the
 * same verified credential is reused for rendering.
 */

export interface VerificationResult {
  provider: CredentialProvider;
  /** Model ids the key can see, when the provider lists them. */
  models: string[];
  /** Short human summary for the settings toast. */
  detail: string;
}

const DEFAULT_REPLICATE_API_BASE = "https://api.replicate.com/v1";
const DEFAULT_FAL_API_BASE = "https://api.fal.ai/v1";
const TIMEOUT_MS = 15_000;

/** A 2xx means the key authenticated; anything else is a failure. */
async function probe(
  url: string,
  headers: Record<string, string>,
  provider: string
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach ${provider} to verify the key (${reason}).`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`That ${provider} key was rejected. Check it and try again.`);
  }
  if (!response.ok) {
    throw new Error(`${provider} returned HTTP ${response.status} while verifying the key.`);
  }

  const text = await response.text();
  return text ? text.slice(0, 2000) : null;
}

export async function verifyProviderCredential(
  provider: CredentialProvider,
  apiKey: string
): Promise<VerificationResult> {
  const key = apiKey.trim();
  if (!key) throw new Error("Enter an API key.");

  switch (provider) {
    case "gemini": {
      const models = await verifyGeminiKey(key);
      return { provider, models, detail: "Google Gemini" };
    }
    case "openai": {
      const models = await verifyOpenAIKey(key);
      return { provider, models, detail: "OpenAI" };
    }
    case "replicate": {
      const base = (process.env.REPLICATE_API_BASE?.trim() || DEFAULT_REPLICATE_API_BASE).replace(
        /\/+$/,
        ""
      );
      await probe(`${base}/account`, { authorization: `Bearer ${key}` }, "Replicate");
      return { provider, models: [], detail: "Replicate account" };
    }
    case "fal": {
      const base = (process.env.FAL_API_BASE?.trim() || DEFAULT_FAL_API_BASE).replace(/\/+$/, "");
      await probe(`${base}/keys`, { authorization: `Key ${key}` }, "fal");
      return { provider, models: [], detail: "fal account" };
    }
    default: {
      // Exhaustiveness guard — a new provider must add verification here.
      const never: never = provider;
      throw new Error(`Unsupported provider "${String(never)}".`);
    }
  }
}
