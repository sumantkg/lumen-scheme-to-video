import { generateJson } from "@/lib/llm/client";
import { buildCriticSystemPrompt, buildCriticUserPrompt, formatRichVisualPrompt, promptSettings } from "./prompts";
import { clampTiming, serializeScenesForCritic } from "./scene-generator";
import { criticAuditSchema, type CriticAuditDto, type SceneDto } from "./schemas";

/**
 * Stage 3: the AI Critic audits the storyboard against the guardrails and
 * refines it. Loops up to three times, feeding previous audit results back so
 * the model is told exactly what to fix.
 */

export interface CriticAuthorization {
  provider: "gemini" | "openai";
  apiKey: string;
  model?: string | null;
  apiBase?: string;
  timeoutMs?: number;
}

export interface CriticIssueResult {
  sceneNumber: number | null;
  category: string;
  severity: "info" | "warning" | "error";
  description: string;
  resolution: string;
}

export interface CriticResult {
  scenes: SceneDto[];
  complianceScore: number;
  passed: boolean;
  summary: string;
  issues: CriticIssueResult[];
}

export interface CriticInput extends CriticAuthorization {
  scenes: SceneDto[];
  schemeTitle: string;
  globalGuidelines: string;
  groundingReferences: string[];
  schemeText: string;
  groundingNotes?: string | null;
  language?: string | null;
  tone?: string | null;
  region?: string | null;
  sceneCount?: number | null;
  aspect?: string | null;
}

function toIssue(issue: { scene_number?: number | null; category: string; severity: string; description: string; resolution: string }): CriticIssueResult {
  return {
    sceneNumber: issue.scene_number ?? null,
    category: issue.category,
    severity: issue.severity === "error" || issue.severity === "info" ? issue.severity : "warning",
    description: issue.description,
    resolution: issue.resolution,
  };
}

export async function runCritic(input: CriticInput): Promise<CriticResult> {
  const settings = promptSettings({
    language: input.language,
    tone: input.tone,
    region: input.region,
    sceneCount: input.sceneCount ?? input.scenes.length,
    aspect: input.aspect ?? "16:9",
  });
  const systemPrompt = buildCriticSystemPrompt(settings);

  let currentScenes = input.scenes;
  let lastAudit: CriticAuditDto | null = null;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const planJson = serializeScenesForCritic(currentScenes, {
      schemeTitle: input.schemeTitle,
      globalGuidelines: input.globalGuidelines,
      groundingReferences: input.groundingReferences,
    });

    let userPrompt = buildCriticUserPrompt({
      schemeText: input.schemeText.trim(),
      groundingNotes: input.groundingNotes,
      currentPlanJson: planJson,
    });

    if (iteration > 0 && lastAudit) {
      userPrompt += `\n\nPREVIOUS AUDIT RESULTS (You must fix these issues in this iteration):\n${JSON.stringify(
        lastAudit,
        null,
        2
      )}`;
    }

    let parsed: CriticAuditDto;
    try {
      const raw = await generateJson({
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model ?? undefined,
        systemPrompt,
        userPrompt,
        jsonMode: true,
        apiBase: input.apiBase,
        timeoutMs: input.timeoutMs,
      });
      parsed = criticAuditSchema.parse(raw);
      lastAudit = parsed;
    } catch (error) {
      // A transient parse failure shouldn't lose the storyboard — the caller
      // keeps the last-good scenes. Only the final iteration rethrows.
      if (iteration === 2) {
        throw new Error(
          `Critic agent failed after three attempts: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      continue;
    }

    if (parsed.refined_scenes && parsed.refined_scenes.length > 0) {
      const refinedMap = new Map(parsed.refined_scenes.map((s) => [s.scene_number, s]));
      currentScenes = currentScenes.map((origScene) => {
        const refined = refinedMap.get(origScene.scene_number);
        if (!refined) return origScene;
        const clamped = clampTiming(refined);
        const richPrompt = formatRichVisualPrompt(
          {
            scene_title: clamped.scene_title,
            visual_prompt: clamped.visual_prompt,
            camera_angle: clamped.camera_angle,
            voiceover_bengali: clamped.voiceover_bengali,
            onscreen_text: clamped.onscreen_text,
            wb_grounding_elements: clamped.wb_grounding_elements,
            no_lip_sync_enforcement: clamped.no_lip_sync_enforcement,
          },
          {
            region: settings.region,
            aspect: settings.aspect,
            languageLabel: settings.languageLabel,
            additionalNotes: input.groundingNotes,
            persona: settings.persona,
          }
        );
        return {
          ...clamped,
          visual_prompt: richPrompt,
        };
      });
    }

    if (parsed.passed_checks) break;
  }

  return {
    scenes: currentScenes,
    complianceScore: Math.max(0, Math.min(100, Math.round(lastAudit?.compliance_score ?? 0))),
    passed: Boolean(lastAudit?.passed_checks),
    summary: lastAudit?.summary_notes ?? "Audit completed.",
    issues: (lastAudit?.issues_found ?? []).map(toIssue),
  };
}