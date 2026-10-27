"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Next swaps this in when a render throws, so the
 * user gets a way forward instead of a stack trace.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] render error:", error);
  }, [error]);

  return (
    <main className="status-page">
      <div className="container status-inner">
        <p className="eyebrow">Something broke</p>
        <h1>That render didn&apos;t finish</h1>
        <p className="status-copy">
          An unexpected error interrupted the page. Trying again usually helps.
        </p>
        <div className="status-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <a className="btn btn-outline" href="/">
            Back to the homepage
          </a>
        </div>
        {error.digest && (
          <p className="status-digest">Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
