import { NextResponse } from "next/server";

import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { prisma } from "@/lib/db";
import { listProjectsForUser } from "@/lib/projects";
import { projectCreateSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireUser();
  const projects = await listProjectsForUser(user.id);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const user = await requireUser();

  const limited = enforceRateLimit(`projects:${user.id}`, RATE_LIMITS.projects);
  if (limited) return limited;

  let body: ReturnType<typeof projectCreateSchema.parse>;
  try {
    body = projectCreateSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid project fields." },
      { status: 400 }
    );
  }

  const project = await prisma.videoProject.create({
    data: {
      userId: user.id,
      title: body.title,
      language: body.language,
      tone: body.tone ?? "formal_broadcaster",
      region: body.region,
      notes: body.notes ?? null,
      sceneCount: body.sceneCount,
      aspect: body.aspect,
      targetDurationSec: body.targetDurationSec,
      llmProvider: body.llmProvider,
      llmModel: body.llmModel ?? null,
      criticProvider: body.criticProvider ?? body.llmProvider,
      criticModel: body.criticModel ?? body.llmModel ?? null,
      videoProvider: body.videoProvider,
      videoModel: body.videoModel ?? null,
      useCritic: body.useCritic,
      schemeText: body.schemeText ?? null,
      status: "draft",
    },
  });

  return NextResponse.json(
    { project: { id: project.id, title: project.title } },
    { status: 201 }
  );
}