import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { getProjectForUser } from "@/lib/projects";
import VideoEditor from "@/components/editor/VideoEditor";

export const metadata: Metadata = { title: "Video Editor — Lumen" };

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sceneId?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const project = await getProjectForUser(user.id, id, {
    withClipDurations: true,
    view: "editor",
  });
  if (!project) notFound();

  return (
    <VideoEditor
      projectId={id}
      initial={project}
      targetSceneId={sp?.sceneId}
      mode={sp?.mode}
    />
  );
}
