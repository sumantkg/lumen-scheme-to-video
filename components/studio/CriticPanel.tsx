"use client";

import type { CriticIssueView } from "@/lib/projects";

export default function CriticPanel({
  complianceScore,
  criticPassed,
  criticSummary,
  criticModel,
  issues,
  onRerun,
  running,
}: {
  complianceScore: number | null;
  criticPassed: boolean | null;
  criticSummary: string | null;
  criticModel?: string | null;
  issues: CriticIssueView[];
  onRerun: () => void;
  running: boolean;
}) {
  const score = complianceScore ?? 0;
  return (
    <section className="critic-panel">
      <header className="critic-head">
        <div>
          <span className="eyebrow">
            AI critic {criticModel ? <span style={{ opacity: 0.8, textTransform: "none", fontWeight: 400 }}>· {criticModel}</span> : null}
          </span>
          <h2>Compliance audit</h2>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onRerun}
          disabled={running}
        >
          {running ? "Auditing…" : "Re-run audit"}
        </button>
      </header>

      <div className="critic-score">
        <span className="critic-meter" aria-hidden="true">
          <span style={{ width: `${score}%` }} />
        </span>
        <strong>{score}/100</strong>
        {criticPassed ? (
          <span className="chip chip-ready">passed</span>
        ) : (
          <span className="chip chip-warn">needs work</span>
        )}
      </div>

      {criticSummary && <p className="critic-summary">{criticSummary}</p>}

      {issues.length === 0 ? (
        <p className="critic-empty">No issues filed — every scene checks out.</p>
      ) : (
        <ul className="critic-issues">
          {issues.map((issue) => (
            <li key={issue.id} className={`issue issue-${issue.severity}`}>
              <span className="issue-tag">
                {issue.sceneIndex ? `Scene ${issue.sceneIndex}` : "Global"} · {issue.category}
              </span>
              <p className="issue-desc">{issue.description}</p>
              {issue.resolution && (
                <p className="issue-res">→ {issue.resolution}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}