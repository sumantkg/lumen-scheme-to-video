import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { clipProviderReadiness } from "@/lib/pipeline/clips";
import { enqueueTask, setProjectStage } from "@/lib/pipeline/queue";
import { triggerQueueDrain } from "@/lib/pipeline/runner";

import { isProviderName } from "@/lib/providers";

/**
 * Start (or retry) scene-clip rendering.
 *
 *   POST /api/projects/[id]/clips            → every scene without a clip
 *   POST /api/projects/[id]/clips {sceneId}   → re-render one scene
 *
 * Each scene becomes its own `generate_clip` task so a single slow or failing
 * shot does not block the rest. The provider's key is checked before anything
 * is queued, so a missing key is a clear 422 rather than a wall of failures.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const limited = enforceRateLimit(`generate:${user.id}`, RATE_LIMITS.generate);
  if (limited) return limited;

  const project = await prisma.videoProject.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let body: { sceneId?: unknown; force?: unknown; videoProvider?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const sceneId = typeof body.sceneId === "string" ? body.sceneId : null;
  const force = Boolean(body.force);

  if (typeof body.videoProvider === "string" && isProviderName(body.videoProvider)) {
    await prisma.videoProject.update({
      where: { id },
      data: { videoProvider: body.videoProvider },
    });
    project.videoProvider = body.videoProvider;
  }

  const scenes = await prisma.scene.findMany({
    where: { projectId: id, editorOnly: false },
    orderBy: { index: "asc" },
  });
  if (scenes.length === 0) {
    return NextResponse.json(
      { error: "Generate the storyboard before rendering clips." },
      { status: 422 }
    );
  }

  let targets = scenes;
  if (sceneId) {
    const scene = scenes.find((row) => row.id === sceneId);
    if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });
    targets = [scene];
  } else {
    targets = scenes.filter((scene) => !scene.clipKey);
  }

  if (targets.length === 0) {
    return NextResponse.json({ queued: 0, message: "Every scene already has a clip." });
  }

  const readiness = await clipProviderReadiness({
    userId: user.id,
    videoProvider: project.videoProvider,
  });
  if (!readiness.ready) {
    return NextResponse.json({ error: readiness.reason }, { status: 422 });
  }

  await prisma.videoProject.update({ where: { id }, data: { error: null } });
  await setProjectStage(id, {
    status: "generating_media",
    stage: sceneId ? "Re-rendering the scene…" : `Rendering ${targets.length} scene clips…`,
  });

  if (sceneId) {
    await prisma.scene.updateMany({
      where: {
        projectId: id,
        id: { not: sceneId },
        error: { not: null },
      },
      data: { status: "failed" },
    });
  }

  await prisma.scene.updateMany({
    where: { id: { in: targets.map((s) => s.id) } },
    data: { status: "generating", error: null },
  });

  await Promise.all(
    targets.map((scene) =>
      enqueueTask({
        projectId: id,
        kind: "generate_clip",
        sceneId: scene.id,
        priority: 30,
        payload: { force },
      })
    )
  );

  triggerQueueDrain();

  return NextResponse.json({ queued: targets.length });
}
