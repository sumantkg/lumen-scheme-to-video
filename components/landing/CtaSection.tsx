"use client";

import { useEffect, useRef, useState } from "react";

export default function CtaSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Automatically remove status text after 5 seconds
  useEffect(() => {
    if (statusMessage) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setStatusMessage("");
        setStatus("idle");
      }, 5000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [statusMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!name.trim()) {
      setStatus("error");
      setStatusMessage("Please enter your name.");
      return;
    }
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!validEmail) {
      setStatus("error");
      setStatusMessage("Please enter a valid email address.");
      return;
    }
    if (!message.trim() || message.trim().length < 5) {
      setStatus("error");
      setStatusMessage("Please enter your requirement message (min 5 characters).");
      return;
    }

    setBusy(true);
    setStatus("idle");
    setStatusMessage("");

    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit enquiry.");
      }

      setStatus("success");
      setStatusMessage(
        "Thank you! Your enquiry has been received. We will get back to you shortly."
      );
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again or email us directly."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section" id="contact">
      <div className="container">
        <div className="cta-panel enquiry-panel reveal">
          <div className="cta-glow" aria-hidden="true" />
          
          <h2 className="cta-title">
            Have questions? Let&apos;s connect.<br />
          </h2>
          
          <p className="cta-sub">
            Send us an enquiry, and our team will get back to you shortly.
          </p>

          <form className="enquiry-form" onSubmit={handleSubmit} noValidate>
            <div className="enquiry-row">
              <div className="enquiry-field">
                <input
                  type="text"
                  className="enquiry-input"
                  placeholder="Your Name"
                  aria-label="Your Name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="enquiry-field">
                <input
                  type="email"
                  className="enquiry-input"
                  placeholder="you@domain.com"
                  aria-label="Your Email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="enquiry-bottom-row">
              <div className="enquiry-field enquiry-textarea-wrap">
                <textarea
                  className="enquiry-textarea"
                  placeholder="Your Message&#10;Tell us about your requirements"
                  aria-label="Your Message"
                  rows={2}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary enquiry-btn"
                disabled={busy}
              >
                {busy ? (
                  <span>Sending…</span>
                ) : (
                  <>
                    <span>Send Enquiry</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>

          {statusMessage && (
            <p className={`enquiry-feedback ${status === "success" ? "is-success" : "is-error"}`}>
              {status === "success" ? "✓ " : "⚠ "}
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
