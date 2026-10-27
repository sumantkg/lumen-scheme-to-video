"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ProjectView } from "@/lib/projects";
import ProjectCard from "./ProjectCard";

export default function ProjectLibrary({
  projects,
  emptyMsg,
}: {
  projects: ProjectView[];
  emptyMsg?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(projects);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((list) => list.filter((p) => p.id !== id));
      router.refresh();
    }
  }

  if (items.length === 0) {
    return (
      <div className="dash-empty">
        <h2>{emptyMsg ?? "No videos yet."}</h2>
        <p>
          Turn a government scheme into a scripted, narrated video. Upload the
          scheme document or paste its text and Lumen builds the storyboard.
        </p>
      </div>
    );
  }

  return (
    <div className="job-grid">
      {items.map((project) => (
        <ProjectCard key={project.id} project={project} onDelete={handleDelete} />
      ))}
    </div>
  );
}