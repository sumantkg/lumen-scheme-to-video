"use client";

import { useEffect, useRef } from "react";

export default function Hero() {
  const panelRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  /* Subtle 3D parallax on the preview panel (desktop, motion-safe only) */
  useEffect(() => {
    const panel = panelRef.current;
    const hero = heroRef.current;
    if (!panel || !hero) return;

    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    panel.style.transition = "transform .5s cubic-bezier(.22,1,.36,1)";

    const onMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      panel.style.transform = `perspective(1100px) rotateY(${x * 5}deg) rotateX(${
        -y * 5
      }deg)`;
    };
    const onLeave = () => {
      panel.style.transform = "";
    };

    hero.addEventListener("mousemove", onMove);
    hero.addEventListener("mouseleave", onLeave);
    return () => {
      hero.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseleave", onLeave);
    };
  }, []);



  return (
    <section className="hero" ref={heroRef}>
      <div className="container hero-grid">
        <div className="hero-copy">
          <h1 className="hero-title reveal">
            Turn a scheme PDF into{" "}
            <span className="gradient-text">a narrated video</span>
          </h1>

          <p className="hero-sub reveal">
            Lumen is the scheme-to-video studio for India. Upload a government
            scheme, and an AI storyboarder writes every scene with Bengali
            narration, an AI critic audits it against the official text, and
            each scene is rendered and voiced — no camera crew needed.
          </p>

          <div className="hero-cta-row reveal">
            <a href="/studio" className="btn btn-primary hero-main-cta">
              <span>Start in Studio</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a href="#how" className="btn btn-ghost hero-secondary-cta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
              <span>See how it works</span>
            </a>
          </div>
        </div>

        <div className="hero-panel reveal" ref={panelRef}>
          <div className="panel-glow" aria-hidden="true" />
          <div className="preview-card">
            <div className="preview-head">
              <div className="dots">
                <span />
                <span />
                <span />
              </div>
              <div className="preview-title">lumen / vidya-laxmi · scenes_ready</div>
              <div className="preview-badge">বাংলা</div>
            </div>

            <div className="preview-stage" id="previewStage">
              <div className="stage-scene scene-a" />
              <div className="stage-scene scene-b" />
              <div className="stage-scene scene-c" />
              <div className="stage-scan" />
              <div className="stage-hud">
                <span className="hud-label">scene 3 · narrating</span>
                <span className="hud-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>

            <div className="preview-foot">
              <div className="timeline">
                <span className="tl-progress" id="tlProgress" />
              </div>
              <div className="preview-meta">
                <span>00:00:12 / 00:00:30</span>
                <span className="meta-ok">● GPU x8</span>
              </div>
            </div>
          </div>

          <div className="floating-tag tag-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
            </svg>
            Real-time storyboard
          </div>
          <div className="floating-tag tag-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            AI critic · 92/100
          </div>
        </div>
      </div>


    </section>
  );
}
