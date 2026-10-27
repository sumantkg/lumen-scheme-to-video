const STEPS = [
  {
    num: "01",
    title: "Ingest it",
    body: "Paste the scheme text or upload the official PDF, DOCX, or TXT. Pick language, region, and scene count — that's the whole brief.",
  },
  {
    num: "02",
    title: "Audit it",
    body: "An AI critic reviews every scene against the scheme text and files issues on anything off-brief, then refines until it passes.",
  },
  {
    num: "03",
    title: "Publish it",
    body: "Renders per-scene clips, records the Bengali narration and merges it all into one ready-to-ship video.",
  },
];

export default function Steps() {
  return (
    <section className="section section-alt" id="how">
      <div className="container">
        <div className="section-head reveal">
          <span className="eyebrow">Workflow</span>
          <h2 className="section-title">
            From official notification to{" "}
            <span className="gradient-text">explainer video</span> in three moves
          </h2>
          <p className="section-sub">
            Upload, audit, publish. No scriptwriters or camera crews required.
          </p>
        </div>

        <div className="steps">
          <div className="step-line" aria-hidden="true" />
          {STEPS.map((s) => (
            <article className="step reveal" key={s.num}>
              <div className="step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
