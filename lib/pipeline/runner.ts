import { prisma } from "@/lib/db";
import { getDecryptedKey } from "@/lib/credentials";
import { extractTextFromBytes } from "@/lib/documents/parse";
import type { LlmImagePart } from "@/lib/llm/types";
import { getStorage, projectPrefix } from "@/lib/storage";
import { isAspectRatio } from "@/lib/providers/types";
import { buildSceneClipPrompt, collectSceneReferences, resolveClipProvider } from "./clips";
import { generateScenePlan } from "./scene-generator";
import { runCritic } from "./critic";
import {
  claimNextTask,
  completeTask,
  enqueueTask,
  failProject,
  failTask,
  recomputeProjectProgress,
  setProjectStage,
  setTaskProgress,
  taskPayload,
} from "./queue";
import type { PipelineTask } from "./queue";
import type { SceneDto } from "./schemas";
import { parseStringArray } from "./serialize";

export type ProcessOutcome = "idle" | "done" | "failed";

function providerOf(project: { llmProvider: string }): "gemini" | "openai" {
  return project.llmProvider === "openai" ? "openai" : "gemini";
}

function infoError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

function parseReferences(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function requireProject(task: PipelineTask) {
  const project = await prisma.videoProject.findFirst({
    where: { id: task.projectId },
  });
  if (!project) throw new Error("Project not found.");
  return project;
}

async function handleExtractText(task: PipelineTask): Promise<void> {
  const project = await requireProject(task);
  const assetId = project.documentAssetId;
  if (!assetId) throw new Error("Document asset ID not set.");
  const asset = await prisma.asset.findFirst({
    where: { id: assetId },
  });
  if (!asset) throw new Error("Document asset not found.");

  const storage = getStorage();
  const bytes = await storage.read(asset.storageKey);
  const text = await extractTextFromBytes(bytes, asset.filename);

  await prisma.videoProject.update({
    where: { id: project.id },
    data: {
      schemeText: text,
      status: "generating_scenes",
      stage: "Extracting document…",
    },
  });
  await enqueueTask({ projectId: project.id, kind: "generate_scenes", priority: 10 });
}

async function handleGenerateScenes(task: PipelineTask): Promise<void> {
  const project = await requireProject(task);

  const schemeText = project.schemeText?.trim();
  if (!schemeText) throw new Error("The project has no scheme text yet.");

  const provider = providerOf(project);
  const apiKey = await getDecryptedKey(project.userId, provider);
  if (!apiKey) {
    throw new Error(
      `No ${provider} API key configured for this user. Add one in Settings → API keys.`
    );
  }

  await prisma.videoProject.update({
    where: { id: project.id },
    data: {
      status: "generating_scenes",
      stage: "Drafting scene prompts…",
      progress: 8,
    },
  });

  const groundingAssets = await prisma.asset.findMany({
    where: { projectId: project.id, kind: "grounding_image" },
  });
  const storage = getStorage();
  const images: LlmImagePart[] = [];
  const imageFilenames: string[] = [];
  for (const asset of groundingAssets) {
    try {
      const bytes = await storage.read(asset.storageKey);
      images.push({
        mimeType: asset.mime,
        base64: bytes.toString("base64"),
      });
      imageFilenames.push(asset.filename);
    } catch {
      // Ignore unreadable optional grounding images
    }
  }

  const plan = await generateScenePlan({
    provider,
    apiKey,
    model: project.llmModel,
    schemeText,
    images: images.length > 0 ? images : undefined,
    imageFilenames: imageFilenames.length > 0 ? imageFilenames : undefined,
    additionalNotes: project.notes,
    language: project.language,
    region: project.region,
    sceneCount: project.sceneCount,
    aspect: project.aspect,
  });

  // Persist scenes in parallel
  await prisma.scene.deleteMany({
    where: { projectId: project.id, editorOnly: false },
  });
  await Promise.all(
    plan.scenes.map((s, i) =>
      prisma.scene.create({
        data: {
          projectId: project.id,
          index: i + 1,
          title: s.scene_title,
          durationSec: s.duration_seconds,
          visualPrompt: s.visual_prompt,
          cameraAngle: s.camera_angle,
          voiceoverText: s.voiceover_bengali ?? null,
          narrationStartSec: s.narration_start_second,
          narrationEndSec: s.narration_end_second,
          onscreenText: JSON.stringify(s.onscreen_text ?? []),
          groundingElements: JSON.stringify(s.wb_grounding_elements ?? []),
          noLipSyncNote: s.no_lip_sync_enforcement,
        },
      })
    )
  );

  await prisma.videoProject.update({
    where: { id: project.id },
    data: {
      schemeTitle: plan.schemeTitle,
      globalGuidelines: plan.globalGuidelines,
      groundingReferences: JSON.stringify(plan.detectedGroundingReferences),
      status: project.useCritic ? "auditing" : "scenes_ready",
      stage: project.useCritic ? "AI Critic auditing scenes…" : "Storyboard ready",
      progress: project.useCritic ? 15 : 25,
    },
  });

  if (project.useCritic) {
    await enqueueTask({ projectId: project.id, kind: "run_critic", priority: 20 });
  }
}

async function handleRunCritic(task: PipelineTask): Promise<void> {
  const project = await requireProject(task);

  const provider: "gemini" | "openai" =
    project.criticProvider === "openai" ? "openai" : project.criticProvider === "gemini" ? "gemini" : providerOf(project);
  const model = project.criticModel || project.llmModel;
  const apiKey = await getDecryptedKey(project.userId, provider);
  if (!apiKey) {
    throw new Error(
      `No ${provider} API key configured for the AI Critic agent. Add one in Settings → API keys.`
    );
  }

  const scenes = await prisma.scene.findMany({
    where: { projectId: project.id, editorOnly: false },
    orderBy: { index: "asc" },
  });

  if (scenes.length === 0) {
    throw new Error("No scenes found to audit.");
  }

  const sceneDtos: SceneDto[] = scenes.map((s) => ({
    scene_number: s.index,
    scene_title: s.title,
    duration_seconds: s.durationSec,
    visual_prompt: s.visualPrompt,
    camera_angle: s.cameraAngle ?? "",
    voiceover_bengali: s.voiceoverText ?? "",
    narration_start_second: s.narrationStartSec,
    narration_end_second: s.narrationEndSec,
    onscreen_text: parseStringArray(s.onscreenText),
    wb_grounding_elements: parseStringArray(s.groundingElements),
    no_lip_sync_enforcement: s.noLipSyncNote ?? "",
  }));

  const result = await runCritic({
    provider,
    apiKey,
    model,
    scenes: sceneDtos,
    schemeTitle: project.schemeTitle ?? project.title,
    globalGuidelines: project.globalGuidelines ?? "",
    groundingReferences: parseReferences(project.groundingReferences),
    schemeText: project.schemeText ?? "",
    groundingNotes: project.notes,
    language: project.language,
    region: project.region,
    sceneCount: project.sceneCount,
    aspect: project.aspect,
  });

  await prisma.criticIssue.deleteMany({ where: { projectId: project.id } });
  for (const issue of result.issues) {
    await prisma.criticIssue.create({
      data: {
        projectId: project.id,
        category: issue.category,
        severity: issue.severity,
        description: issue.description,
        resolution: issue.resolution,
        sceneIndex: issue.sceneNumber,
      },
    });
  }

  if (result.scenes) {
    for (const refined of result.scenes) {
      const matching = scenes.find((s) => s.index === refined.scene_number);
      if (matching) {
        await prisma.scene.update({
          where: { id: matching.id },
          data: {
            title: refined.scene_title,
            visualPrompt: refined.visual_prompt,
            cameraAngle: refined.camera_angle,
            voiceoverText: refined.voiceover_bengali,
            narrationStartSec: refined.narration_start_second,
            narrationEndSec: refined.narration_end_second,
            onscreenText: JSON.stringify(refined.onscreen_text ?? []),
            groundingElements: JSON.stringify(refined.wb_grounding_elements ?? []),
            noLipSyncNote: refined.no_lip_sync_enforcement,
          },
        });
      }
    }
  }

  await prisma.videoProject.update({
    where: { id: project.id },
    data: {
      status: "scenes_ready",
      stage: "Storyboard audited and ready",
      progress: 25,
      complianceScore: result.complianceScore,
      criticPassed: result.passed,
      criticSummary: result.summary,
    },
  });
}

async function handleGenerateClip(task: PipelineTask): Promise<void> {
  const project = await requireProject(task);
  if (!task.sceneId) throw new Error("generate_clip requires a scene.");

  const scene = await prisma.scene.findFirst({
    where: { id: task.sceneId, projectId: project.id },
  });
  if (!scene) throw new Error("The scene for this clip no longer exists.");

  const payload = taskPayload(task) as { force?: boolean } | null;
  if (scene.clipKey && !payload?.force) {
    await setTaskProgress(task.id, 100);
    return;
  }

  const total = await prisma.scene.count({
    where: { projectId: project.id, editorOnly: false },
  });
  await prisma.scene.update({
    where: { id: scene.id },
    data: { status: "generating", error: null },
  });
  await setProjectStage(project.id, {
    status: "generating_media",
    stage: `Rendering scene ${scene.index} of ${total}…`,
  });
  await setTaskProgress(task.id, 3);

  try {
    const { provider } = await resolveClipProvider({
      userId: project.userId,
      videoProvider: project.videoProvider,
      videoModel: project.videoModel,
    });

    const references = await collectSceneReferences({
      sceneId: scene.id,
      projectId: project.id,
    });

    const output = await provider.render(
      {
        jobId: `${project.id}:${scene.id}`,
        prompt: buildSceneClipPrompt(scene, project),
        aspect: isAspectRatio(project.aspect) ? project.aspect : "16:9",
        durationSeconds: scene.durationSec,
        references,
      },
      (progress) => setTaskProgress(task.id, 5 + Math.round(progress * 0.9))
    );

    const prefix = projectPrefix(project.id);
    const clipKey = `${prefix}/scene-${scene.index}.mp4`;
    const posterKey = `${prefix}/scene-${scene.index}.jpg`;

    try {
      await getStorage().putFile(output.videoPath, clipKey);
      if (output.thumbPath) {
        await getStorage().putFile(output.thumbPath, posterKey);
      }
    } finally {
      await output.cleanup?.();
    }

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        clipKey,
        imageKey: output.thumbPath ? posterKey : scene.imageKey,
        status: "clip_ready",
        clipProviderJobId: output.providerJobId ?? null,
      },
    });
  } catch (error) {
    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "failed", error: infoError(error) },
    });
    throw error;
  }
}

