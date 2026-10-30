import { GeminiProvider, readGeminiConfig } from "./gemini";
import type { VideoProvider } from "./types";

/**
 * Resolve the active video provider from the environment.
 */
export const PROVIDER_NAMES = ["gemini"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

let cached: VideoProvider | null = null;

/**
 * Resolve the active video provider from the environment.
 */
export function getVideoProvider(): VideoProvider {
  if (cached) return cached;

  cached = new GeminiProvider(readGeminiConfig());
  return cached;
}

/** Reset the cached instance (used by test suites). */
export function resetVideoProvider(): void {
  cached = null;
}