import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { serveStoredFile } from "@/lib/media";
import { getStorage } from "@/lib/storage";

/**
 * A single uploaded file.
 *
 *   GET    /api/assets/[id]  → stream the bytes (Range-aware, authenticated)
 *   DELETE /api/assets/[id]  → remove the row and its stored bytes
 *
 * Only the owning user can reach an asset.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const asset = await prisma.asset.findFirst({ where: { id, userId: user.id } });
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  return serveStoredFile(request, asset.storageKey, { mime: asset.mime, filename: asset.filename });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const asset = await prisma.asset.findFirst({ where: { id, userId: user.id } });
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  await getStorage().remove(asset.storageKey);
  await prisma.asset.delete({ where: { id: asset.id } });

  return NextResponse.json({ ok: true });
}