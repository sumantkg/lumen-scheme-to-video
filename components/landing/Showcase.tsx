const SHOTS = [
  {
    media: "media-1",
    tall: true,
    tag: "Education",
    title: "PM Vidyalaxmi — 100% interest subvention",
    by: "Scene 1 of 6 · Bengali",
  },
  {
    media: "media-2",
    tag: "Women & Child",
    title: "Kanyashree turns 18 — the renewal form",
    by: "Scene 4 of 6 · Bengali",
  },
  {
    media: "media-3",
    tag: "Solar",
    title: "PM-Surya Ghar: net metering explained",
    by: "Scene 2 of 6 · Bengali",
  },
  {
    media: "media-4",
    wide: true,
    tag: "Health",
    title: "Ayushman Bharat card at the empanelled hospital",
    by: "Scene 5 of 6 · Bengali",
  },
];

export default function Showcase() {
  return (
    <section className="section" id="showcase">
      <div className="container">
        <div className="section-head reveal">
          <span className="eyebrow">Showcase</span>
          <h2 className="section-title">
            Schemes, <span className="gradient-text">storyboarded by Lumen</span>
          </h2>
          <p className="section-sub">
            A few of the storyboards teams produced for Bengal this week.
          </p>
        </div>

        <div className="showcase-grid">
          {SHOTS.map((s) => (
            <figure
              className={`shot reveal${s.tall ? " shot-tall" : ""}${
                s.wide ? " shot-wide" : ""
              }`}
              key={s.title}
            >
              <div className={`shot-media ${s.media}`} />
              <figcaption>
                <span className="shot-tag">{s.tag}</span>
                <strong>{s.title}</strong>
                <span className="shot-by">{s.by}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
