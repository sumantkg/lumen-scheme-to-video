import { generateJson } from "@/lib/llm/client";
import type { LlmImagePart } from "@/lib/llm/types";
import { buildSceneSystemPrompt, buildSceneUserPrompt, formatRichVisualPrompt, promptSettings } from "./prompts";
import { clampSceneCount, projectPlanSchema, type SceneDto } from "./schemas";

/**
 * Stage 2 of the pipeline: turn the scheme document into a storyboard via an
 * LLM. Ported from the reference Python implementation, language/region taken
 * from the project settings.
 */

export interface ScenePlanInput {
  provider: "gemini" | "openai";
  apiKey: string;
  model?: string | null;
  schemeText: string;
  /** Multimodal grounding photos / native PDFs sent alongside the text. */
  images?: LlmImagePart[];
  imageFilenames?: string[];
  additionalNotes?: string | null;
  language?: string | null;
  tone?: string | null;
  region?: string | null;
  sceneCount?: number | null;
  aspect?: string | null;
  apiBase?: string;
  timeoutMs?: number;
}

export interface ScenePlan {
  schemeTitle: string;
  totalDurationSeconds: number;
  globalGuidelines: string;
  detectedGroundingReferences: string[];
  scenes: SceneDto[];
}

/**
 * Programmatic guardrail on top of whatever the model said: narration must
 * start ≥ 1.0s and end ≥ 1.5s before the scene ends (clean stitching).
 */
export function clampTiming(scene: SceneDto): SceneDto {
  const duration = Math.max(2, scene.duration_seconds);
  const start = Math.max(1.0, scene.narration_start_second);
  const end = Math.min(Math.max(start + 0.5, scene.narration_end_second), duration - 1.5);
  return {
    ...scene,
    duration_seconds: duration,
    narration_start_second: start,
    narration_end_second: end,
  };
}

