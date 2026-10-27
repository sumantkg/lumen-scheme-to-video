const QUOTES = [
  {
    avatar: "av-1",
    initials: "AP",
    quote:
      "We used to brief an agency for a month to explain one scheme. Now we upload the notification PDF and have a Bengali storyboard the same afternoon.",
    name: "Ananya Pal",
    role: "District IEC Officer, West Bengal",
  },
  {
    avatar: "av-2",
    initials: "RS",
    quote:
      "The critic caught a date my draft had wrong — the universal credit period changed in the 2026 notification. Nobody reading the original text would've flagged it.",
    name: "Ritwik Sen",
    role: "Policy Comms Lead, State Secretariat",
  },
  {
    avatar: "av-3",
    initials: "MJ",
    quote:
      "My fieldwork team walks families through PM-Surya Ghar with these videos on a tablet. Bengali narration, subtitles, no jargon — uptake went up visibly.",
    name: "Mousumi Jha",
    role: "Block Development Officer",
  },
];

export default function Testimonials() {
  return (
    <section className="section section-alt" id="testimonials">
      <div className="container">
        <div className="section-head reveal">
          <span className="eyebrow">Loved by teams across Bengal</span>
          <h2 className="section-title">
            Offices are <span className="gradient-text">shipping faster</span>
          </h2>
        </div>

        <div className="quotes">
          {QUOTES.map((q) => (
            <figure className="quote reveal" key={q.name}>
              <div className="stars" aria-label="5 out of 5">
                ★★★★★
              </div>
              <blockquote>{q.quote}</blockquote>
              <figcaption>
                <span className={`avatar ${q.avatar}`}>{q.initials}</span>
                <span className="quote-who">
                  <strong>{q.name}</strong>
                  <small>{q.role}</small>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
