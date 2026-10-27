import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ProjectStudio from "@/components/studio/ProjectStudio";
import { requireUser } from "@/lib/dal";
import { ensureDemoProject } from "@/lib/demo";
import { getProjectForUser } from "@/lib/projects";

export const metadata: Metadata = { title: "Editor Demo — Lumen" };
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const user = await requireUser();
  const { projectId } = await ensureDemoProject(user.id);
  const project = await getProjectForUser(user.id, projectId);
  if (!project) notFound();

  return <ProjectStudio projectId={projectId} initial={project} />;
}
