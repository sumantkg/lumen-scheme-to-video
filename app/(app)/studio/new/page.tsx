import type { Metadata } from "next";
import Link from "next/link";

import ProjectWizard from "@/components/studio/ProjectWizard";
import { requireUser } from "@/lib/dal";

export const metadata: Metadata = { title: "New project — Lumen" };

export default async function NewProjectPage() {
  await requireUser();

  return (
    <div className="dash-view studio-view">
      <div className="dash-heading">
        <span className="eyebrow">
          <Link href="/studio" className="project-back">
            ← All projects
          </Link>
        </span>
        <h1>New scheme video</h1>
        <p className="dash-lede">
          Tell Lumen about the scheme. The storyboard model writes every scene
          with Bengali narration and West Bengal grounding, then the AI critic
          audits it before any clip is rendered.
        </p>
      </div>

      <ProjectWizard />
    </div>
  );
}