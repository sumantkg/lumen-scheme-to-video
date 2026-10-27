"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/studio", label: "Studio" },
  { href: "/demo", label: "Editor demo" },
  { href: "/settings", label: "API keys" },
];

export default function DashNav() {
  const pathname = usePathname();

  return (
    <nav className="dash-nav" aria-label="Studio">
      {LINKS.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`dash-nav-link${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}