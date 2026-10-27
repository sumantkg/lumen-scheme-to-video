import type { Metadata } from "next";
import Link from "next/link";

import ProjectLibrary from "@/components/studio/ProjectLibrary";
import { requireUser } from "@/lib/dal";
import { listProjectsForUser } from "@/lib/projects";

export const metadata: Metadata = { title: "Studio — Lumen" };

export default async function StudioPage() {
  const user = await requireUser();
  const projects = await listProjectsForUser(user.id);

  return (
    <div className="dash-view studio-view">
      <div className="dash-heading">
        <span className="eyebrow">Studio</span>
        <h1>Scheme to video, {user.name.split(" ")[0]}.</h1>
        <p className="dash-lede">
          Upload a government scheme — PM Vidyalaxmi, Kanyashree, PM-Surya Ghar —
          and Lumen writes the storyboard, runs an AI critic, renders each scene
          and narrates it in Bengali.
        </p>
        <p className="status-actions studio-actions">
          <Link className="btn btn-primary" href="/studio/new">
            New project
          </Link>
          <Link className="btn btn-ghost" href="/demo">
            Try the editor demo
          </Link>
        </p>
      </div>

      <div className="studio-library">
        <div className="studio-library-head">
          <h2>Your projects</h2>
          <span className="studio-count">{projects.length} total</span>
        </div>
        <ProjectLibrary
          projects={projects}
          emptyMsg="No scheme videos yet."
        />
      </div>
    </div>
  );
}