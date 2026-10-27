"use client";

import Link from "next/link";
import { useState, useRef } from "react";

import type { SceneView } from "@/lib/projects";

export default function SceneCard({
  projectId,
  scene,
  aspect,
  onUpdated,
  onClipCreated,
  projectFailed = false,
}: {
  projectId: string;
  scene: SceneView;
  aspect?: string;
  onUpdated: (scene: SceneView) => void;
  /** Called after a clip is successfully enqueued so the parent can refresh. */
  onClipCreated?: () => void;
  /** True when the parent project has status=failed — overrides stuck generating state. */
  projectFailed?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clipBusy, setClipBusy] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [visualPrompt, setVisualPrompt] = useState(scene.visualPrompt);

  const videoRef = useRef<HTMLVideoElement>(null);

  function startEdit() {
    setVisualPrompt(scene.visualPrompt);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visualPrompt: visualPrompt.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        scene?: SceneView;
        error?: string;
      };
      if (!res.ok || !body.scene) {
        setError(body.error ?? "Could not save the scene.");
        return;
      }
      onUpdated(body.scene);
      setEditing(false);
    } catch {
      setError("Network error while saving.");
    } finally {
      setBusy(false);
    }
  }


  async function createClip(force = false) {
    setClipBusy(true);
    setClipError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/clips`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sceneId: scene.id, force }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setClipError(body.error ?? "Could not start clip generation.");
        return;
      }
      onClipCreated?.();
    } catch {
      setClipError("Network error while starting clip.");
    } finally {
      setClipBusy(false);
    }
  }

  const isGenerating = scene.status === "generating" && !projectFailed;
  const isStuckGenerating = scene.status === "generating" && projectFailed;
  const hasFailed = scene.status === "failed" || Boolean(scene.error) || isStuckGenerating;

  return (
    <article className={`scene-card${scene.hasClip ? " has-clip" : ""}`}>
      <header className="scene-head">
        <span className="scene-index">SCENE {scene.index}</span>

        {/* Status chips */}
        {scene.hasClip && <span className="chip chip-ready">clip ready</span>}

        {/* Top-right corner button actions: Edit is 1st, Retry/Create clip is 2nd */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Cancel button while editing */}
          {editing && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setVisualPrompt(scene.visualPrompt);
                setEditing(false);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          )}

          {/* 1st button: Edit / Save */}
          <button
            type="button"
            className={`btn btn-sm scene-edit ${editing ? "btn-primary" : "btn-ghost"}`}
            style={{ marginLeft: 0 }}
            onClick={() => (editing ? void save() : startEdit())}
            disabled={busy}
          >
            {busy ? "Saving…" : editing ? "Save" : "Edit"}
          </button>

          {/* 2nd button: Retry clip or Create clip when clip not generated */}
          {!scene.hasClip && (
            <button
              type="button"
              id={hasFailed ? `scene-retry-clip-${scene.id}` : `scene-create-clip-${scene.id}`}
              className="btn btn-primary btn-sm scene-create-clip"
              onClick={() => void createClip(hasFailed)}
              disabled={clipBusy || isGenerating}
              title={hasFailed ? "Retry video clip for this scene" : "Generate video clip for this scene"}
            >
              {clipBusy
                ? hasFailed
                  ? "Retrying…"
                  : "Queuing…"
                : isGenerating
                ? "Rendering…"
                : hasFailed
                ? "Retry clip ✦"
                : "Create clip"}
            </button>
          )}

          {/* 2nd button: Regenerate clip when scene already has a clip */}
          {scene.hasClip && (
            <button
              type="button"
              id={`scene-regen-clip-${scene.id}`}
              className="btn btn-outline btn-sm"
              onClick={() => void createClip(true)}
              disabled={clipBusy || isGenerating}
              title="Re-render this scene clip"
            >
              {clipBusy || isGenerating ? "Queuing…" : "Regenerate clip"}
            </button>
          )}
        </div>
      </header>

      {isStuckGenerating && (
        <div style={{ margin: "0.5rem 1rem 0", padding: "0.5rem 0.75rem", background: "rgba(239,68,68,0.08)", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.25)", fontSize: "0.8rem", color: "#fca5a5", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          ⚠ Generation was interrupted. Click &ldquo;Retry clip ✦&rdquo; to restart this scene.
        </div>
      )}

      

      {editing ? (
        <div className="scene-edit-grid" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <h3 className="scene-title">{scene.title}</h3>
          {scene.voiceoverText && (
            <p className="scene-voiceover">{scene.voiceoverText}</p>
          )}
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label" style={{ fontWeight: 600, color: "var(--cyan-bright)" }}>
              Visual prompt
            </span>
            <textarea
              className="field-input wizard-textarea"
              rows={5}
              style={{ minHeight: "120px", width: "100%", lineHeight: 1.5, resize: "vertical" }}
              value={visualPrompt}
              onChange={(e) => setVisualPrompt(e.target.value)}
              placeholder="Describe the visuals for this scene..."
            />
          </label>
          {error && <p className="billing-error">{error}</p>}
        </div>
      ) : (
        <>
          <h3 className="scene-title">{scene.title}</h3>

          <div className="scene-timing-chips">
            <span className="chip chip-neutral">
              {scene.durationSec}s · narration {scene.narrationStartSec}–{scene.narrationEndSec}s
            </span>
            {aspect && <span className="chip chip-cyan" style={{ fontSize: "0.75rem" }}>{aspect}</span>}
            {scene.cameraAngle && <span className="chip chip-neutral">{scene.cameraAngle}</span>}
          </div>

          {scene.voiceoverText && (
            <p className="scene-voiceover">{scene.voiceoverText}</p>
          )}

          {scene.onscreenText.length > 0 && (
            <p className="scene-chips">
              <span className="field-label">On-screen text</span>{" "}
              {scene.onscreenText.map((line) => (
                <span key={line} className="chip chip-cyan">{line}</span>
              ))}
            </p>
          )}

          {scene.groundingElements.length > 0 && (
            <p className="scene-chips">
              <span className="field-label">Grounding</span>{" "}
              {scene.groundingElements.map((item) => (
                <span key={item} className="chip chip-violet">{item}</span>
              ))}
            </p>
          )}

          {scene.noLipSyncNote && (
            <p className="scene-lipsync">No lip sync: {scene.noLipSyncNote}</p>
          )}

          <details className="scene-prompt">
            <summary>Visual prompt</summary>
            <p>{scene.visualPrompt}</p>
          </details>

          {/* In-card buffering / generating state */}
          {(isGenerating || clipBusy) && (
            <div className="scene-buffering-box">
              <div className="scene-buffering-spinner" aria-hidden="true" />
              <div className="scene-buffering-label">Buffering &amp; generating video clip…</div>
              <div className="scene-buffering-sub">
                Rendering 720p video clip for Scene {scene.index}…
              </div>
            </div>
          )}

          {scene.hasImage && !scene.hasClip && !isGenerating && !clipBusy && (
            <img
              className="scene-ref"
              src={`/api/projects/${projectId}/scenes/${scene.id}/poster`}
              alt={`Scene ${scene.index} reference`}
            />
          )}

          {/* Inline video player */}
          {scene.hasClip && (
            <div className="scene-clip-wrapper">
              <video
                ref={videoRef}
                className="scene-clip"
                src={`/api/projects/${projectId}/scenes/${scene.id}/video`}
                controls
                playsInline
                preload="metadata"
                poster={scene.hasImage ? `/api/projects/${projectId}/scenes/${scene.id}/poster` : undefined}
              />
              <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
                <Link
                  href={`/studio/${projectId}/editor?sceneId=${scene.id}`}
                  className="scene-add-to-editor-btn"
                  title="Assemble this clip in the Video Editor"
                >
                  🎬 Add to Editor ↗
                </Link>
              </div>
            </div>
          )}

          {scene.hasAudio && !scene.hasClip && !isGenerating && !clipBusy && (
            <audio
              className="scene-audio"
              src={`/api/projects/${projectId}/scenes/${scene.id}/audio`}
              controls
              preload="none"
            />
          )}
        </>
      )}
    </article>
  );
}