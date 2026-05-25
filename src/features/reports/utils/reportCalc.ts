// ─────────────────────────────────────────────────────────────────────────────
// Reports calc layer.
//
// ALL numeric work for the reports module happens here — never inside a
// page or component. Pure functions, deterministic, no React, no Supabase.
// ─────────────────────────────────────────────────────────────────────────────

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const toNumber = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : round2(sum(xs) / xs.length);

export const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : round2((part / whole) * 100);

export const growthPct = (curr: number, prev: number): number => {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return round2(((curr - prev) / Math.abs(prev)) * 100);
};

export const formatINR = (n: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("en-IN").format(Number.isFinite(n) ? n : 0);

export const formatPct = (n: number): string =>
  `${Number.isFinite(n) ? n.toFixed(1) : "0.0"}%`;

export const formatDate = (d?: string | Date | null): string => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return String(d);
  }
};

export const formatDateTime = (d?: string | Date | null): string => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
};

// ── Date-range helpers ──────────────────────────────────────────────────────
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const monthsAgoIso = (n: number): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

export const yearStartIso = (): string => {
  const d = new Date();
  d.setMonth(0, 1);
  return d.toISOString().slice(0, 10);
};

export const inRange = (
  iso: string | undefined | null,
  from?: string,
  to?: string,
): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
};

// ── Aggregation helpers ─────────────────────────────────────────────────────
export interface Bucket {
  key: string;
  total: number;
  count: number;
}

export const bucketBy = <T>(
  rows: T[],
  keyFn: (r: T) => string | undefined | null,
  valFn: (r: T) => number = () => 1,
): Bucket[] => {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const v = valFn(r);
    const ex = map.get(k);
    if (ex) {
      ex.total += v;
      ex.count += 1;
    } else {
      map.set(k, { key: k, total: v, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

export const groupMonthly = <T>(
  rows: T[],
  dateFn: (r: T) => string | undefined | null,
  valFn: (r: T) => number = () => 1,
  months = 6,
): { label: string; value: number }[] => {
  const now = new Date();
  const buckets: { label: string; key: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      label: d.toLocaleDateString(undefined, { month: "short" }),
      key,
      value: 0,
    });
  }
  const ix = new Map(buckets.map((b) => [b.key, b]));
  for (const r of rows) {
    const d = dateFn(r);
    if (!d) continue;
    const key = d.slice(0, 7);
    const b = ix.get(key);
    if (b) b.value += valFn(r);
  }
  return buckets.map(({ label, value }) => ({ label, value }));
};

// ── Pagination ──────────────────────────────────────────────────────────────
export const paginate = <T>(
  rows: T[],
  page: number,
  size: number,
): T[] => rows.slice((page - 1) * size, page * size);

// ── Text search ─────────────────────────────────────────────────────────────
export const fuzzyMatch = (haystack: string, needle: string): boolean => {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
};

// ── Correlation (used by performance-vs-attendance reports) ─────────────────
export const pearson = (xs: number[], ys: number[]): number => {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;
  const mx = avg(xs.slice(0, n));
  const my = avg(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : round2(num / denom);
};
