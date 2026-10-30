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
  replicate: {
    label: "Replicate",
    billing: "user-key",
    default: "minimax/hailuo-02",
    models: [
      "minimax/hailuo-02",
      "minimax/video-01",
      "wan-video/wan-2.5-t2v",
      "kwaivgi/kling-v2.1",
    ],
    note: "Hundreds of community video models, billed to your Replicate account.",
  },
  fal: {
    label: "fal.ai",
    billing: "user-key",
    default: "fal-ai/wan/v2.2-5b/text-to-video/fast-wan",
    models: [
      "fal-ai/wan/v2.2-5b/text-to-video/fast-wan",
      "fal-ai/kling-video/v2/master/text-to-video",
      "fal-ai/minimax/hailuo-02/standard/text-to-video",
    ],
    note: "Fast hosted text-to-video, billed to your fal account.",
  },
};

/** Default provider when a project has not chosen one (Google Gemini Omni). */
export const DEFAULT_VIDEO_PROVIDER: ProviderName = "gemini";

/**
 * The credential provider a video provider resolves its key from.
 */
export const VIDEO_CREDENTIAL_PROVIDER: Record<ProviderName, string | null> = {
  gemini: "gemini",
  replicate: "replicate",
  fal: "fal",
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
