import Link from "next/link";
import DashNav from "@/components/dashboard/DashNav";
import LogoutButton from "@/components/dashboard/LogoutButton";
import LumenLogo from "@/components/site/LumenLogo";
import { requireUser } from "@/lib/dal";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="container dash-header-inner">
          <Link className="logo" href="/" aria-label="Lumen home">
            <LumenLogo />
          </Link>

          <DashNav />

          <div className="dash-user">
            <span className="dash-name">{user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="container dash-main">{children}</main>
    </div>
  );
}