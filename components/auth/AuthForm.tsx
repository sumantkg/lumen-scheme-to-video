"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "signup";

export default function AuthForm({
  mode,
  initialEmail = "",
  redirectTo = "/studio",
}: {
  mode: Mode;
  initialEmail?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload = isSignup ? { name, email, password } : { email, password };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        if (data.fields) setFieldErrors(data.fields);
        setBusy(false);
        return;
      }

      // Full navigation so the server picks up the new session cookie.
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  const fieldError = (key: string) => fieldErrors[key]?.[0];

  return (
    <>
      <h1 className="auth-title">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="auth-sub">
        {isSignup
          ? "Start rendering in seconds. No credit card required."
          : "Sign in to return to your studio."}
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {isSignup && (
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="field-input"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            {fieldError("name") && (
              <span className="field-error">{fieldError("name")}</span>
            )}
          </label>
        )}

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="field-input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@studio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          {fieldError("email") && (
            <span className="field-error">{fieldError("email")}</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              className="field-input"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              style={{ paddingRight: "2.75rem", width: "100%" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={busy}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: "0.75rem",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0.25rem",
                display: "flex",
                alignItems: "center",
                color: "var(--muted, #888)",
                lineHeight: 0,
              }}
            >
              {showPassword ? (
                /* Eye-off icon */
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                /* Eye icon */
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </span>
          {fieldError("password") && (
            <span className="field-error">{fieldError("password")}</span>
          )}
        </label>

        {error && (
          <p className="auth-alert" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="auth-switch">
        {isSignup ? (
          <>
            Already have an account? <Link href="/auth/login">Sign in</Link>
          </>
        ) : (
          <>
            New to Lumen? <Link href="/auth/signup">Create an account</Link>
          </>
        )}
      </p>
    </>
  );
}
