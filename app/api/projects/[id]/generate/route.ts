import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { enqueueTask, setProjectStage } from "@/lib/pipeline/queue";
import { triggerQueueDrain } from "@/lib/pipeline/runner";

/**
 * Start (or restart) the storyboard pipeline for a project.
 *
 *   POST /api/projects/[id]/generate
 *
 * The pasted text path skips straight to scene generation; the document path
 * first enqueues text extraction. The worker chains the rest.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const limited = enforceRateLimit(`generate:${user.id}`, RATE_LIMITS.generate);
  if (limited) return limited;

  const project = await prisma.videoProject.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const hasPastedText = Boolean(project.schemeText?.trim() && project.schemeText!.trim().length >= 30);
  const hasDocument = Boolean(project.documentAssetId);

  if (!hasPastedText && !hasDocument) {
    return NextResponse.json(
      { error: "Upload the scheme document or paste its details first." },
      { status: 422 }
    );
  }

  await setProjectStage(id, {
    status: "generating_scenes",
    stage: "Preparing the storyboard…",
    progress: 2,
  });
  await prisma.videoProject.update({ where: { id }, data: { error: null } });

  if (hasPastedText) {
    await enqueueTask({ projectId: id, kind: "generate_scenes", priority: 10 });
  } else {
    await enqueueTask({ projectId: id, kind: "extract_text", priority: 5 });
  }

  triggerQueueDrain();

  return NextResponse.json({ queued: true });
}