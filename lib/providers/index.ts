import { FalProvider, readFalConfig } from "./fal";
import { GeminiProvider, readGeminiConfig } from "./gemini";
import { ReplicateProvider, readReplicateConfig } from "./replicate";
import type { VideoProvider } from "./types";

/**
 * Resolve the active video provider from the environment.
 */
export const PROVIDER_NAMES = ["gemini", "replicate", "fal"] as const;
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

  const name = (process.env.VIDEO_PROVIDER?.trim() || "gemini").toLowerCase();

  switch (name) {
    case "replicate":
      cached = new ReplicateProvider(readReplicateConfig());
      break;
    case "fal":
      cached = new FalProvider(readFalConfig());
      break;
    case "gemini":
      cached = new GeminiProvider(readGeminiConfig());
      break;
    default:
      throw new Error(
        `VIDEO_PROVIDER is unset or unknown ("${name}"). Expected one of: ${PROVIDER_NAMES.join(
          ", "
        )}.`
      );
  }

  return cached;
}

/** Reset the cached instance (used by test suites). */
export function resetVideoProvider(): void {
  cached = null;
}