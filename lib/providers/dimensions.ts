import type { AspectRatio } from "./types";

/**
 * Output geometry every provider has to produce.
 *
 * Hosted models return whatever they feel like — 16:9 at 480p, 4s instead of
 * 5s, or an mp4 that browsers refuse to seek. Lumen treats the model as a
 * *source of footage* and re-encodes it to the aspect/duration the user asked
 * for, so the composer's promises hold no matter which provider is configured.
 */
export const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 900, height: 900 },
};

export const MIN_DURATION_SECONDS = 2;
export const MAX_DURATION_SECONDS = 10;

/** Clamp a requested duration into the range the product supports. */
export function clampDurationSeconds(value: number): number {
  const rounded = Math.round(value) || MIN_DURATION_SECONDS;
  return Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, rounded));
}
