import React from "react";

// ──────────────────────────────────────────────────────────────────────────────
// FEE COLLECTION TREND
//
// ┌── WHY THIS REPLACED BARS ──────────────────────────────────────────────┐
// │ The bar chart it replaces rendered EMPTY in production. Its animation  │
// │ was a Tailwind arbitrary value containing a CSS variable:              │
// │                                                                        │
// │   animate-[mk-bar-grow_0.7s_var(--mk-ease)_both]                       │
// │                                                                        │
// │ With fill-mode `both`, the element holds the keyframe's FROM state —   │
// │ `scaleY(0)` — until the animation runs. Anything that stops that       │
// │ shorthand resolving leaves every bar scaled to nothing, and the card   │
// │ shows month labels floating in blank space. Which is exactly what it   │
// │ did.                                                                   │
// │                                                                        │
// │ An SVG path removes the whole class of failure: the geometry lives in  │
// │ the markup, so the chart is VISIBLE even if no animation ever runs.    │
// │ Motion is layered on top via stroke-dashoffset — never a precondition  │
// │ for the chart being seen.                                              │
// └────────────────────────────────────────────────────────────────────────┘
//
// Illustrative figures, matching the caption under this dashboard. Not
// customer data, and not read from any tenant.
// ──────────────────────────────────────────────────────────────────────────────

/** Twelve months of collection, rising — the shape the copy describes. */
const SERIES = [38, 52, 44, 68, 57, 74, 63, 81, 70, 88, 76, 92];
const MONTHS = ["A", "M", "J", "J", "A", "S", "O", "N", "D", "J", "F", "M"];

const W = 300;
const H = 84;
const PAD = 8;

interface Pt { x: number; y: number }

/**
 * Catmull-Rom through the points, emitted as cubic béziers.
 *
 * A polyline reads as a sawtooth at this size. The curve is what makes it look
 * like a trend, which is the whole point of the panel.
 */
const buildPath = (pts: Pt[]): string =>
  pts.reduce((acc, p, i, a) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const p0 = a[i - 2] ?? a[i - 1];
    const p1 = a[i - 1];
    const p3 = a[i + 1] ?? p;
    const c1x = p1.x + (p.x - p0.x) / 6;
    const c1y = p1.y + (p.y - p0.y) / 6;
    const c2x = p.x - (p3.x - p1.x) / 6;
    const c2y = p.y - (p3.y - p1.y) / 6;
    return `${acc} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }, "");

export const FeeCollectionChart: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  const pts: Pt[] = SERIES.map((v, i) => ({
    x: PAD + (i * (W - PAD * 2)) / (SERIES.length - 1),
    y: H - PAD - (v / 100) * (H - PAD * 2),
  }));

  const line = buildPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${H} L ${pts[0].x.toFixed(2)} ${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-20 w-full sm:h-24"
        preserveAspectRatio="none"
        role="img"
        aria-label="Fee collection trending upward across the last twelve months"
      >
        <defs>
          {/* currentColor so the fill follows the accent token in both themes. */}
          <linearGradient id="mk-fee-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="text-accent">
          {/* Faint baseline grid — three lines, enough to give the curve a
              frame without competing with it. */}
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={PAD}
              x2={W - PAD}
              y1={PAD + t * (H - PAD * 2)}
              y2={PAD + t * (H - PAD * 2)}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill="url(#mk-fee-fill)" className={reduced ? undefined : "mk-chart-area"} />

          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            // Keeps the stroke 2px despite preserveAspectRatio="none" stretching
            // the viewBox horizontally — without it the line thins as it scales.
            vectorEffect="non-scaling-stroke"
            className={reduced ? undefined : "mk-chart-line"}
          />

          <circle
            cx={last.x}
            cy={last.y}
            r="3.5"
            fill="currentColor"
            className={reduced ? undefined : "mk-chart-dot"}
          />
        </g>
      </svg>

      <div className="mt-1 flex justify-between px-[2px]">
        {MONTHS.map((m, i) => (
          <span key={`${m}-${i}`} className="text-[7px] text-muted-foreground sm:text-[8px]">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
};
