import Link from "next/link";
import LumenLogo from "@/components/site/LumenLogo";

export default function AuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="logo auth-logo" href="/" aria-label="Lumen home">
          <LumenLogo />
        </Link>
        {children}
      </div>
      <p className="auth-back">
        <Link href="/">← Back to lumen.studio</Link>
      </p>
    </main>
  );
}
