import { prisma } from "@/lib/db";
import type {
  Asset as AssetRow,
  Scene as SceneRow,
  VideoProject as ProjectRow,
} from "@/lib/generated/prisma/client";
import { parseStringArray } from "./pipeline/serialize";
import { probeVideo } from "./providers/ffmpeg";
import { getStorage } from "./storage";
import { rm } from "fs/promises";

/**
 * Read models for projects and scenes. Storage keys stay server-side — clients
 * get booleans and stream media through the authenticated asset/job routes.
 */

export interface SceneView {
  id: string;
  index: number;
  title: string;
  /** Planned/scripted scene length, in seconds. */
  durationSec: number;
  /** Measured length of the rendered clip, when one exists. */
  clipDurationSec: number | null;
  visualPrompt: string;
  cameraAngle: string | null;
  voiceoverText: string | null;
  narrationStartSec: number;
  narrationEndSec: number;
  onscreenText: string[];
  groundingElements: string[];
  noLipSyncNote: string | null;
  status: string;
  hasImage: boolean;
  hasClip: boolean;
  hasAudio: boolean;
  error: string | null;
  /** Imported in the video editor and deliberately kept off the storyboard. */
  editorOnly: boolean;
  /** Hidden from the editor media panel but still part of the storyboard. */
  hiddenInEditor: boolean;
  /** Grounding or first_frame image reference attached to this scene. */
  reference?: {
    id: string;
    assetId: string;
    filename: string;
    mime: string;
    url: string;
  } | null;
}

export interface AssetView {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  createdAt: string;
}

export interface CriticIssueView {
  id: string;
  sceneIndex: number | null;
  category: string;
  severity: string;
  description: string;
  resolution: string;
}

