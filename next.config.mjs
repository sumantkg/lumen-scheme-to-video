/**
 * Lumen — Next config.
 *
 * Security headers live in `securityHeaders()` below so they are unit-tested
 * by scripts/harden-test.ts instead of being trusted by eye.
 */

/**
 * Content-Security-Policy.
 *
 * The landing page loads Inter / Space Grotesk from Google Fonts and sets one
 * tiny inline script to flag JS-capable browsers before first paint, so those
 * two hosts (and inline script/style) are allowed. Everything else is
 * same-origin. Moving to next/font plus a per-request nonce would let us drop
 * both allowances — see "Hardening" in the README.
 */
function contentSecurityPolicy(dev) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self' blob:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'self' blob:",
  ].join("; ");
}

/**
 * The full header set, as Next expects it. `dev` is explicit rather than read
 * from the environment so both branches can be tested.
 */
export function securityHeaders({ dev = process.env.NODE_ENV !== "production" } = {}) {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
  ];

  // Only meaningful over HTTPS, and it would pin localhost to TLS if sent in
  // development.
  if (!dev) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework.
  poweredByHeader: false,
  // Native / binary deps that must stay outside the server bundle.
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "ffmpeg-static",
  ],
  experimental: {},
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
