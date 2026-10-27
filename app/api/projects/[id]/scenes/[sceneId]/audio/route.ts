import { NextResponse } from "next/server";

import { requireUser } from "@/lib/dal";
import { serveStoredFile } from "@/lib/media";
import { prisma } from "@/lib/db";

/** A scene's synthesized voiceover track. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await requireUser();
  const { id, sceneId } = await context.params;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId: id, project: { userId: user.id } },
    select: { audioKey: true },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  return serveStoredFile(request, scene.audioKey);
}