"use client";

import { useEffect, useState } from "react";

type Provider = "gemini" | "openai";

interface CredentialRow {
  id: string;
  provider: string;
  label: string | null;
  last4: string;
  verifiedAt: string | null;
}

interface ModelCatalog {
  llm: Record<
    Provider,
    { label: string; models: string[]; default: string; verified: boolean }
  >;
}

export default function ApiKeys() {
  const [catalog, setCatalog] = useState<ModelCatalog["llm"] | null>(null);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [provider, setProvider] = useState<Provider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [modelsRes, credsRes] = await Promise.all([
      fetch("/api/models"),
      fetch("/api/credentials"),
    ]);
    if (modelsRes.ok) {
      const data = (await modelsRes.json()) as ModelCatalog;
      setCatalog(data.llm);
    }
    if (credsRes.ok) {
      const data = (await credsRes.json()) as { credentials: CredentialRow[] };
      setCredentials(data.credentials);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          label: label.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        credential?: CredentialRow;
        models?: string[];
        error?: string;
      };
      if (!res.ok || !body.credential) {
        setError(body.error ?? "The key was not accepted.");
        return;
      }
      setApiKey("");
      setLabel("");
      setNotice(
        `Verified — ${body.models?.length ?? "model"} access confirmed. The key is stored encrypted.`
      );
      await load();
    } catch {
      setError("Network error while verifying the key.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, providerName: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/credentials/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCredentials((rows) => rows.filter((row) => row.id !== id));
      if (catalog) {
        const typedProvider = providerName as Provider;
        setCatalog((prev) =>
          prev ? { ...prev, [typedProvider]: { ...prev[typedProvider], verified: false } } : prev
        );
      }
    }
  }

  const active = catalog?.[provider];

  return (
    <div className="dash-view settings-view">
      <div className="dash-heading">
        <span className="eyebrow">Settings</span>
        <h1>API keys</h1>
        <p className="dash-lede">
          Lumen bills nothing of its own — paste the keys from your own Google
          Gemini or OpenAI account and every generation is charged to that
          account. Keys are encrypted (AES-256-GCM) and never shown again after
          saving; you will only see a masked suffix.
        </p>
      </div>

      {notice && <p className="billing-banner is-good settings-banner">{notice}</p>}
      {error && (
        <p className="auth-alert settings-banner" role="alert">
          {error}
        </p>
      )}

      <form className="studio-panel settings-form" onSubmit={handleSubmit}>
        <h2 className="wizard-title">Add or replace a key</h2>

        <div className="wizard-row">
          <label className="field">
            <span className="field-label">Provider</span>
            <select
              className="field-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              disabled={busy}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Label (optional)</span>
            <input
              className="field-input"
              type="text"
              placeholder="Work key"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">API key</span>
          <input
            className="field-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              provider === "gemini"
                ? "Paste your Gemini API key"
                : "Paste your OpenAI API key (sk-…)"
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
          />
          <span className="composer-hint">
            Pasted keys are verified against {active?.label ?? provider} before
            saving; an invalid key is rejected on the spot.
          </span>
        </label>

        <button type="submit" className="btn btn-primary" disabled={busy || apiKey.length < 10}>
          {busy ? "Verifying…" : "Verify & save"}
        </button>
      </form>

      <section className="settings-section">
        <h2>Saved keys</h2>
        {credentials.length === 0 ? (
          <p className="billing-empty">
            No keys saved yet. Add one above — you will need a verified Gemini
            or OpenAI key before a storyboard can be generated.
          </p>
        ) : (
          <ul className="credential-list">
            {credentials.map((cred) => (
              <li key={cred.id} className="credential-row">
                <div>
                  <strong>{cred.provider}</strong>
                  <span className="credential-meta">
                    {cred.label ?? "Label"} · {cred.last4}
                    {cred.verifiedAt ? ` · verified ${new Date(cred.verifiedAt).toLocaleDateString()}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void handleDelete(cred.id, cred.provider as Provider)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}