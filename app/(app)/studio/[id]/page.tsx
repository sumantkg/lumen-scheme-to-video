import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import ProjectStudio from "@/components/studio/ProjectStudio";
import { requireUser } from "@/lib/dal";
import { getProjectForUser } from "@/lib/projects";

export const metadata: Metadata = { title: "Project — Lumen" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const project = await getProjectForUser(user.id, id);
  if (!project) notFound();

  if (project.title === "Lumen Editor Demo") {
    redirect("/demo");
  }

  return <ProjectStudio projectId={id} initial={project} />;
}