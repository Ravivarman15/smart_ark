// ──────────────────────────────────────────────────────────────────────────────
// Communication module — central calculation utilities.
// Single source of truth for delivery-rate / read-rate / failure-rate maths so
// no UI re-implements percentages.
// ──────────────────────────────────────────────────────────────────────────────

export const pct = (num: number, denom: number): number =>
  denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0;

export const formatPct = (n: number): string => `${pct(n, 1) * 1 || n.toFixed(1)}%`;

export const isFinalStatus = (s: string): boolean =>
  s === "delivered" || s === "read" || s === "failed" || s === "cancelled";

export const friendlyStatus = (s: string): string => {
  switch (s) {
    case "pending":
      return "Pending";
    case "queued":
      return "Queued";
    case "processing":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "cancelled":
      return "Cancelled";
    default:
      return s;
  }
};

export const statusTone = (
  s: string
): "default" | "positive" | "negative" | "warning" | "info" => {
  if (s === "delivered" || s === "read" || s === "sent") return "positive";
  if (s === "failed") return "negative";
  if (s === "queued" || s === "pending" || s === "processing") return "warning";
  if (s === "cancelled" || s === "skipped") return "default";
  return "info";
};

export const formatPhone = (raw?: string | null): string => {
  if (!raw) return "—";
  const t = raw.replace(/\D+/g, "");
  if (t.length === 10) return `+91 ${t.slice(0, 5)} ${t.slice(5)}`;
  if (t.length === 12 && t.startsWith("91")) return `+91 ${t.slice(2, 7)} ${t.slice(7)}`;
  return raw;
};

export const friendlyDate = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const friendlyDateTime = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const groupByDay = <T>(
  items: T[],
  pickIso: (t: T) => string | null | undefined
): Array<{ date: string; total: number }> => {
  const map = new Map<string, number>();
  for (const i of items) {
    const iso = pickIso(i);
    if (!iso) continue;
    const day = iso.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, total]) => ({ date, total }));
};
