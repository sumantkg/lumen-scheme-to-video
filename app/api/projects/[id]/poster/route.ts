import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { serveStoredFile } from "@/lib/media";

/** A project's poster frame (thumbnail for cards/embeds). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const project = await prisma.videoProject.findFirst({
    where: { id, userId: user.id },
    select: { finalThumbKey: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  return serveStoredFile(request, project.finalThumbKey);
}