"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const LANGUAGES = [
  { value: "bn", label: "বাংলা (Bengali)" },
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
];

const ASPECTS = ["16:9", "9:16", "1:1"] as const;

type VideoProviderName = "gemini" | "replicate" | "fal";

const VIDEO_PROVIDERS: VideoProviderName[] = ["gemini"];

interface VideoProviderInfo {
  label: string;
  models: string[];
  default: string;
  billing: "user-key" | "operator-key" | "free";
  note: string;
  verified: boolean;
}

interface ModelCatalog {
  llm: {
    gemini: { label: string; models: string[]; default: string; verified: boolean };
    openai: { label: string; models: string[]; default: string; verified: boolean };
  };
  video: Record<VideoProviderName, VideoProviderInfo>;
}

export default function ProjectWizard() {
  const router = useRouter();

  const [catalog, setCatalog] = useState<ModelCatalog["llm"] | null>(null);
  const [videoCatalog, setVideoCatalog] = useState<ModelCatalog["video"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("bn");
  const [region, setRegion] = useState("West Bengal");
  const [sceneCount, setSceneCount] = useState(6);
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("16:9");
  const [llmProvider, setLlmProvider] = useState<"gemini" | "openai">("gemini");
  const [llmModel, setLlmModel] = useState("gemini-3.5-flash");
  const [separateCriticLlm, setSeparateCriticLlm] = useState(false);
  const [criticProvider, setCriticProvider] = useState<"gemini" | "openai">("gemini");
  const [criticModel, setCriticModel] = useState("gemini-3.5-flash");
  const [videoProvider, setVideoProvider] = useState<VideoProviderName>("gemini");
  const [useCritic, setUseCritic] = useState(true);
  const [schemeText, setSchemeText] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const previewUrl = useMemo(
    () => (previewFile ? URL.createObjectURL(previewFile) : null),
    [previewFile]
  );
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: ModelCatalog) => {
        setCatalog(data.llm);
        setVideoCatalog(data.video);
        setLlmModel(data.llm[llmProvider].default);
        const models = data.llm.gemini.models;
        setCriticModel(models.length > 1 ? models[1] : data.llm.gemini.default);
      })
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (catalog) setLlmModel(catalog[llmProvider].default);
  }, [llmProvider, catalog]);

  useEffect(() => {
    if (catalog) {
      const models = catalog[criticProvider].models;
      const secondary = models.length > 1 ? models[1] : catalog[criticProvider].default;
      setCriticModel(secondary);
    }
  }, [criticProvider, catalog]);

  const providerVerified = catalog ? catalog[llmProvider].verified : false;
  const modelOptions = catalog ? catalog[llmProvider].models : [];
  const criticProviderVerified = catalog ? catalog[criticProvider].verified : false;
  const criticModelOptions = catalog ? catalog[criticProvider].models : [];

  function switchProvider(next: "gemini" | "openai") {
    setLlmProvider(next);
  }

  function switchCriticProvider(next: "gemini" | "openai") {
    setCriticProvider(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    if (!schemeText.trim() && !documentFile) {
      setError("Paste the scheme details or upload the scheme document.");
      setBusy(false);
      return;
    }

    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Scheme video",
          language,
          region,
          notes: notes.trim() || null,
          sceneCount,
          aspect,
          llmProvider,
          llmModel,
          criticProvider: useCritic && separateCriticLlm ? criticProvider : llmProvider,
          criticModel: useCritic && separateCriticLlm ? criticModel : llmModel,
          videoProvider,
          useCritic,
          schemeText: schemeText.trim() || null,
        }),
      });
      const created = (await createRes.json().catch(() => ({}))) as { project?: { id: string } };
      if (!createRes.ok || !created.project) {
        setError((created as { error?: string }).error ?? "Could not create the project.");
        setBusy(false);
        return;
      }
      const projectId = created.project.id;

      let documentAssetId: string | null = null;
      if (documentFile) {
        const form = new FormData();
        form.append("file", documentFile);
        form.append("kind", "document");
        form.append("projectId", projectId);
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: form });
        const uploaded = (await uploadRes.json().catch(() => ({}))) as {
          asset?: { id: string; kind: string };
          error?: string;
        };
        if (!uploadRes.ok || !uploaded.asset) {
          setError(uploaded.error ?? "The document failed to upload.");
          setBusy(false);
          return;
        }
        documentAssetId = uploaded.asset.id;

        // Keep project.schemeText clear so the worker extracts from the file.
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentAssetId }),
        });
      }

      const genRes = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
      });
      if (!genRes.ok) {
        const body = (await genRes.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "The storyboard could not be started.");
        setBusy(false);
        return;
      }

      router.push(`/studio/${projectId}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
    <form className="wizard" onSubmit={handleSubmit}>
      <section className="studio-panel wizard-unified-card">
        {/* ── Step 1: Video Details & Context ── */}
        <div className="wizard-section">
          <div className="wizard-section-header">
            <span className="wizard-section-tag">Step 1</span>
            <h2 className="wizard-section-title">About the Video</h2>
            <p className="wizard-section-desc">
              Define the title, audience region, localized narration language, and visual framing.
            </p>
          </div>

          <label className="field">
            <span className="field-label">Project title</span>
            <input
              className="field-input"
              type="text"
              placeholder="e.g. PM Vidyalaxmi Yojana 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>

          <div className="wizard-row">
            <label className="field">
              <span className="field-label">Narration language</span>
              <select
                className="field-input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={busy}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Region / context</span>
              <input
                className="field-input"
                type="text"
                placeholder="West Bengal"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={busy}
              />
            </label>

            <label className="field">
              <span className="field-label">Scenes</span>
              <select
                className="field-input"
                value={sceneCount}
                onChange={(e) => setSceneCount(Number(e.target.value))}
                disabled={busy}
              >
                {[4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} scenes
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Aspect ratio</span>
              <select
                className="field-input"
                value={aspect}
                onChange={(e) => setAspect(e.target.value as (typeof ASPECTS)[number])}
                disabled={busy}
              >
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Notes for the storyboard (optional)</span>
            <textarea
              className="field-input wizard-textarea"
              placeholder="Visual tone, people to feature, places to show, do's and don'ts…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        {/* ── Step 2: Scheme Source Material ── */}
        <div className="wizard-section">
          <div className="wizard-section-header">
            <span className="wizard-section-tag">Step 2</span>
            <h2 className="wizard-section-title">The Scheme Source</h2>
            <p className="wizard-section-desc">
              Paste the scheme text, or upload a PDF / DOCX / TXT document. Lumen extracts official wording, eligibility, and benefits.
            </p>
          </div>

          <label className="field">
            <span className="field-label">Scheme text</span>
            <textarea
              className="field-input wizard-textarea wizard-source"
              placeholder="Paste the official scheme details, eligibility, benefits, application process…"
              value={schemeText}
              onChange={(e) => setSchemeText(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="field">
            <span className="field-label">…or upload a scheme document</span>
            <input
              className="field-input wizard-file"
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            {documentFile && (
              <span className="wizard-filename" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                Selected: {documentFile.name}
                <button
                  type="button"
                  className="asset-view-btn"
                  aria-label={`Preview ${documentFile.name}`}
                  title={`Preview ${documentFile.name}`}
                  onClick={() => setPreviewFile(documentFile)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>
              </span>
            )}
          </label>
        </div>

        {/* ── Step 3: Brain & Generation Pipeline ── */}
        <div className="wizard-section">
          <div className="wizard-section-header">
            <span className="wizard-section-tag">Step 3</span>
            <h2 className="wizard-section-title">Brain &amp; Generation Pipeline</h2>
            <p className="wizard-section-desc">
              Configure the AI models for multimodal storyboard generation, compliance auditing, and video synthesis.
            </p>
          </div>

          <div className="wizard-row-pipeline">
            <label className="field">
              <span className="field-label">Storyboard Generator Provider</span>
              <div className="segmented segmented-equal">
                {(["gemini", "openai"] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className={`segmented-item${llmProvider === provider ? " is-active" : ""}`}
                    onClick={() => switchProvider(provider)}
                    disabled={busy}
                  >
                    <span className="segmented-value">
                      {catalog ? catalog[provider].label : provider}
                    </span>
                  </button>
                ))}
              </div>
            </label>

            <label className="field">
              <span className="field-label">Storyboard Model</span>
              <select
                className="field-input"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                disabled={busy || modelOptions.length === 0}
              >
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Video Generation Provider</span>
              <select
                className="field-input"
                value={videoProvider}
                onChange={(e) => setVideoProvider(e.target.value as VideoProviderName)}
                disabled={busy}
              >
                <option value="gemini">Google Gemini (Omni / gemini-omni-1.1-flash)</option>
              </select>
            </label>
          </div>

          {/* AI Critic Controls */}
          <div className="wizard-critic-box">
            <label className="wizard-fieldline wizard-check" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={useCritic}
                onChange={(e) => setUseCritic(e.target.checked)}
                disabled={busy}
              />
              <span>
                Run the AI critic audit after initial storyboard generation
                <small>Audits every scene against the scheme text, checks timing margins, and guarantees zero lip-sync artifacts.</small>
              </span>
            </label>

            {useCritic && (
              <div style={{ paddingLeft: "26px", borderLeft: "2px solid rgba(139, 92, 246, 0.35)", marginTop: "6px" }}>
                <label className="wizard-fieldline wizard-check" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={separateCriticLlm}
                    onChange={(e) => setSeparateCriticLlm(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    Use a separate LLM for the AI Critic agent
                    <small>Pick an independent model / provider for unbiased compliance auditing.</small>
                  </span>
                </label>

                {separateCriticLlm && (
                  <div className="wizard-row" style={{ marginTop: "0.85rem" }}>
                    <label className="field">
                      <span className="field-label">Critic LLM Provider</span>
                      <div className="segmented segmented-equal">
                        {(["gemini", "openai"] as const).map((provider) => (
                          <button
                            key={provider}
                            type="button"
                            className={`segmented-item${criticProvider === provider ? " is-active" : ""}`}
                            onClick={() => switchCriticProvider(provider)}
                            disabled={busy}
                          >
                            <span className="segmented-value">
                              {catalog ? catalog[provider].label : provider}
                            </span>
                          </button>
                        ))}
                      </div>
                    </label>

                    <label className="field">
                      <span className="field-label">Critic Model</span>
                      <select
                        className="field-input"
                        value={criticModel}
                        onChange={(e) => setCriticModel(e.target.value)}
                        disabled={busy || criticModelOptions.length === 0}
                      >
                        {criticModelOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Step 4: Verification, Alerts & Submit ── */}
        <div className="wizard-section" style={{ gap: "10px" }}>
          {!providerVerified && (
            <p className="wizard-keys-note">
              No verified {catalog ? catalog[llmProvider].label : llmProvider} key
              yet — add one on the{" "}
              <Link href="/settings">API keys</Link> page before generating.
            </p>
          )}

          {useCritic && separateCriticLlm && !criticProviderVerified && criticProvider !== llmProvider && (
            <p className="wizard-keys-note" style={{ marginTop: "0.4rem" }}>
              No verified {catalog ? catalog[criticProvider].label : criticProvider} key
              yet for the AI Critic — add one on the{" "}
              <Link href="/settings">API keys</Link> page.
            </p>
          )}

          {error && (
            <p className="auth-alert wizard-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block wizard-submit"
            disabled={busy}
          >
            {busy ? "Creating project…" : "Build the storyboard"}
          </button>
        </div>
      </section>
    </form>

      {/* ── Local file preview modal ── */}
      {previewFile && previewUrl && (
        <div
          className="asset-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${previewFile.name}`}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewFile(null); }}
        >
          <div className="asset-preview-box">
            <div className="asset-preview-header">
              <span className="asset-preview-title">{previewFile.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <a
                  href={previewUrl}
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
                  onClick={() => setPreviewFile(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="asset-preview-body">
              {previewFile.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={previewFile.name} className="asset-preview-img" />
              ) : previewFile.type === "application/pdf" || previewFile.type.startsWith("text/") ? (
                <iframe src={previewUrl} className="asset-preview-iframe" title={previewFile.name} />
              ) : (
                <div className="asset-preview-unsupported">
                  <p>Preview not available for <strong>{previewFile.type || previewFile.name}</strong>.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}