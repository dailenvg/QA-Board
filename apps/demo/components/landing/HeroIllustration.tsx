/** Inline SVG of a preview page with pins and an open thread. Decorative. */
export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 560 440"
      className="h-auto w-full drop-shadow-[0_28px_48px_rgb(20_20_19/0.18)]"
      role="img"
      aria-labelledby="hero-illustration-title"
    >
      <title id="hero-illustration-title">
        A preview page with three numbered pins and an open comment thread
      </title>
      <rect x="8" y="8" width="544" height="424" rx="28" className="fill-raised stroke-rule" />
      <path d="M8 36a28 28 0 0 1 28-28h488a28 28 0 0 1 28 28v28H8z" className="fill-sunken" />
      {[36, 56, 76].map((cx) => (
        <circle key={cx} cx={cx} cy="36" r="5" className="fill-rule-strong" />
      ))}
      <rect x="110" y="26" width="300" height="20" rx="10" className="fill-paper" />
      <text x="126" y="40" className="fill-muted font-sans text-[11px]">
        feature-pricing.preview.app
      </text>

      <rect x="40" y="96" width="220" height="22" rx="6" className="fill-ink" />
      <rect x="40" y="128" width="300" height="12" rx="6" className="fill-rule-strong" />
      <rect x="40" y="148" width="250" height="12" rx="6" className="fill-rule-strong" />
      <rect x="40" y="180" width="112" height="36" rx="18" className="fill-accent" />

      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x={40 + index * 166}
          y="248"
          width="148"
          height="150"
          rx="18"
          className={index === 1 ? "fill-accent-soft stroke-accent" : "fill-paper stroke-rule"}
        />
      ))}
      <rect
        x="206"
        y="248"
        width="148"
        height="150"
        rx="18"
        fill="none"
        strokeDasharray="6 6"
        className="stroke-accent"
      />
      <text x="214" y="242" className="fill-accent font-sans text-[10px] font-semibold">
        div.pricing-card · x 62% y 18%
      </text>

      {[
        { x: 152, y: 178, n: 1 },
        { x: 296, y: 274, n: 2 },
        { x: 486, y: 330, n: 3 },
      ].map((pin) => (
        <g key={pin.n} transform={`translate(${pin.x} ${pin.y})`}>
          <path
            d="M0 0V-14a14 14 0 1 1 14 14z"
            className="fill-accent stroke-raised"
            strokeWidth="3"
          />
          <text
            x="14"
            y="-9"
            textAnchor="middle"
            className="fill-on-accent font-sans text-[12px] font-bold"
          >
            {pin.n}
          </text>
        </g>
      ))}

      <g transform="translate(316 96)">
        <rect width="212" height="118" rx="20" className="fill-raised stroke-rule" />
        <circle cx="26" cy="28" r="10" className="fill-accent" />
        <rect x="44" y="22" width="70" height="10" rx="5" className="fill-ink" />
        <rect x="20" y="52" width="172" height="9" rx="4.5" className="fill-rule-strong" />
        <rect x="20" y="68" width="130" height="9" rx="4.5" className="fill-rule-strong" />
        <rect x="128" y="86" width="64" height="20" rx="10" className="fill-accent" />
      </g>
    </svg>
  );
}
