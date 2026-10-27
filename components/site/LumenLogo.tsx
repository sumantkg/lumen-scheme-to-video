export default function LumenLogo({ className = "lumen-brand-logo" }: { className?: string }) {
  return (
    <div className={className} aria-label="Lumen AI Video">
      <svg
        className="lumen-logo-svg"
        viewBox="0 0 280 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Neon play icon gradients */}
          <linearGradient id="neonCyanPurple" x1="10" y1="10" x2="80" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>

          <linearGradient id="neonAmberPurple" x1="75" y1="40" x2="20" y2="65" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>

          {/* Typography gradient — uniform brightness across all letters */}
          <linearGradient id="lumenChrome" x1="105" y1="20" x2="270" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="50%" stopColor="#edf0f4" />
            <stop offset="100%" stopColor="#e8ecf1" />
          </linearGradient>

          {/* Soft neon glow filter */}
          <filter id="lumenNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur2" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="blur2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ─── Glowing Particles ─── */}
        <circle cx="15" cy="35" r="1.5" fill="#38bdf8" opacity="0.8" />
        <circle cx="20" cy="18" r="2" fill="#22d3ee" opacity="0.9" filter="url(#lumenNeonGlow)" />
        <circle cx="80" cy="22" r="2.5" fill="#38bdf8" opacity="0.75" />
        <circle cx="70" cy="12" r="1.5" fill="#818cf8" opacity="0.8" />
        <circle cx="82" cy="72" r="2.2" fill="#c084fc" opacity="0.85" filter="url(#lumenNeonGlow)" />
        <circle cx="72" cy="78" r="1.5" fill="#a855f7" opacity="0.7" />
        <circle cx="15" cy="58" r="1.5" fill="#6366f1" opacity="0.6" />

        {/* ─── Outer Neon Rounded Triangle ─── */}
        <path
          d="M 22 18 C 22 13 27 10 32 13 L 80 39 C 84 41 84 47 80 49 L 32 75 C 27 78 22 75 22 70 Z"
          stroke="url(#neonCyanPurple)"
          strokeWidth="3.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#lumenNeonGlow)"
        />

        {/* ─── Inner Aperture Blades (Camera Shutter Effect) ─── */}
        <g stroke="url(#neonAmberPurple)" strokeWidth="2.2" strokeLinecap="round" opacity="0.95">
          <path d="M 23 44 C 36 28 54 26 68 34" />
          <path d="M 33 26 C 48 30 60 44 60 62" />
          <path d="M 38 68 C 50 64 64 54 74 42" />
        </g>

        {/* ─── Flowing Wave Ribbon entering the center ─── */}
        <path
          d="M 6 42 Q 14 38 22 43 T 36 43"
          stroke="#38bdf8"
          strokeWidth="2.6"
          strokeLinecap="round"
          filter="url(#lumenNeonGlow)"
        />

        {/* ─── Center Core Play Triangle ─── */}
        <path
          d="M 40 33 C 40 30.5 43 29 45 30.5 L 61 39.5 C 63 40.5 63 43.5 61 44.5 L 45 53.5 C 43 55 40 53.5 40 51 Z"
          stroke="#22d3ee"
          strokeWidth="2.8"
          fill="rgba(6, 6, 14, 0.75)"
          strokeLinejoin="round"
          filter="url(#lumenNeonGlow)"
        />

        {/* ─── Text: LUMEN ─── */}
        {/* L */}
        <path
          d="M 112 24 L 119 24 L 119 44 L 131 44 L 131 50 L 112 50 Z"
          fill="url(#lumenChrome)"
        />

        {/* U */}
        <path
          d="M 137 24 L 144 24 L 144 42 C 144 45 147 46 150 46 C 153 46 156 45 156 42 L 156 24 L 163 24 L 163 42 C 163 49 157 51 150 51 C 143 51 137 49 137 42 Z"
          fill="url(#lumenChrome)"
        />

        {/* M */}
        <path
          d="M 169 24 L 177 24 L 183.5 37 L 190 24 L 198 24 L 198 50 L 191.5 50 L 191.5 33 L 185.5 44 L 181.5 44 L 175.5 33 L 175.5 50 L 169 50 Z"
          fill="url(#lumenChrome)"
        />

        {/* E */}
        <g fill="url(#lumenChrome)">
          <path d="M 204 24 L 227 24 L 227 29.5 L 204 29.5 Z" />
          <path d="M 204 34.5 L 220 34.5 L 220 39.5 L 204 39.5 Z" />
          <path d="M 204 44.5 L 227 44.5 L 227 50 L 204 50 Z" />
        </g>

        {/* N */}
        <path
          d="M 234 24 L 241 24 L 253 42 L 253 24 L 259 24 L 259 50 L 252 50 L 240 32 L 240 50 L 234 50 Z"
          fill="url(#lumenChrome)"
        />
      </svg>
    </div>
  );
}
