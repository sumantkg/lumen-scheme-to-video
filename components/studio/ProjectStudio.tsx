"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AssetView, ProjectDetailView, SceneView } from "@/lib/projects";
import { VOICE_PERSONAS, type VoicePersona } from "@/lib/pipeline/prompts";
import { statusLabel, statusTone, WORKING_STATUSES } from "./status";
import CriticPanel from "./CriticPanel";
import SceneCard from "./SceneCard";

const WORKING_HINTS: Record<string, string> = {
  generating_scenes:
    "The storyboard model is reading the scheme and writing each scene — titles, visual prompts, Bengali narration and its timing.",
  auditing:
    "The AI critic is auditing every scene against the scheme text, filing issues and refining anything that misses the brief.",
  generating_media: "Each scene is being rendered to its own clip.",
  synthesizing_audio: "The narration is being voice-overed in the project language.",
  merging: "The clips and narration are being stitched into the final video.",
};

export default function ProjectStudio({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectDetailView;
}) {
  const [detail, setDetail] = useState<ProjectDetailView | null>(initial);
  const [busy, setBusy] = useState<"generate" | "critic" | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<AssetView | null>(null);
  const storyboardRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load the project.");
      const body = (await res.json()) as { project: ProjectDetailView };
      setDetail(body.project);
      setFetchError(null);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : String(error));
    }
  }, [projectId]);

  /** Keep polling while any pipeline work is in flight (project-level OR scene-level). */
  const needsPolling = useCallback((d: ProjectDetailView | null) => {
    if (!d) return false;
    if (WORKING_STATUSES.has(d.status)) return true;
    // Also poll when any scene is in a generating or pending state
    return d.scenes.some((s) => s.status === "generating" || s.status === "queued");
  }, []);

  useEffect(() => {
    if (!detail) return;
    if (needsPolling(detail)) {
      const timer = setInterval(() => void refresh(), 2500);
      return () => clearInterval(timer);
    }
  }, [detail, needsPolling, refresh]);

  async function run(kind: "generate" | "critic") {
    setBusy(kind);
    try {
      const res = await fetch(`/api/projects/${projectId}/${kind}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setFetchError(body.error ?? `Could not run the ${kind} step.`);
      } else {
        setFetchError(null);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteAsset(id: string) {
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    await refresh();
  }

  function handleSceneUpdated(updated: SceneView) {
    setDetail((prev) =>
      prev
        ? { ...prev, scenes: prev.scenes.map((s) => (s.id === updated.id ? updated : s)) }
        : prev
    );
  }

  async function handleToneChange(newTone: string) {
    if (!detail || detail.tone === newTone) return;
    setDetail((prev) => (prev ? { ...prev, tone: newTone } : prev));
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: newTone }),
      });
    } catch {
      await refresh();
    }
  }

  if (!detail) {
    return (
      <div className="dash-empty">
        <h2>Something went wrong.</h2>
        <p>{fetchError}</p>
      </div>
    );
  }

  const isGeneratingStoryboard = detail.status === "generating_scenes" || detail.status === "auditing";
  const isRenderingClips = detail.status === "generating_media";
  const totalScenes = detail.scenes.length;
  const clipsReady = detail.scenes.filter((s) => s.hasClip).length;
  const anyClipReady = clipsReady > 0;
  const allClipsReady = clipsReady === totalScenes && totalScenes > 0;

  return (
    <div className="studio-view project-view">
      <div className="dash-heading">
        <span className="eyebrow">
          <Link href="/studio" className="project-back">
            ← All projects
          </Link>
        </span>
        <h1>{detail.title}</h1>
        <p className="dash-lede">
          <span className={`chip chip-tone-${statusTone(detail.status)}`}>
            {statusLabel(detail.status)}
          </span>{" "}
          {detail.language.toUpperCase()} · {detail.region ?? "—"} · {detail.sceneCount} scenes ·{" "}
          {detail.aspect} ·{" "}
          <span className="chip chip-neutral" title="Voice Persona & Tone">
            {VOICE_PERSONAS[detail.tone as VoicePersona]?.badge ?? "🏛️ Formal Broadcaster"}
          </span>
        </p>
      </div>

      {fetchError && (
        <p className="auth-alert project-alert" role="alert">
          {fetchError}
        </p>
      )}

      {isGeneratingStoryboard && (
        <section className="studio-panel project-progress">
          <div className="watch-placeholder">
            <span className="watch-spinner" aria-hidden="true" />
            <h2>
              {detail.stage ??
                (detail.status === "generating_scenes"
                  ? "Building the storyboard…"
                  : "Working…")}
            </h2>
            <p className="watch-progress-label">{detail.progress}%</p>
            <p className="project-progress-hint">
              {WORKING_HINTS[detail.status] ?? "This can take a minute or two."}
            </p>
            <div className="progress progress-lg">
              <span
                className="progress-fill"
                style={{ width: `${Math.max(2, detail.progress)}%` }}
              />
            </div>
          </div>
        </section>
      )}

      {detail.status === "failed" && (
        <section className="studio-panel project-failed">
          <h2>This project hit a wall.</h2>
          <p className="project-error-text">{detail.error ?? "Unknown error."}</p>
          {detail.error && (detail.error.includes("spending cap") || detail.error.includes("spend cap")) ? (
            <div style={{ margin: "1rem 0", padding: "0.85rem 1rem", background: "rgba(239, 68, 68, 0.08)", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5, color: "#fca5a5" }}>
                💳 <strong>Google AI Studio Monthly Spending Cap Reached:</strong>
              </p>
              <p style={{ margin: "6px 0 0", fontSize: "0.85rem", lineHeight: 1.5, color: "var(--muted)" }}>
                Google has blocked requests because this API key&apos;s Google Cloud / AI Studio project reached its monthly spend limit.
                You can increase or disable the limit at{" "}
                <a
                  href="https://ai.studio/spend"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--cyan-bright)", textDecoration: "underline" }}
                >
                  ai.studio/spend ↗
                </a>
                , or replace the key with another one on the <Link href="/settings" style={{ color: "var(--cyan-bright)" }}>API keys</Link> page.
              </p>
            </div>
          ) : detail.error && detail.error.includes("0 tokens/min") ? (
            <div style={{ margin: "1rem 0", padding: "0.85rem 1rem", background: "rgba(255,255,255,0.05)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
                💡 <strong>Gemini Omni note:</strong> Video generation with <code>gemini-omni-1.1-flash</code> requires a Google AI Studio account with Pay-As-You-Go billing enabled or Google Cloud Vertex AI.
              </p>
            </div>
          ) : (
            <p>
              Check the <Link href="/settings">API keys</Link> page. If a key was
              replaced, rerun the stage from here.
            </p>
          )}
          <div className="project-actions">
            {totalScenes === 0 && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void run("generate")}
                disabled={busy === "generate"}
              >
                {busy === "generate" ? "Retrying…" : "Retry"}
              </button>
            )}
            {totalScenes > 0 && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => storyboardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                View Storyboard ↓
              </button>
            )}
          </div>
        </section>
      )}

      {detail.status === "draft" && (
        <section className="studio-panel project-draft">
          <h2>The storyboard has not been built yet.</h2>
          <p>
            Upload the scheme document or paste its text in the wizard, then
            generate. Add your API key on the{" "}
            <Link href="/settings">API keys</Link> page first.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void run("generate")}
            disabled={busy === "generate"}
          >
            {busy === "generate" ? "Starting…" : "Generate storyboard"}
          </button>
        </section>
      )}

      {!isGeneratingStoryboard && detail.status !== "draft" && totalScenes > 0 && (
        <>
          {detail.assets.length > 0 && (
            <section className="project-media">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="eyebrow">Reference media</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowMedia((v) => !v)}
                  style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem" }}
                >
                {showMedia ? "Hide ▲" : "Show ▼"}
                </button>
              </div>
              {showMedia && (
                <ul className="asset-list">
                  {detail.assets.map((asset) => (
                    <li key={asset.id} className="chip chip-neutral asset-chip">
                      <span>
                        {asset.filename} · {asset.kind}
                      </span>
                      <button
                        type="button"
                        className="asset-view-btn"
                        aria-label={`Preview ${asset.filename}`}
                        title={`Preview ${asset.filename}`}
                        onClick={() => setPreviewAsset(asset)}
                      >
                        {/* expand / external-link icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="project-scenes" ref={storyboardRef}>
            <div className="studio-library-head">
              <div>
                <h2>Storyboard</h2>
                {clipsReady > 0 && (
                  <span className="studio-count" style={{ display: "block", marginTop: "2px" }}>
                    {clipsReady}/{totalScenes} clips ready
                  </span>
                )}
              </div>
              <div className="project-actions" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                {/* Voice persona capsule selector */}
                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <select
                    className="persona-capsule-select"
                    value={detail.tone || "formal_broadcaster"}
                    onChange={(e) => void handleToneChange(e.target.value)}
                    title="Switch voice persona & tone for storyboard narration"
                    style={{
                      appearance: "none",
                      WebkitAppearance: "none",
                      MozAppearance: "none",
                      borderRadius: "9999px",
                      background: "rgba(18, 18, 24, 0.85)",
                      border: "1px solid rgba(255, 255, 255, 0.16)",
                      color: "var(--foreground, #ffffff)",
                      padding: "6px 28px 6px 14px",
                      fontSize: "0.82rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      lineHeight: 1.3,
                      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <option value="formal_broadcaster">🏛️ Formal Broadcaster</option>
                    <option value="empathetic_mentor">🎓 Empathetic Mentor</option>
                    <option value="youth_beneficiary">⚡ Youth Beneficiary</option>
                  </select>
                  <span
                    style={{
                      position: "absolute",
                      right: "10px",
                      pointerEvents: "none",
                      fontSize: "0.65rem",
                      color: "var(--muted, #94a3b8)",
                    }}
                  >
                    ▼
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void run("generate")}
                  disabled={busy === "generate"}
                >
                  {busy === "generate" ? "Rebuilding…" : "Rebuild storyboard"}
                </button>

                {/* Add to Editor button — available as soon as 1 clip exists */}
                {anyClipReady && (
                  <Link
                    href={`/studio/${projectId}/editor?mode=all`}
                    id="add-to-editor-btn"
                    className="btn btn-primary btn-sm"
                    style={{ fontWeight: 600 }}
                  >
                    🎬 Add to Editor {allClipsReady ? "✦" : `(${clipsReady}/${totalScenes} clips)`}
                  </Link>
                )}
              </div>
            </div>


            <div className="scene-grid">
              {detail.scenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  projectId={projectId}
                  scene={scene}
                  aspect={detail.aspect}
                  onUpdated={handleSceneUpdated}
                  onClipCreated={() => void refresh()}
                  projectFailed={detail.status === "failed"}
                />
              ))}
            </div>
          </section>

          {detail.useCritic && (
            <CriticPanel
              complianceScore={detail.complianceScore}
              criticPassed={detail.criticPassed}
              criticSummary={detail.criticSummary}
              criticModel={detail.criticModel || detail.llmModel}
              issues={detail.issues}
              onRerun={() => void run("critic")}
              running={busy === "critic"}
            />
          )}
        </>
      )}

      {/* ── Asset preview modal ── */}
      {previewAsset && (
        <div
          className="asset-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${previewAsset.filename}`}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewAsset(null); }}
        >
          <div className="asset-preview-box">
            <div className="asset-preview-header">
              <span className="asset-preview-title">{previewAsset.filename}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <a
                  href={`/api/assets/${previewAsset.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                  style={{ padding: "4px 10px", fontSize: "0.75rem", height: "auto", textDecoration: "none" }}
                  title="Open in new tab"
                >
                  Open in tab ↗
                </a>
                <button
                  type="button"
                  className="asset-preview-close"
                  aria-label="Close preview"
                  onClick={() => setPreviewAsset(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="asset-preview-body">
              {previewAsset.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/assets/${previewAsset.id}`}
                  alt={previewAsset.filename}
                  className="asset-preview-img"
                />
              ) : previewAsset.mime.startsWith("video/") ? (
                <video
                  src={`/api/assets/${previewAsset.id}`}
                  controls
                  className="asset-preview-video"
                />
              ) : previewAsset.mime === "application/pdf" ||
                previewAsset.filename.toLowerCase().endsWith(".pdf") ||
                previewAsset.mime.startsWith("text/") ||
                previewAsset.filename.toLowerCase().endsWith(".txt") ||
                previewAsset.filename.toLowerCase().endsWith(".md") ? (
                <iframe
                  src={`/api/assets/${previewAsset.id}`}
                  className="asset-preview-iframe"
                  title={previewAsset.filename}
                />
              ) : (
                <div className="asset-preview-unsupported">
                  <p>Preview not available for <strong>{previewAsset.mime}</strong> files.</p>
                  <a
                    href={`/api/assets/${previewAsset.id}`}
                    download={previewAsset.filename}
                    className="btn btn-outline btn-sm"
                  >
                    Download file ↓
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}