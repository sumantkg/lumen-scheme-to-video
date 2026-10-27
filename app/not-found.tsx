import Link from "next/link";

export default function NotFound() {
  return (
    <main className="status-page">
      <div className="container status-inner">
        <p className="eyebrow">404 — missing scene</p>
        <h1>This shot doesn&apos;t exist</h1>
        <p className="status-copy">
          The page you were looking for was cut, moved, or never rendered in the
          first place.
        </p>
        <div className="status-actions">
          <Link className="btn btn-primary" href="/">
            Back to the homepage
          </Link>
          <Link className="btn btn-outline" href="/studio">
            Open the studio
          </Link>
        </div>
      </div>
    </main>
  );
}
