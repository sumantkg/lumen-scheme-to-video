import type { Metadata } from "next";
import "./globals.css";
import AmbientBackground from "@/components/site/AmbientBackground";
import ScrollEffects from "@/components/site/ScrollEffects";

export const metadata: Metadata = {
  title: "Lumen — AI Video Generation",
  description:
    "Turn a sentence into cinema. Lumen generates broadcast-quality video from text, images, and audio in seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Flag content as JS-capable before first paint so the reveal
            animation can start hidden without hiding content from no-JS users. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js-reveal')",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎬</text></svg>"
        />
      </head>
      <body>
        <AmbientBackground />
        {children}
        <ScrollEffects />
      </body>
    </html>
  );
}
