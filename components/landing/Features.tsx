const FEATURES = [
  {
    icon: "icon-violet",
    title: "Text in, storyboard out",
    body: "Paste the scheme details or upload the official PDF. An AI storyboarder plans every scene — titles, visuals, on-screen text and Bengali narration timed to the second.",
    svg: (
      <>
        <path d="M4 7V5a1 1 0 0 1 1-1h2M20 7V5a1 1 0 0 0-1-1h-2M4 17v2a1 1 0 0 0 1 1h2M20 17v2a1 1 0 0 1-1 1h-2" />
        <path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" />
        <rect x="3" y="6" width="12" height="12" rx="2" />
      </>
    ),
  },
  {
    icon: "icon-cyan",
    title: "AI critic audit",
    body: "A second model fact-checks every scene against the scheme text — eligibility, benefits, dates, who to contact — files issues and refines the storyboard until it passes.",
    svg: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </>
    ),
  },
  {
    icon: "icon-pink",
    title: "Bengali voiceover",
    body: "Every scene is narrated with provider-grade TTS in the project language, placed on the scene timeline so voice and on-screen text line up.",
    svg: (
      <>
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
      </>
    ),
  },
  {
    icon: "icon-violet",
    title: "Per-scene clips",
    body: "Render actual footage for every scene with your own video provider key — text-to-video or reference-image guided, in your chosen aspect ratio and length.",
    svg: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  },
  {
    icon: "icon-cyan",
    title: "Your keys, your bill",
    body: "No Lumen billing, no credit packs. Paste your own Gemini or OpenAI keys, verify them in the app once, and every generation is charged to your account — stored encrypted.",
    svg: <path d="M13 2L3 14h9l-1 8 10-12h-9z" />,
  },
  {
    icon: "icon-pink",
    title: "West Bengal ready",
    body: "Defaults for বাংলা narration and West Bengal grounding — Bikash Bhavan, Arogyasathi, lao-ganjo scenes — all editable per project.",
    svg: (
      <>
        <path d="M12 22s8-3.5 8-10a8 8 0 1 0-16 0c0 6.5 8 10 8 10z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
];

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-head reveal">
          <span className="eyebrow">Capabilities</span>
          <h2 className="section-title">
            A script, an audit, and{" "}
            <span className="gradient-text">a finished video</span>
          </h2>
          <p className="section-sub">
            What used to take a production crew now fits behind an upload button.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article className="feature-card reveal" key={f.title}>
              <div className={`feature-icon ${f.icon}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {f.svg}
                </svg>
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
