import { NextResponse } from "next/server";

import { hasCredential } from "@/lib/credentials";
import { requireUser } from "@/lib/dal";
import {
  VIDEO_CATALOG,
  VIDEO_CREDENTIAL_PROVIDER,
  VIDEO_PROVIDER_ORDER,
  type ProviderName,
} from "@/lib/providers/catalog";

/**
 * The model pickers shown when configuring a project. A curated catalog, not a
 * live listing — the live `GET /models` list is fetched once during key
 * verification (app/api/credentials) and stored alongside the key.
 */

export const GEMINI_LLM_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

export const OPENAI_LLM_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "o4-mini",
];

/** Whether an operator configured an env fallback for a video provider. */
function hasEnvKey(name: ProviderName): boolean {
  switch (name) {
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());
    case "replicate":
      return Boolean(process.env.REPLICATE_API_TOKEN?.trim());
    case "fal":
      return Boolean(process.env.FAL_KEY?.trim());
  }
}

export async function GET() {
  const user = await requireUser();
  const [geminiKey, openaiKey] = await Promise.all([
    hasCredential(user.id, "gemini"),
    hasCredential(user.id, "openai"),
  ]);

  // Build the video catalog in display order; `verified` means "ready to use"
  // via the user's stored key or an operator env fallback.
  const video: Record<string, unknown> = {};
  for (const name of VIDEO_PROVIDER_ORDER) {
    const info = VIDEO_CATALOG[name];
    const credProvider = VIDEO_CREDENTIAL_PROVIDER[name];
    const stored = credProvider ? await hasCredential(user.id, credProvider) : false;
    video[name] = {
      label: info.label,
      models: info.models,
      default: info.default,
      billing: info.billing,
      note: info.note,
      verified: info.billing === "free" || stored || hasEnvKey(name),
    };
  }

  return NextResponse.json({
    llm: {
      gemini: {
        label: "Google Gemini",
        models: GEMINI_LLM_MODELS,
        default: "gemini-3.8-flash",
        verified: geminiKey,
      },
      openai: {
        label: "OpenAI",
        models: OPENAI_LLM_MODELS,
        default: "gpt-4o",
        verified: openaiKey,
      },
    },
    video,
  });
}
