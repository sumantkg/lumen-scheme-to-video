import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { enqueueTask, setProjectStage } from "@/lib/pipeline/queue";

/**
 * Re-run the AI critic over the finished storyboard.
 *
 *   POST /api/projects/[id]/critic
 *
 * Only allowed once scenes exist and the source text is available. The worker
 * re-audits every scene and stores fresh issues + a refined storyboard.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const limited = enforceRateLimit(`critic:${user.id}`, RATE_LIMITS.critic);
  if (limited) return limited;

  const project = await prisma.videoProject.findFirst({
    where: { id, userId: user.id },
    include: { scenes: { select: { id: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  if (!project.schemeText?.trim()) {
    return NextResponse.json(
      { error: "There is no scheme text to audit against yet." },
      { status: 422 }
    );
  }
  if (project.scenes.length === 0) {
    return NextResponse.json(
      { error: "Generate the storyboard before running the critic." },
      { status: 422 }
    );
  }

  await setProjectStage(id, {
    status: "auditing",
    stage: "The AI critic is auditing every scene…",
    progress: 25,
  });
  await enqueueTask({ projectId: id, kind: "run_critic", priority: 20 });

  return NextResponse.json({ queued: true });
}