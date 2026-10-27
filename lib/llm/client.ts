import { callGemini } from "./gemini";
import { callOpenAI } from "./openai";
import type { LlmRequest } from "./types";
import { LlmExecutionError } from "./types";

/**
 * Client façade: pick the backend by provider and turn the model's response
 * into a JSON object, stripping markdown fences and rescuing a stray object
 * buried in prose.
 */

export function extractJson(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("JSON parse yielded a non-object.");
  } catch {
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (match) {
      try {
        const parsed: unknown = JSON.parse(match[0]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Fall through to a descriptive error.
      }
    }
  }

  throw new LlmExecutionError(
    `The model did not return valid JSON. Response preview: ${cleaned.slice(0, 240)}`
  );
}

/** Run an LLM request and return a parsed JSON object. */
export async function generateJson(request: LlmRequest): Promise<Record<string, unknown>> {
  switch (request.provider) {
    case "gemini":
      return callGemini(request, extractJson);
    case "openai":
      return callOpenAI(request, extractJson);
    default:
      throw new LlmExecutionError(`Unsupported LLM provider: ${String(request.provider)}`);
  }
}