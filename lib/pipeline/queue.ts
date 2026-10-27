import { prisma } from "@/lib/db";
import { parseStringArray, parseText } from "./serialize";

// Re-exported here (and imported by the runner) so callers don't reach into
// the generated client directly for the queue's unit of work.
import type { PipelineTask } from "@/lib/generated/prisma/client";
export type { PipelineTask };

/**
 * Database-backed pipeline task queue.
 *
 * One row per unit of work. The Next server enqueues, the worker claims and
 * completes — the same compare-and-set ownership hand-off the old RenderJob
 * queue used, generalised to every pipeline stage. Dependencies are expressed
 * by enqueue order + priority: the worker enqueues the follow-up step only
 * after the previous one succeeds.
 */

export type TaskKind =
  | "extract_text"
  | "generate_scenes"
  | "run_critic"
  | "generate_clip"
  | "synthesize_audio"
  | "merge";

export type ProjectStatus =
  | "draft"
  | "generating_scenes"
  | "auditing"
  | "scenes_ready"
  | "generating_media"
  | "clips_ready"
  | "synthesizing_audio"
  | "merging"
  | "ready"
  | "failed";

function infoError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

// ─── Task lifecycle ───────────────────────────────────────────────────────

export async function enqueueTask(params: {
  projectId: string;
  kind: TaskKind;
  sceneId?: string | null;
  priority?: number;
  payload?: unknown;
  maxAttempts?: number;
}): Promise<PipelineTask> {
  // Idempotent: a duplicate of an in-flight or pending step is a no-op.
  const existing = await prisma.pipelineTask.findFirst({
    where: {
      projectId: params.projectId,
      kind: params.kind,
      sceneId: params.sceneId ?? null,
      status: { in: ["queued", "running"] },
    },
  });
  if (existing) return existing;

  return prisma.pipelineTask.create({
    data: {
      projectId: params.projectId,
      sceneId: params.sceneId ?? null,
      kind: params.kind,
      priority: params.priority ?? 0,
      maxAttempts: params.maxAttempts ?? 3,
      payload: params.payload === undefined ? null : JSON.stringify(params.payload),
    },
  });
}

/** Atomically claim the highest-priority queued task. */
export async function claimNextTask() {
  const candidate = await prisma.pipelineTask.findFirst({
    where: { status: "queued" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;

  const claimed = await prisma.pipelineTask.updateMany({
    where: { id: candidate.id, status: "queued" },
    data: {
      status: "running",
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (claimed.count === 0) return null;

  return { ...candidate, status: "running" as const, attempts: candidate.attempts + 1 };
}

export async function setTaskProgress(id: string, progress: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  await prisma.pipelineTask.updateMany({
    where: { id, status: "running" },
    data: { progress: clamped },
  });
}

export async function completeTask(id: string): Promise<void> {
  await prisma.pipelineTask.updateMany({
    where: { id, status: "running" },
    data: { status: "succeeded", progress: 100, finishedAt: new Date() },
  });
}

export async function failTask(id: string, error: string): Promise<void> {
  await prisma.pipelineTask.updateMany({
    where: { id, status: { in: ["queued", "running"] } },
    data: { status: "failed", error: error.slice(0, 1000), finishedAt: new Date() },
  });
}

/** Requeue tasks abandoned by a crash (a second worker must not steal work). */
export async function recoverStuckTasks(staleAfterMs = 30 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const result = await prisma.pipelineTask.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: { status: "queued", progress: 0, startedAt: null },
  });
  return result.count;
}

export async function hasActiveTasks(projectId: string): Promise<boolean> {
  const count = await prisma.pipelineTask.count({
    where: { projectId, status: { in: ["queued", "running"] } },
  });
  return count > 0;
}

// ─── Project lifecycle ────────────────────────────────────────────────────

export async function setProjectStage(
  projectId: string,
  data: { status?: ProjectStatus; stage?: string | null; progress?: number }
): Promise<void> {
  await prisma.videoProject.updateMany({ where: { id: projectId }, data });
}

export async function failProject(projectId: string, error: string): Promise<void> {
  await prisma.videoProject.updateMany({
    where: { id: projectId },
    data: { status: "failed", error: error.slice(0, 1000), stage: null },
  });
}

/** Rough overall-progress estimate for the project header. */
export async function recomputeProjectProgress(projectId: string): Promise<void> {
  const [pending, done] = await Promise.all([
    prisma.pipelineTask.count({ where: { projectId, status: { in: ["queued", "running"] } } }),
    prisma.pipelineTask.count({ where: { projectId, status: "succeeded" } }),
  ]);
  const alive = pending + done;
  if (alive === 0) return;
  const progress = Math.min(95, Math.max(5, Math.round((done / alive) * 95)));
  await setProjectStage(projectId, { progress });
}

// ─── Views ────────────────────────────────────────────────────────────────

export async function taskPayload(task: PipelineTask): Promise<unknown> {
  return parseText(task.payload);
}

export { parseStringArray };

export function infoErrorValue(error: unknown): string {
  return infoError(error);
}