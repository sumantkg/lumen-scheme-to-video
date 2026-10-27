import { fetchJson, HttpError } from "@/lib/providers/remote";
import type { LlmImagePart, LlmRequest, LlmProviderName } from "./types";
import { LlmAuthError, LlmExecutionError } from "./types";

/**
 * OpenAI LLM backend. Pure REST — no openai SDK dependency.
 */
export const DEFAULT_OPENAI_API_BASE = "https://api.openai.com/v1";

interface ChatMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

function apiBaseFrom(request: LlmRequest): string {
  return (request.apiBase ?? process.env.LLM_OPENAI_API_BASE ?? DEFAULT_OPENAI_API_BASE).replace(
    /\/+$/,
    ""
  );
}

const DEFAULT_TIMEOUT_MS = 120_000;

export async function callOpenAI(
  request: LlmRequest,
  extractJson: (text: string) => Record<string, unknown>
): Promise<Record<string, unknown>> {
  const base = apiBaseFrom(request);
  const model = (request.model ?? process.env.LLM_OPENAI_MODEL ?? "gpt-4o").trim();

  const userContent: ChatMessage["content"] = [];
  for (const image of request.images ?? []) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }
  userContent.push({ type: "text", text: request.userPrompt });

  const messages: ChatMessage[] = [
    { role: "system", content: request.systemPrompt },
    { role: "user", content: userContent },
  ];

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.2,
    };
    if (request.jsonMode !== false) body.response_format = { type: "json_object" };

    const data = await fetchJson<ChatResponse>(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${request.apiKey}` },
      body,
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: 2,
    });

    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new LlmExecutionError("OpenAI returned an empty response.");

    return extractJson(text);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      throw new LlmAuthError("OpenAI API key rejected.");
    }
    throw error;
  }
}

/** Verify a key without generating anything: `GET /models` is cheap. */
export async function verifyOpenAIKey(apiKey: string, apiBase?: string): Promise<string[]> {
  const base = (apiBase ?? process.env.LLM_OPENAI_API_BASE ?? DEFAULT_OPENAI_API_BASE).replace(
    /\/+$/,
    ""
  );
  try {
    const data = await fetchJson<{ data?: Array<{ id?: string }> }>(
      `${base}/models`,
      { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 30_000 }
    );
    const ids = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean);
    if (ids.length === 0) throw new LlmAuthError("No models returned for this key.");
    return ids;
  } catch (error) {
    if (error instanceof LlmAuthError) throw error;
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      throw new LlmAuthError("This does not look like a valid OpenAI API key.");
    }
    throw error;
  }
}