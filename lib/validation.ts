import { z } from "zod";

import { CREDENTIAL_PROVIDERS } from "@/lib/credential-providers";
import { LLM_PROVIDERS } from "@/lib/llm/types";
import { ASPECT_RATIOS } from "@/lib/providers/types";

/** Video providers a project can choose (kept literal to stay import-light). */
const VIDEO_PROVIDER_VALUES = ["gemini", "replicate", "fal"] as const;

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters." })
    .max(80, { error: "Name must be 80 characters or fewer." }),
  email: z
    .email({ error: "Enter a valid email address." })
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." })
    .max(200, { error: "Password must be 200 characters or fewer." }),
});

export const loginSchema = z.object({
  email: z
    .email({ error: "Enter a valid email address." })
    .trim()
    .toLowerCase(),
  password: z.string().min(1, { error: "Password is required." }),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** A new scheme-to-video project. Scheme text may be pasted or uploaded later. */
export const projectCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { error: "Give the project a title." })
    .max(120)
    .default("Untitled scheme video"),
  language: z
    .string()
    .trim()
    .min(2, { error: "Pick a narration language." })
    .default("bn"),
  region: z.string().trim().min(1).max(120).default("West Bengal"),
  notes: z.string().trim().max(2000).optional().nullable(),
  sceneCount: z.coerce
    .number()
    .int()
    .min(4, { error: "Storyboards are at least 4 scenes." })
    .max(8, { error: "Storyboards are at most 8 scenes." })
    .default(6),
  aspect: z.enum(ASPECT_RATIOS).default("16:9"),
  targetDurationSec: z.coerce
    .number()
    .int()
    .min(20, { error: "Target duration must be 20–180 seconds." })
    .max(180)
    .default(50),
  llmProvider: z.enum(LLM_PROVIDERS).default("gemini"),
  llmModel: z.string().trim().max(100).optional().nullable(),
  criticProvider: z.enum(LLM_PROVIDERS).optional().nullable(),
  criticModel: z.string().trim().max(100).optional().nullable(),
  videoProvider: z.enum(VIDEO_PROVIDER_VALUES).default("gemini"),
  videoModel: z.string().trim().max(100).optional().nullable(),
  useCritic: z.coerce.boolean().default(true),
  schemeText: z.string().trim().max(100_000).optional().nullable(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

/** Editable settings for an existing project (partial update). */
export const projectSettingsSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  language: z.string().trim().min(2).max(20).optional(),
  region: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  sceneCount: z.coerce.number().int().min(4).max(8).optional(),
  aspect: z.enum(ASPECT_RATIOS).optional(),
  targetDurationSec: z.coerce.number().int().min(20).max(180).optional(),
  llmProvider: z.enum(LLM_PROVIDERS).optional(),
  llmModel: z.string().trim().max(100).optional().nullable(),
  criticProvider: z.enum(LLM_PROVIDERS).optional().nullable(),
  criticModel: z.string().trim().max(100).optional().nullable(),
  videoProvider: z.enum(VIDEO_PROVIDER_VALUES).optional(),
  videoModel: z.string().trim().max(100).optional().nullable(),
  useCritic: z.coerce.boolean().optional(),
});

export type ProjectSettingsInput = z.infer<typeof projectSettingsSchema>;

/** Saving (or replacing) a pasted provider key. */
export const credentialSaveSchema = z.object({
  provider: z.enum(CREDENTIAL_PROVIDERS),
  apiKey: z
    .string()
    .trim()
    .min(10, { error: "API keys are longer than that." })
    .max(500),
  label: z.string().trim().max(60).optional().nullable(),
});

export type CredentialSaveInput = z.infer<typeof credentialSaveSchema>;

/** Editable scene fields from the storyboard UI. */
export const scenePatchSchema = z.object({
  title: z.string().trim().min(1, { error: "Scenes need a title." }).optional(),
  visualPrompt: z
    .string()
    .trim()
    .min(10, { error: "The visual prompt should be a full sentence or more." })
    .max(12_000)
    .optional(),
  cameraAngle: z.string().trim().max(500).optional().nullable(),
  voiceoverText: z.string().trim().max(2000).optional().nullable(),
  narrationStartSec: z.coerce.number().min(0).max(60).optional(),
  narrationEndSec: z.coerce.number().min(0).max(120).optional(),
  durationSec: z.coerce
    .number()
    .int()
    .min(2, { error: "Scene clips are 2–20 seconds." })
    .max(20)
    .optional(),
  onscreenText: z.array(z.string().trim().max(200)).optional(),
  groundingElements: z.array(z.string().trim().max(200)).optional(),
  noLipSyncNote: z.string().trim().max(500).optional().nullable(),
  /** Editor visibility only; never hides the scene from the storyboard. */
  hiddenInEditor: z.boolean().optional(),
});

export type ScenePatchInput = z.infer<typeof scenePatchSchema>;

/** Keep user-entered narration timings sane when applied to a scene. */
export function clampNarration(input: {
  narrationStartSec?: number;
  narrationEndSec?: number;
  durationSec?: number;
}) {
  const duration = input.durationSec ?? 10;
  const start = Math.max(0, Math.min(input.narrationStartSec ?? 1, duration - 0.5));
  const end = Math.max(start + 0.5, Math.min(input.narrationEndSec ?? 8.5, duration));
  return { narrationStartSec: start, narrationEndSec: Math.min(end, duration) };
}