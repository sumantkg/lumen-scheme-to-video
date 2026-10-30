"use client";

import { useEffect, useState } from "react";

import LumenLogo from "@/components/site/LumenLogo";

type SessionUser = { name: string };

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auth-aware CTA without turning the static landing page dynamic.
  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.user) setUser({ name: data.user.name });
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header
      className={`site-header${scrolled ? " is-scrolled" : ""}`}
      id="header"
    >
      <div className="container nav-wrap">
        <a className="logo" href="#top" aria-label="Lumen home">
          <LumenLogo />
        </a>

        <nav
          className={`nav-links${open ? " is-open" : ""}`}
          id="navLinks"
          aria-label="Primary"
        >
          <a href="#features" onClick={() => setOpen(false)}>
            Features
          </a>
          <a href="#how" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="#showcase" onClick={() => setOpen(false)}>
            Showcase
          </a>
          <a href="#faq" onClick={() => setOpen(false)}>
            FAQ
          </a>
          <a href="#contact" onClick={() => setOpen(false)}>
            Contact
          </a>
        </nav>

        <div className="nav-actions">
          {user ? (
            <a href="/studio" className="btn btn-primary btn-sm">
              Open studio
            </a>
          ) : (
            <>
              <a href="/auth/login" className="btn btn-ghost nav-login-btn">
                Login
              </a>
              <a href="/auth/signup" className="btn btn-primary btn-sm">
                Sign up
              </a>
            </>
          )}
        </div>

        <button
          className={`nav-toggle${open ? " is-open" : ""}`}
          id="navToggle"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="navLinks"
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
