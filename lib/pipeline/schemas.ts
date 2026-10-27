import { z } from "zod";

/**
 * Zod schemas for the LLM's storyboard and critic outputs. Loose where the
 * model varies, strict where downstream code depends on a value.
 */

export const sceneSchema = z.object({
  scene_number: z.number().int().min(1),
  scene_title: z.string().trim().min(1),
  duration_seconds: z.coerce.number().positive().default(9),
  visual_prompt: z.string().trim().min(10),
  camera_angle: z.string().trim().default(""),
  voiceover_bengali: z.string().trim().default(""),
  narration_start_second: z.coerce.number().default(1),
  narration_end_second: z.coerce.number().default(8),
  onscreen_text: z.array(z.string()).default([]),
  wb_grounding_elements: z.array(z.string()).default([]),
  no_lip_sync_enforcement: z.string().trim().default(""),
});

export type SceneDto = z.infer<typeof sceneSchema>;

export const projectPlanSchema = z.object({
  is_valid_scheme: z.coerce.boolean().default(true),
  error_message: z.string().nullable().optional(),
  scheme_title: z.string().trim().default("Government Scheme Video"),
  total_duration_seconds: z.coerce.number().optional(),
  global_guidelines: z.string().trim().default(""),
  detected_grounding_references: z.array(z.string()).default([]),
  // Optional so a refusal (is_valid_scheme=false + error_message) still
  // parses; a storyboard that claims validity but sends no scenes is caught
  // below in generateScenePlan.
  scenes: z.array(sceneSchema).min(4, { error: "A storyboard needs at least 4 scenes." }).optional(),
});

export type ProjectPlanDto = z.infer<typeof projectPlanSchema>;

export const criticIssueSchema = z.object({
  scene_number: z.number().int().nullable().optional(),
  category: z.string().default("other"),
  severity: z.enum(["info", "warning", "error"]).catch("warning"),
  description: z.string().default(""),
  resolution: z.string().default(""),
});

export const criticAuditSchema = z.object({
  compliance_score: z.coerce.number().default(0),
  passed_checks: z.coerce.boolean().default(false),
  summary_notes: z.string().trim().default(""),
  issues_found: z.array(criticIssueSchema).default([]),
  refined_scenes: z.array(sceneSchema).optional(),
});

export type CriticAuditDto = z.infer<typeof criticAuditSchema>;

/** Human count of scenes the worker should produce (default 6). */
export function clampSceneCount(value: number): number {
  return Math.min(8, Math.max(4, Math.round(value)));
}