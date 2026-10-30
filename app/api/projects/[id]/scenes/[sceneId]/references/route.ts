import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { getStorage } from "@/lib/storage";

/**
 * Manage scene-specific reference images:
 *
 *   POST   /api/projects/[id]/scenes/[sceneId]/references
 *          (Accepts FormData with `file`, or JSON `{ assetId: string }`)
 *
 *   DELETE /api/projects/[id]/scenes/[sceneId]/references
 *          (Unbinds reference from the scene)
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await requireUser();
  const { id, sceneId } = await context.params;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId: id, project: { userId: user.id } },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";

  let targetAssetId: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files (JPEG, PNG, WebP) are supported as references." }, { status: 400 });
    }

    const storage = getStorage();
    const bytes = Buffer.from(await file.arrayBuffer());
    const storageKey = `uploads/${user.id}/${sceneId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.putBuffer(bytes, storageKey);

    const asset = await prisma.asset.create({
      data: {
        userId: user.id,
        projectId: id,
        kind: "reference_image",
        storageKey,
        filename: file.name,
        mime: file.type || "image/jpeg",
        size: bytes.length,
      },
    });
    targetAssetId = asset.id;
  } else {
    try {
      const json = await request.json();
      targetAssetId = typeof json.assetId === "string" ? json.assetId : null;
    } catch {
      targetAssetId = null;
    }
  }

  if (!targetAssetId) {
    return NextResponse.json({ error: "Provide a file or an existing assetId." }, { status: 400 });
  }

  // Verify asset ownership
  const asset = await prisma.asset.findFirst({
    where: { id: targetAssetId, userId: user.id },
  });
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  // Remove existing reference bindings for this scene
  await prisma.sceneAsset.deleteMany({
    where: { sceneId: scene.id, role: "reference" },
  });

  // Create new binding
  const bound = await prisma.sceneAsset.create({
    data: {
      sceneId: scene.id,
      assetId: asset.id,
      role: "reference",
    },
    include: { asset: true },
  });

  return NextResponse.json({
    ok: true,
    reference: {
      id: bound.id,
      assetId: asset.id,
      filename: asset.filename,
      mime: asset.mime,
      url: `/api/assets/${asset.id}`,
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await requireUser();
  const { id, sceneId } = await context.params;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId: id, project: { userId: user.id } },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  await prisma.sceneAsset.deleteMany({
    where: { sceneId: scene.id, role: "reference" },
  });

  return NextResponse.json({ ok: true });
}
