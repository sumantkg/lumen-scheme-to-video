import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { toSceneView } from "@/lib/projects";
import { getStorage } from "@/lib/storage";
import { clampNarration, scenePatchSchema } from "@/lib/validation";

/**
 * Edit one scene, or remove it from the editor.
 *
 *   PATCH  /api/projects/[id]/scenes/[sceneId]
 *   DELETE /api/projects/[id]/scenes/[sceneId]
 *
 * PATCH updates storyboard fields and editor visibility. DELETE hides
 * storyboard scenes and removes editor-only imports. User edits are never
 * silently overwritten later: the pipeline refines only the prompt/narration
 * fields it owns and leaves everything else alone.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await requireUser();
  const { id, sceneId } = await context.params;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId: id, project: { userId: user.id } },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  let body: ReturnType<typeof scenePatchSchema.parse>;
  try {
    body = scenePatchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid scene fields." }, { status: 400 });
  }

  const durationSec = body.durationSec ?? scene.durationSec;
  const timing = clampNarration({
    narrationStartSec: body.narrationStartSec ?? scene.narrationStartSec,
    narrationEndSec: body.narrationEndSec ?? scene.narrationEndSec,
    durationSec,
  });

  const updated = await prisma.scene.update({
    where: { id: scene.id },
    data: {
      title: body.title,
      visualPrompt: body.visualPrompt,
      cameraAngle: body.cameraAngle === undefined ? undefined : body.cameraAngle,
      voiceoverText: body.voiceoverText === undefined ? undefined : body.voiceoverText,
      durationSec,
      narrationStartSec: timing.narrationStartSec,
      narrationEndSec: timing.narrationEndSec,
      onscreenText:
        body.onscreenText === undefined ? undefined : JSON.stringify(body.onscreenText),
      groundingElements:
        body.groundingElements === undefined
          ? undefined
          : JSON.stringify(body.groundingElements),
      noLipSyncNote:
        body.noLipSyncNote === undefined ? undefined : body.noLipSyncNote,
      hiddenInEditor:
        body.hiddenInEditor === undefined ? undefined : body.hiddenInEditor,
    },
  });

  return NextResponse.json({ scene: toSceneView(updated) });
}

/**
 * Remove a scene from the editor media panel.
 *
 * Editor-only imports are deleted along with their stored media. Storyboard
 * scenes are only hidden from the editor — the storyboard is never touched.
 * Timeline instances live in the editor's local document, so clients must drop
 * those instances themselves.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await requireUser();
  const { id, sceneId } = await context.params;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId: id, project: { userId: user.id } },
    select: {
      id: true,
      clipKey: true,
      audioKey: true,
      imageKey: true,
      editorOnly: true,
      hiddenInEditor: true,
    },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  if (!scene.editorOnly) {
    if (!scene.hiddenInEditor) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { hiddenInEditor: true },
      });
    }
    return NextResponse.json({ ok: true, hidden: true });
  }

  const mediaKeys = [scene.clipKey, scene.audioKey, scene.imageKey].filter(
    (key): key is string => Boolean(key)
  );

  const assets = mediaKeys.length
    ? await prisma.asset.findMany({
        where: {
          projectId: id,
          userId: user.id,
          storageKey: { in: mediaKeys },
        },
        select: { id: true, storageKey: true },
      })
    : [];

  const keysToRemove = new Set(mediaKeys);
  for (const asset of assets) keysToRemove.add(asset.storageKey);

  await prisma.$transaction(async (tx) => {
    if (assets.length > 0) {
      await tx.asset.deleteMany({
        where: { id: { in: assets.map((asset) => asset.id) } },
      });
    }
    await tx.scene.delete({ where: { id: scene.id } });
  });

  const storage = getStorage();
  await Promise.allSettled(
    Array.from(keysToRemove).map((key) => storage.remove(key))
  );

  return NextResponse.json({ ok: true, hidden: false });
}