export async function processOneTask(): Promise<ProcessOutcome> {
  const task = await claimNextTask();
  if (!task) return "idle";

  try {
    switch (task.kind) {
      case "extract_text":
        await handleExtractText(task);
        break;
      case "generate_scenes":
        await handleGenerateScenes(task);
        break;
      case "run_critic":
        await handleRunCritic(task);
        break;
      case "generate_clip":
        await handleGenerateClip(task);
        break;
      default:
        throw new Error(`Pipeline stage "${task.kind}" is not wired up yet.`);
    }

    await completeTask(task.id);
    await recomputeProjectProgress(task.projectId);
    return "done";
  } catch (error) {
    const message = infoError(error);
    console.error(`[pipeline] task ${task.id} (${task.kind}) failed:`, message);
    await failTask(task.id, message);
    await failProject(task.projectId, message);
    return "failed";
  }
}

let draining = false;

/**
 * Triggers an asynchronous, non-blocking drain of queued tasks in the background.
 * Ensures the pipeline makes progress even if a dedicated worker process is not running.
 */
export function triggerQueueDrain(): void {
  if (draining) return;
  draining = true;
  (async () => {
    try {
      while (true) {
        const outcome = await processOneTask();
        if (outcome === "idle" || outcome === "failed") break;
      }
    } catch (err) {
      console.error("[pipeline] background task drain error:", err);
    } finally {
      draining = false;
    }
  })();
}