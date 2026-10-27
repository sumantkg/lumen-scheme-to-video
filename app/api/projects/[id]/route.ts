import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { deleteProjectForUser, getProjectForUser } from "@/lib/projects";
import { triggerQueueDrain } from "@/lib/pipeline/runner";
import { getStorage, projectPrefix } from "@/lib/storage";
import { projectSettingsSchema } from "@/lib/validation";

/**
 * One project.
 *
 *   GET    /api/projects/[id]  → the project, its scenes and its assets
 *   PATCH  /api/projects/[id]  → edit settings (or attach a document asset)
 *   DELETE /api/projects/[id]  → remove the project and every stored file
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const project = await getProjectForUser(user.id, id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  if (project.status === "generating_scenes" || project.status === "auditing" || project.status === "generating_media") {
    triggerQueueDrain();
  }

  return NextResponse.json({ project });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const existing = await prisma.videoProject.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const body = raw as Record<string, unknown>;

  // Linking an already-uploaded document asset is allowed outside the settings
  // schema (the wizard uploads first, then attaches).
  if (body.documentAssetId !== undefined) {
    if (typeof body.documentAssetId !== "string" || body.documentAssetId.length === 0) {
      await prisma.videoProject.updateMany({
        where: { id, userId: user.id },
        data: { documentAssetId: null },
      });
    } else {
      const asset = await prisma.asset.findFirst({
        where: { id: body.documentAssetId, userId: user.id },
      });
      if (!asset || asset.kind !== "document") {
        return NextResponse.json(
          { error: "The referenced asset is not a document." },
          { status: 400 }
        );
      }
      await prisma.videoProject.updateMany({
        where: { id, userId: user.id },
        data: { documentAssetId: asset.id },
      });
    }
  }

  const settingsResult = projectSettingsSchema.safeParse(body);
  if (!settingsResult.success) {
    return NextResponse.json({ error: "Invalid project settings." }, { status: 400 });
  }
  const data = settingsResult.data;

  if (Object.keys(data).length > 0) {
    await prisma.videoProject.updateMany({ where: { id, userId: user.id }, data });
  }

  const project = await getProjectForUser(user.id, id);
  return NextResponse.json({ project });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const project = await prisma.videoProject.findFirst({
    where: { id, userId: user.id },
    include: { assets: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const storage = getStorage();
  await Promise.allSettled(project.assets.map((asset) => storage.remove(asset.storageKey)));
  await storage.removePrefix(projectPrefix(id));
  await deleteProjectForUser(user.id, id);

  return NextResponse.json({ ok: true });
}