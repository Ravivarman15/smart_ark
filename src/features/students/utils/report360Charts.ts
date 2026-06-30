// ──────────────────────────────────────────────────────────────────────────────
// Pure SVG chart generators for the Student 360° report.
//
// These return self-contained <svg> strings that embed directly into the print
// HTML, so charts render crisply in the PDF (and on screen) WITHOUT a live React
// tree, html2canvas, or any runtime chart library. Pure + unit-testable.
// ──────────────────────────────────────────────────────────────────────────────

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );

const COLOR = {
  accent: "#4f46e5",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  grid: "#e2e8f0",
  muted: "#64748b",
};

export const toneColor = (pct: number): string =>
  pct >= 75 ? COLOR.green : pct >= 40 ? COLOR.amber : COLOR.red;

export interface ChartPoint {
  label: string;
  value: number;
}

/** Line chart of percentages over time (marks trend). 0–100 y-axis. */
export function lineChartSvg(points: ChartPoint[], width = 540, height = 200): string {
  if (points.length === 0) return emptySvg(width, height, "No exam data");
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = points.length;
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;

  const gridLines = [0, 25, 50, 75, 100]
    .map(
      (g) =>
        `<line x1="${pad.l}" y1="${y(g)}" x2="${width - pad.r}" y2="${y(g)}" stroke="${COLOR.grid}" stroke-width="1"/>` +
        `<text x="${pad.l - 6}" y="${y(g) + 3}" text-anchor="end" font-size="9" fill="${COLOR.muted}">${g}</text>`
    )
    .join("");

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${x(i)}" cy="${y(p.value)}" r="3" fill="${COLOR.accent}"/>` +
        (n <= 12
          ? `<text x="${x(i)}" y="${height - 8}" text-anchor="middle" font-size="8" fill="${COLOR.muted}">${esc(p.label)}</text>`
          : "")
    )
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
    ${gridLines}
    <path d="${path}" fill="none" stroke="${COLOR.accent}" stroke-width="2"/>
    ${dots}
  </svg>`;
}

/** Horizontal bar chart (subject averages). Each bar coloured by its score. */
export function barChartSvg(items: ChartPoint[], width = 540): string {
  if (items.length === 0) return emptySvg(width, 120, "No subject data");
  const rowH = 26;
  const labelW = 110;
  const pad = { l: labelW, r: 40, t: 8, b: 8 };
  const height = pad.t + pad.b + items.length * rowH;
  const iw = width - pad.l - pad.r;

  const rows = items
    .map((it, i) => {
      const cy = pad.t + i * rowH;
      const w = (Math.max(0, Math.min(100, it.value)) / 100) * iw;
      return (
        `<text x="${labelW - 8}" y="${cy + rowH / 2 + 3}" text-anchor="end" font-size="10" fill="#0f172a">${esc(it.label)}</text>` +
        `<rect x="${pad.l}" y="${cy + 5}" width="${iw}" height="${rowH - 12}" rx="3" fill="${COLOR.grid}"/>` +
        `<rect x="${pad.l}" y="${cy + 5}" width="${w}" height="${rowH - 12}" rx="3" fill="${toneColor(it.value)}"/>` +
        `<text x="${pad.l + w + 4}" y="${cy + rowH / 2 + 3}" font-size="9" fill="${COLOR.muted}">${Math.round(it.value)}%</text>`
      );
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${rows}</svg>`;
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Donut chart (attendance breakdown) with a centre total + legend. */
export function donutChartSvg(segments: DonutSegment[], size = 180): string {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return emptySvg(size * 2.4, size, "No attendance data");
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const inner = r * 0.6;

  let angle = -Math.PI / 2;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const end = angle + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const ix2 = cx + inner * Math.cos(end);
      const iy2 = cy + inner * Math.sin(end);
      const ix1 = cx + inner * Math.cos(angle);
      const iy1 = cy + inner * Math.sin(angle);
      angle = end;
      return `<path d="M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${inner},${inner} 0 ${large} 0 ${ix1},${iy1} Z" fill="${s.color}"/>`;
    })
    .join("");

  const legendX = size + 10;
  const legend = segments
    .map(
      (s, i) =>
        `<rect x="${legendX}" y="${18 + i * 20}" width="10" height="10" rx="2" fill="${s.color}"/>` +
        `<text x="${legendX + 16}" y="${27 + i * 20}" font-size="10" fill="#0f172a">${esc(s.label)}: ${s.value}</text>`
    )
    .join("");

  const w = size * 2.4;
  return `<svg viewBox="0 0 ${w} ${size}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
    ${arcs}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="18" font-weight="700" fill="#0f172a">${total}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" fill="${COLOR.muted}">days</text>
    ${legend}
  </svg>`;
}

function emptySvg(width: number, height: number, msg: string): string {
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="11" fill="${COLOR.muted}">${esc(msg)}</text>
  </svg>`;
}
