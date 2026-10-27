/**
 * Multi-provider LLM contract for scene generation and the critic agent.
 *
 * Both Gemini and OpenAI implement `generateJson`; verification is a separate
 * lightweight metadata call so the Settings form can check a pasted key
 * without burning any quota. Everything is plain fetch — no SDK dependency —
 * and runs in both Next.js API routes and the worker process.
 */

export type LlmProviderName = "gemini" | "openai";

export const LLM_PROVIDERS = ["gemini", "openai"] as const;

export function isLlmProvider(value: string): value is LlmProviderName {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

/** An image/PDF part sent alongside the text (grounding photos, native PDFs). */
export interface LlmImagePart {
  /** image/jpeg | image/png | application/pdf | … */
  mimeType: string;
  /** base64-encoded bytes */
  base64: string;
}

export interface LlmRequest {
  provider: LlmProviderName;
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  /** Multimodal parts, sent before the text. */
  images?: LlmImagePart[];
  /** Ask the model to reply with pure JSON (hardened and parsed either way). */
  jsonMode?: boolean;
  /** Temp override for tests/scripts. */
  apiBase?: string;
  timeoutMs?: number;
}

export class LlmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmAuthError";
  }
}

export class LlmExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmExecutionError";
  }
}