export async function generateScenePlan(input: ScenePlanInput): Promise<ScenePlan> {
  const schemeText = input.schemeText.trim();
  if (schemeText.length < 30) {
    throw new Error(
      "Scheme document text is missing or too short. Upload a document or paste the scheme details."
    );
  }

  const settings = promptSettings({
    language: input.language,
    tone: input.tone,
    region: input.region,
    sceneCount: input.sceneCount ?? 6,
    aspect: input.aspect ?? "16:9",
  });

  const systemPrompt = buildSceneSystemPrompt(settings);
  const userPrompt = buildSceneUserPrompt({
    schemeText,
    additionalNotes: input.additionalNotes,
    images: input.imageFilenames?.map((filename) => ({ filename })) ?? [],
    languageLabel: settings.languageLabel,
    region: settings.region,
    sceneCount: settings.sceneCount,
    aspect: settings.aspect,
    persona: settings.persona,
  });

  const raw = await generateJson({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model ?? undefined,
    systemPrompt,
    userPrompt,
    images: input.images,
    jsonMode: true,
    apiBase: input.apiBase,
    timeoutMs: input.timeoutMs,
  });

  let plan: ReturnType<typeof projectPlanSchema.parse>;
  try {
    plan = projectPlanSchema.parse(raw);
  } catch (error) {
    throw new Error(
      `The model's storyboard did not match the expected schema (${
        error instanceof Error ? error.message : String(error)
      }).`
    );
  }

  if (!plan.is_valid_scheme) {
    throw new Error(
      plan.error_message ||
        "The uploaded text does not appear to be a valid scheme document. Paste the actual scheme details."
    );
  }

  if (!plan.scenes || plan.scenes.length === 0) {
    throw new Error(
      "The model's storyboard did not include any scenes. Try again or shorten the scheme text."
    );
  }

  // If the model produced fewer scenes than requested, attempt a targeted recovery
  if (plan.scenes.length < settings.sceneCount) {
    try {
      const retryUserPrompt = `${userPrompt}\n\nIMPORTANT CORRECTION: You generated ${plan.scenes.length} scenes, but the user explicitly requested EXACTLY ${settings.sceneCount} scenes. You MUST output all ${settings.sceneCount} scenes in the "scenes" array!`;
      const retryRaw = await generateJson({
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model ?? undefined,
        systemPrompt,
        userPrompt: retryUserPrompt,
        images: input.images,
        jsonMode: true,
        apiBase: input.apiBase,
        timeoutMs: input.timeoutMs,
      });
      const retryPlan = projectPlanSchema.parse(retryRaw);
      if (retryPlan.scenes && retryPlan.scenes.length >= settings.sceneCount) {
        plan = retryPlan;
      }
    } catch {
      // Keep existing plan if retry fails
    }
  }

  // Ensure exact scene count by padding or slicing
  let rawScenes = [...(plan.scenes ?? [])];
  if (rawScenes.length < settings.sceneCount) {
    // Synthesize missing scenes so the user ALWAYS receives the exact scene count requested
    const lastScene = rawScenes[rawScenes.length - 1];
    while (rawScenes.length < settings.sceneCount) {
      const nextIndex = rawScenes.length + 1;
      rawScenes.push({
        scene_number: nextIndex,
        scene_title: `Scene ${nextIndex}: Official Portal & Next Steps`,
        duration_seconds: 10,
        visual_prompt: `Create a 10-second photorealistic video scene for ${settings.region} citizens. VISUAL SETTING: Modern administrative centre in ${settings.region}, framed for ${settings.aspect}. VISUAL SEQUENCE: Citizen reviewing official documents and registering on government web portal. CAMERA: Framed in ${settings.aspect}. VISUAL STYLE: Photorealistic documentary.`,
        camera_angle: `Framed for ${settings.aspect}`,
        voiceover_bengali: lastScene ? lastScene.voiceover_bengali : "",
        narration_start_second: 1.0,
        narration_end_second: 8.0,
        onscreen_text: ["Official Portal", "Helpline Desk"],
        wb_grounding_elements: [settings.region],
        no_lip_sync_enforcement: "Documentary voiceover without lip-sync",
      });
    }
  } else if (rawScenes.length > settings.sceneCount) {
    rawScenes = rawScenes.slice(0, settings.sceneCount);
  }

  // Guarantee aspect ratio and user directives reflection in each scene's visual prompt
  const aspectInstruction =
    settings.aspect === "9:16"
      ? "Framed for 9:16 vertical portrait composition."
      : settings.aspect === "1:1"
      ? "Framed for 1:1 square composition."
      : "Framed for 16:9 widescreen composition.";

  const userNotesTrimmed = input.additionalNotes?.trim();

  const scenes = rawScenes.map((scene, idx) => {
    const clamped = clampTiming(scene);
    let prompt = clamped.visual_prompt.trim();

    // Ensure aspect ratio is explicitly mentioned in visual_prompt
    if (
      !prompt.includes(settings.aspect) &&
      !prompt.toLowerCase().includes(settings.aspect === "9:16" ? "vertical" : "widescreen")
    ) {
      prompt = `${prompt} (${aspectInstruction})`;
    }

    // Ensure user custom notes are reflected if provided
    if (
      userNotesTrimmed &&
      !prompt.toLowerCase().includes(userNotesTrimmed.slice(0, 15).toLowerCase())
    ) {
      prompt = `${prompt} [Directive: ${userNotesTrimmed}]`;
    }

    const cameraAngle = clamped.camera_angle
      ? clamped.camera_angle.includes(settings.aspect)
        ? clamped.camera_angle
        : `${clamped.camera_angle} (${settings.aspect})`
      : `Framed for ${settings.aspect}`;

    // Guarantee full detailed multi-section structure (audio, setting, on-screen text, etc.)
    const richVisualPrompt = formatRichVisualPrompt(
      {
        scene_title: clamped.scene_title,
        visual_prompt: prompt,
        camera_angle: cameraAngle,
        voiceover_bengali: clamped.voiceover_bengali,
        onscreen_text: clamped.onscreen_text,
        wb_grounding_elements: clamped.wb_grounding_elements,
        no_lip_sync_enforcement: clamped.no_lip_sync_enforcement,
      },
      {
        region: settings.region,
        aspect: settings.aspect,
        languageLabel: settings.languageLabel,
        additionalNotes: input.additionalNotes,
        persona: settings.persona,
      }
    );

    return {
      ...clamped,
      scene_number: idx + 1,
      visual_prompt: richVisualPrompt,
      camera_angle: cameraAngle,
    };
  });

  const totalDuration = Number(
    plan.total_duration_seconds ?? scenes.reduce((sum, s) => sum + s.duration_seconds, 0)
  );

  return {
    schemeTitle: plan.scheme_title,
    totalDurationSeconds: Math.max(1, totalDuration),
    globalGuidelines: plan.global_guidelines,
    detectedGroundingReferences: plan.detected_grounding_references,
    scenes,
  };
}

/** Canonical serialization of a scene list for the critic's review payload. */
export function serializeScenesForCritic(scenes: SceneDto[], settings: {
  schemeTitle: string;
  globalGuidelines: string;
  groundingReferences: string[];
}): string {
  return JSON.stringify(
    {
      scheme_title: settings.schemeTitle,
      global_guidelines: settings.globalGuidelines,
      detected_grounding_references: settings.groundingReferences,
      scenes,
    },
    null,
    2
  );
}

export { clampSceneCount };