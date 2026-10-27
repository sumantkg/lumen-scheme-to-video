"use client";

import { useRef } from "react";

const FAQS = [
  {
    q: "Who owns the videos I make?",
    a: "You do — and nothing you generate is stored on Lumen's training side. Your scheme documents and storyboards stay in your own project space.",
  },
  {
    q: "Do I need Lumen credits or a paid plan?",
    a: "No. Lumen doesn't bill for generation at all. You paste your own Google Gemini and OpenAI API keys in Settings; they're verified once, stored encrypted (AES-256-GCM), and every generation is charged to your account at the provider's rates.",
  },
  {
    q: "What documents does it accept?",
    a: "PDF, DOCX, and TXT. Paste the scheme text directly if you prefer. Lumen extracts the official wording — eligibility, benefits, dates, contacts — and grounds the storyboard in it, plus any reference photos you attach.",
  },
  {
    q: "Can the storyboard be wrong? How do I check?",
    a: "That's what the AI critic is for. After the storyboard is written, a second model audits every scene against the scheme text, files issues with severities, and refines the scenes it flagged — it won't say 'ready' until it passes. You can re-run the audit any time and edit scenes by hand.",
  },
  {
    q: "Which narrative languages does it support?",
    a: "Bengali by default (with West Bengal grounding), plus English, Hindi, and any language you add per project. Narration uses the provider's own TTS so voices match the accent of your audience; an optional gTTS fallback exists for no-key environments.",
  },
];

export default function Faq() {
  const refs = useRef<(HTMLDetailsElement | null)[]>([]);

  const handleToggle = (index: number) => (
    e: React.SyntheticEvent<HTMLDetailsElement>
  ) => {
    if (!e.currentTarget.open) return;
    refs.current.forEach((d, i) => {
      if (d && i !== index) d.open = false;
    });
  };

  return (
    <section className="section section-alt" id="faq">
      <div className="container container-narrow">
        <div className="section-head reveal">
          <span className="eyebrow">Questions</span>
          <h2 className="section-title">Good to know</h2>
        </div>

        <div className="faq-list">
          {FAQS.map((item, i) => (
            <details
              className="faq-item reveal"
              key={item.q}
              ref={(el) => {
                refs.current[i] = el;
              }}
              onToggle={handleToggle(i)}
            >
              <summary>{item.q}</summary>
              <div className="faq-body">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