export interface ProjectView {
  id: string;
  title: string;
  status: string;
  stage: string | null;
  progress: number;
  error: string | null;
  sceneCount: number;
  language: string;
  tone: string;
  region: string | null;
  schemeTitle: string | null;
  complianceScore: number | null;
  criticPassed: boolean | null;
  criticSummary: string | null;
  aspect: string;
  targetDurationSec: number;
  hasFinalVideo: boolean;
  hasPoster: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetailView extends ProjectView {
  scenes: SceneView[];
  assets: AssetView[];
  issues: CriticIssueView[];
  schemeText: string | null;
  globalGuidelines: string | null;
  groundingReferences: string[];
  llmProvider: string;
  llmModel: string | null;
  criticProvider: string | null;
  criticModel: string | null;
  videoProvider: string;
  videoModel: string | null;
  useCritic: boolean;
  editorDoc?: unknown;
}

export function toSceneView(
  scene: SceneRow,
  clipDurationSec: number | null = null
): SceneView {
  return {
    id: scene.id,
    index: scene.index,
    title: scene.title,
    durationSec: scene.durationSec,
    clipDurationSec,
    visualPrompt: scene.visualPrompt,
    cameraAngle: scene.cameraAngle,
    voiceoverText: scene.voiceoverText,
    narrationStartSec: scene.narrationStartSec,
    narrationEndSec: scene.narrationEndSec,
    onscreenText: parseStringArray(scene.onscreenText),
    groundingElements: parseStringArray(scene.groundingElements),
    noLipSyncNote: scene.noLipSyncNote,
    status: scene.status,
    hasImage: Boolean(scene.imageKey),
    hasClip: Boolean(scene.clipKey),
    hasAudio: Boolean(scene.audioKey),
    error: scene.error,
    editorOnly: scene.editorOnly,
    hiddenInEditor: scene.hiddenInEditor,
  };
}

function toProjectView(project: ProjectRow): ProjectView {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    stage: project.stage,
    progress: project.progress,
    error: project.error,
    sceneCount: project.sceneCount,
    language: project.language,
    tone: project.tone ?? "formal_broadcaster",
    region: project.region,
    schemeTitle: project.schemeTitle,
    complianceScore: project.complianceScore,
    criticPassed: project.criticPassed,
    criticSummary: project.criticSummary,
    aspect: project.aspect,
    targetDurationSec: project.targetDurationSec,
    hasFinalVideo: Boolean(project.finalOutputKey),
    hasPoster: Boolean(project.finalThumbKey),
    notes: project.notes,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Newest-first page of the user's projects. */
export async function listProjectsForUser(userId: string, limit = 60): Promise<ProjectView[]> {
  const projects = await prisma.videoProject.findMany({
    where: { userId, isDemo: false },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return projects.map(toProjectView);
}

/**
 * Probe each rendered clip so the editor can trim against the media it will
 * actually stitch. Planned `durationSec` is the script length, which providers
 * may not honour exactly (and demo clips may be shorter).
 */
async function getClipDurations(scenes: SceneRow[]): Promise<Map<string, number>> {
  const storage = getStorage();
  const durations = await Promise.all(
    scenes.map(async (scene) => {
      if (!scene.clipKey) return null;
      try {
        const probe = await probeVideo(storage.localPath(scene.clipKey));
        const duration = probe?.durationSeconds;
        return duration && Number.isFinite(duration) && duration > 0
          ? ({ id: scene.id, duration } as const)
          : null;
      } catch {
        return null;
      }
    })
  );

  return new Map(
    durations
      .filter((entry): entry is { id: string; duration: number } => entry !== null)
      .map((entry) => [entry.id, entry.duration])
  );
}

/**
 * Full project view for the storyboard page or the video editor.
 *
 * The storyboard intentionally excludes editor-only imports. The editor also
 * receives hidden storyboard scenes so it can offer a "restore" affordance.
 */
export async function getProjectForUser(
  userId: string,
  id: string,
  options: { withClipDurations?: boolean; view?: "storyboard" | "editor" } = {}
): Promise<ProjectDetailView | null> {
  const project = await prisma.videoProject.findFirst({ where: { id, userId } });
  if (!project) return null;

  const editorView = options.view === "editor";
  const [scenes, assets, issues] = await Promise.all([
    prisma.scene.findMany({
      where: editorView ? { projectId: id } : { projectId: id, editorOnly: false },
      include: {
        references: {
          include: { asset: true },
        },
      },
      orderBy: [{ index: "asc" }, { createdAt: "asc" }],
    }),
    prisma.asset.findMany({
      where: editorView ? { projectId: id } : { projectId: id, editorOnly: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.criticIssue.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  if (editorView) {
    scenes.sort(
      (a, b) =>
        Number(a.editorOnly) - Number(b.editorOnly) ||
        a.index - b.index ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  const clipDurations = options.withClipDurations
    ? await getClipDurations(scenes)
    : new Map<string, number>();

  let editorDoc: unknown = null;
  if (editorView) {
    try {
      const storage = getStorage();
      const editorKey = `projects/${id}/editor.json`;
      if (await storage.exists(editorKey)) {
        const raw = await storage.read(editorKey);
        editorDoc = JSON.parse(raw.toString("utf-8"));
      }
    } catch {
      editorDoc = null;
    }
  }

  return {
    ...toProjectView(project),
    editorDoc,
    scenes: scenes.map((scene) => {
      const primaryRef = scene.references?.find((r) => r.asset.mime.startsWith("image/"));
      const reference = primaryRef
        ? {
            id: primaryRef.id,
            assetId: primaryRef.assetId,
            filename: primaryRef.asset.filename,
            mime: primaryRef.asset.mime,
            url: `/api/assets/${primaryRef.assetId}`,
          }
        : null;
      return {
        ...toSceneView(scene, clipDurations.get(scene.id) ?? null),
        reference,
      };
    }),
    assets: assets.map(toAssetView),
    issues: issues.map(toCriticIssueView),
    schemeText: project.schemeText,
    globalGuidelines: project.globalGuidelines,
    groundingReferences: (() => {
      try {
        const parsed: unknown = JSON.parse(project.groundingReferences ?? "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
    llmProvider: project.llmProvider,
    llmModel: project.llmModel,
    criticProvider: project.criticProvider ?? null,
    criticModel: project.criticModel ?? null,
    videoProvider: project.videoProvider,
    videoModel: project.videoModel,
    useCritic: project.useCritic,
  };
}

export function toCriticIssueView(issue: {
  id: string;
  sceneIndex: number | null;
  category: string;
  severity: string;
  description: string;
  resolution: string;
}): CriticIssueView {
  return {
    id: issue.id,
    sceneIndex: issue.sceneIndex,
    category: issue.category,
    severity: issue.severity,
    description: issue.description,
    resolution: issue.resolution,
  };
}

export function toAssetView(asset: AssetRow): AssetView {
  return {
    id: asset.id,
    kind: asset.kind,
    filename: asset.filename,
    mime: asset.mime,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    durationSec: asset.durationSec,
    createdAt: asset.createdAt.toISOString(),
  };
};

/** Final rendered media keys, scoped by user. Null when the project has none. */
export async function getProjectMediaKeys(
  userId: string,
  id: string
): Promise<{ finalOutputKey: string | null; finalThumbKey: string | null } | null> {
  return prisma.videoProject.findFirst({
    where: { id, userId },
    select: { finalOutputKey: true, finalThumbKey: true },
  });
}

/** Scene clip/audio keys for a project owned by `userId`. */
export async function getSceneMediaKeys(
  userId: string,
  projectId: string,
  sceneId: string
): Promise<
  | { clipKey: string | null; audioKey: string | null; imageKey: string | null }
  | null
> {
  return prisma.scene.findFirst({
    where: { id: sceneId, project: { id: projectId, userId } },
    select: { clipKey: true, audioKey: true, imageKey: true },
  });
}

/** Delete a project and its rows. Also removes the project's storage folder. */
export async function deleteProjectForUser(
  userId: string,
  id: string
): Promise<boolean> {
  const removed = await prisma.videoProject.deleteMany({ where: { id, userId } });
  await rm(`storage/projects/${id}`, { recursive: true, force: true }).catch(() => {});
  return removed.count > 0;
}
