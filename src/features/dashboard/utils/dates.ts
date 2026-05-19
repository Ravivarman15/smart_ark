// Pure date helpers used by analytics services. NO React, NO Supabase.
// Returns YYYY-MM-DD strings (Supabase `date` column friendly).

const toIsoDate = (d: Date): string => d.toISOString().split("T")[0];

export const today = (): string => toIsoDate(new Date());

export const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
};

export const daysAhead = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/**
 * Inclusive list of YYYY-MM-DD between `from` and `to`. Used to fill
 * empty days in a series so the chart line stays continuous.
 */
export const dateRange = (from: string, to: string): string[] => {
  const out: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toIsoDate(d));
  }
  return out;
};

/** First day of the current month. */
export const monthStart = (): string => {
  const d = new Date();
  d.setDate(1);
  return toIsoDate(d);
};
