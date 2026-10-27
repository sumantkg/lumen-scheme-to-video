import { fetchJson, HttpError } from "@/lib/providers/remote";
import type { LlmImagePart, LlmRequest, LlmProviderName } from "./types";
import { LlmAuthError, LlmExecutionError } from "./types";

/**
 * Google Gemini (Generative Language API) LLM backend.
 *
 * Uses the documented REST surface so no google-genai SDK is required. Model
 * names rotate constantly, so a primary model is tried first and a curated
 * fallback pool covers the transient "model not found" cases.
 */
export const DEFAULT_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

function apiBaseFrom(request: LlmRequest): string {
  return (request.apiBase ?? process.env.LLM_GEMINI_API_BASE ?? DEFAULT_GEMINI_API_BASE).replace(
    /\/+$/,
    ""
  );
}

const DEFAULT_TIMEOUT_MS = 60_000;

export async function callGemini(
  request: LlmRequest,
  extractJson: (text: string) => Record<string, unknown>
): Promise<Record<string, unknown>> {
  const base = apiBaseFrom(request);
  const rawModel = (request.model ?? process.env.LLM_GEMINI_MODEL ?? "gemini-3.8-flash").trim();
  const primary = rawModel;
  const candidates = [primary, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== primary)];

  const parts = [
    ...(request.images ?? []).map((image: LlmImagePart) => ({
      inlineData: { mimeType: image.mimeType, data: image.base64 },
    })),
    { text: request.userPrompt },
  ];

  let lastError: unknown = null;

  for (const model of candidates) {
    for (const jsonMode of request.jsonMode === false ? [false] : [true, false]) {
      try {
        const generationConfig: Record<string, unknown> = { temperature: 0.2 };
        if (jsonMode) generationConfig.responseMimeType = "application/json";

        const body = {
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts }],
          generationConfig,
        };

        const data = await fetchJson<GeminiResponse>(
          `${base}/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": request.apiKey },
            body,
            timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            retries: 2,
          }
        );

        const text = (data.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join("")
          .trim();

        if (!text) throw new LlmExecutionError("Gemini returned an empty response.");

        return extractJson(text);
      } catch (error) {
        lastError = error;
        if (looksLikeAuthFailure(error)) {
          throw new LlmAuthError(`Gemini API key rejected for model "${model}".`);
        }
        if (isCompletionFailure(error)) {
          // A concrete, non-transient failure — not worth trying every model.
          throw error;
        }
      }
    }
  }

  throw new LlmExecutionError(
    `All candidate Gemini models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function looksLikeAuthFailure(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 401 || error.status === 403;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /API_KEY_INVALID|PERMISSION_DENIED|FORBIDDEN/i.test(message);
}

function isCompletionFailure(error: unknown): boolean {
  if (error instanceof HttpError && error.status !== undefined) {
    // 404 means this specific model is missing or deprecated — try other candidates!
    if (error.status === 404) return false;
    // 429 on one model might be model-specific quota — allow fallback
    if (error.status === 429) return false;
    // 400 (bad request/prompt invalid) is a prompt rejection — don't retry
    return error.status < 500;
  }
  return false;
}

/** Verify a key without generating anything: `GET /models` is a fixed-price call. */
export async function verifyGeminiKey(apiKey: string, apiBase?: string): Promise<string[]> {
  const base = (apiBase ?? process.env.LLM_GEMINI_API_BASE ?? DEFAULT_GEMINI_API_BASE).replace(
    /\/+$/,
    ""
  );
  try {
    const data = await fetchJson<{ models?: Array<{ name?: string }> }>(
      `${base}/models`,
      { headers: { "x-goog-api-key": apiKey }, timeoutMs: 30_000 }
    );
    const names = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    if (names.length === 0) throw new LlmAuthError("No models returned for this key.");
    return names;
  } catch (error) {
    if (error instanceof LlmAuthError) throw error;
    if (looksLikeAuthFailure(error)) {
      throw new LlmAuthError("This does not look like a valid Gemini API key.");
    }
    throw error;
  }
}