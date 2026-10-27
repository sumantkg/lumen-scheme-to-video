/**
 * Project status → copy + CSS tone. Shared by the library cards, the dashboard
 * and the storyboard page's progress view.
 */

export const STATUS_TONES = {
  neutral: "chip-neutral",
  working: "chip-working",
  ready: "chip-ready",
  error: "chip-error",
} as const;

export type StatusTone = keyof typeof STATUS_TONES;

export const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  generating_scenes: { label: "Building storyboard", tone: "working" },
  auditing: { label: "AI critic at work", tone: "working" },
  scenes_ready: { label: "Storyboard ready", tone: "ready" },
  generating_media: { label: "Rendering clips", tone: "working" },
  clips_ready: { label: "Clips ready", tone: "ready" },
  synthesizing_audio: { label: "Recording narration", tone: "working" },
  merging: { label: "Merging", tone: "working" },
  ready: { label: "Ready", tone: "ready" },
  failed: { label: "Failed", tone: "error" },
};

/** Statuses the storyboard page should keep polling while active. */
export const WORKING_STATUSES = new Set([
  "generating_scenes",
  "auditing",
  "generating_media",
  "synthesizing_audio",
  "merging",
]);

export function statusLabel(status: string): string {
  return STATUS_META[status]?.label ?? status;
}

export function statusTone(status: string): StatusTone {
  return STATUS_META[status]?.tone ?? "neutral";
}