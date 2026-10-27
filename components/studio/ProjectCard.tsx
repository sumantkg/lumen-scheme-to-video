"use client";

import Link from "next/link";
import { useState } from "react";

import type { ProjectView } from "@/lib/projects";
import { statusLabel, statusTone } from "./status";

export default function ProjectCard({
  project,
  onDelete,
}: {
  project: ProjectView;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = ["generating_scenes", "auditing", "generating_media", "synthesizing_audio", "merging"].includes(project.status);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    await onDelete?.(project.id);
  }

  return (
    <article className={`job-card proj-card${project.status === "failed" ? " is-failed" : ""}`}>
      <Link className="job-media proj-media" href={`/studio/${project.id}`}>
        {project.hasPoster ? (
          <img
            className="job-poster"
            src={`/api/projects/${project.id}/poster`}
            alt=""
          />
        ) : (
          <span className="job-poster job-poster-empty" aria-hidden="true" />
        )}
        <span
          className={`job-status job-status-${project.status} chip-tone-${statusTone(project.status)}`}
        >
          {statusLabel(project.status)}
        </span>
      </Link>

      <div className="job-body">
        <Link href={`/studio/${project.id}`} className="job-prompt proj-title">
          {project.title || "Untitled"}
        </Link>

        <div className="job-meta">
          <span>{project.language.toUpperCase()}</span>
          <span>·</span>
          <span>{project.sceneCount} scenes</span>
          <span>·</span>
          <span>{project.aspect}</span>
        </div>

        {working && (
          <div className="progress" aria-hidden="true">
            <span
              className="progress-fill"
              style={{ width: `${Math.max(4, project.progress)}%` }}
            />
          </div>
        )}

        {!working && project.complianceScore !== null && (
          <span className="proj-score">
            Critic {project.complianceScore}/100
            {project.criticPassed ? " · passed" : " · needs work"}
          </span>
        )}

        {project.error && <p className="job-error">{project.error}</p>}

        <div className="proj-actions">
          {onDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-sm proj-delete"
              onClick={handleDelete}
              disabled={busy}
            >
              {confirming ? "Really delete?" : busy ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}