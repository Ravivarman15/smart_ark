// Score → colour mapping. Written out in full because Tailwind cannot see
// class names built by string interpolation.
const SCORE_TONE = {
  success: { chip: "bg-ark-success/15", text: "text-ark-success", bar: "bg-ark-success" },
  warning: { chip: "bg-ark-warning/15", text: "text-ark-warning", bar: "bg-ark-warning" },
  danger: { chip: "bg-ark-danger/15", text: "text-ark-danger", bar: "bg-ark-danger" },
} as const;

export const scoreTone = (pct: number) =>
  pct >= 75 ? SCORE_TONE.success : pct >= 40 ? SCORE_TONE.warning : SCORE_TONE.danger;
