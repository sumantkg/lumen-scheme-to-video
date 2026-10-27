const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Showcase", href: "#showcase" },
      { label: "How it works", href: "#how" },
      { label: "FAQ", href: "#faq" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Press", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Help center", href: "#faq" },
      { label: "API keys guide", href: "#" },
      { label: "Community", href: "#" },
      { label: "Status", href: "#" },
      { label: "Privacy", href: "#" },
    ],
  },
];

import LumenLogo from "@/components/site/LumenLogo";

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <a className="logo" href="#top" aria-label="Lumen home">
            <LumenLogo />
          </a>
          <p>
            The scheme-to-video studio for India. Upload it, audit it, ship it.
          </p>
          <div className="socials">
            <a href="#" aria-label="X">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.7L18.9 2zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20z" />
              </svg>
            </a>
            <a href="#" aria-label="YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M23 12s0-3.9-.5-5.7a3 3 0 0 0-2.1-2.1C18.6 3.7 12 3.7 12 3.7s-6.6 0-8.4.5A3 3 0 0 0 1.5 6.3C1 8.1 1 12 1 12s0 3.9.5 5.7a3 3 0 0 0 2.1 2.1c1.8.5 8.4.5 8.4.5s6.6 0 8.4-.5a3 3 0 0 0 2.1-2.1c.5-1.8.5-5.7.5-5.7zM9.8 15.4V8.6l6 3.4-6 3.4z" />
              </svg>
            </a>
            <a href="#" aria-label="GitHub">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z" />
              </svg>
            </a>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div className="footer-col" key={col.heading}>
            <h4>{col.heading}</h4>
            {col.links.map((l) => (
              <a href={l.href} key={l.label}>
                {l.label}
              </a>
            ))}
          </div>
        ))}
      </div>

      <div className="container footer-bottom">
        <span>© {year} Lumen Labs. All rights reserved.</span>
      </div>
    </footer>
  );
}
