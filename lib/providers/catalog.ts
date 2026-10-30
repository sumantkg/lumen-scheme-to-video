import { PROVIDER_NAMES, type ProviderName } from "./index";

/**
 * Curated video-provider catalog for the wizard and the models endpoint.
 */

export interface VideoProviderInfo {
  label: string;
  /** What pays for a render with this provider. */
  billing: "user-key" | "operator-key" | "free";
  /** Default model id, matching each provider's built-in default. */
  default: string;
  models: string[];
  /** One-line note shown under the picker. */
  note: string;
}

export const VIDEO_CATALOG: Record<ProviderName, VideoProviderInfo> = {
  gemini: {
    label: "Google Gemini (Omni)",
    billing: "user-key",
    default: "gemini-omni-1.1-flash",
    models: [
      "gemini-omni-1.1-flash",
    ],
    note: "Video generation with Gemini Omni. Reuses your verified Gemini key.",
  },
};

/** Default provider when a project has not chosen one (Google Gemini Omni). */
export const DEFAULT_VIDEO_PROVIDER: ProviderName = "gemini";

/**
 * The credential provider a video provider resolves its key from.
 */
export const VIDEO_CREDENTIAL_PROVIDER: Record<ProviderName, string | null> = {
  gemini: "gemini",
};

export function defaultVideoModel(name: ProviderName): string {
  return VIDEO_CATALOG[name].default;
}

/** Preserve the canonical UI order, with Gemini first. */
export const VIDEO_PROVIDER_ORDER: ProviderName[] = [
  "gemini",
];

export { PROVIDER_NAMES };
export type { ProviderName };
