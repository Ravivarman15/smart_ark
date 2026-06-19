// ──────────────────────────────────────────────────────────────────────────────
// WhatsApp Delivery analytics — pure aggregation (no I/O, fully unit-testable).
//
// Source of truth is lead_whatsapp_logs (one row per send attempt). The lifecycle
// is derived from the status + the *_at timestamps the send-aisensy drainer and
// the delivery webhook write back:
//   queued   → row created, awaiting drain
//   sent     → provider accepted (status='sent' or sent_at set)
//   delivered→ handset delivery (delivered_at set)
//   read     → read receipt (read_at set)
//   failed   → status='failed'
//   skipped  → status='skipped' (no phone / invalid — never dispatched)
// ──────────────────────────────────────────────────────────────────────────────

export interface WaLogRow {
  id: string;
  leadId: string;
  templateKey: string;
  course: string | null;
  counselorId: string | null;
  recipientKind: string | null;
  status: string;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DeliveryBuckets {
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface DeliveryRates {
  /** delivered / dispatched (sent+delivered+read), 0 when nothing dispatched. */
  deliveryPct: number;
  /** read / dispatched. */
  readPct: number;
  /** failed / total. */
  failurePct: number;
}

export interface DeliveryGroupRow {
  name: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface DeliveryAnalytics {
  buckets: DeliveryBuckets;
  rates: DeliveryRates;
  byCourse: DeliveryGroupRow[];
  byCounselor: DeliveryGroupRow[];
  byTemplate: DeliveryGroupRow[];
  byDay: Array<{ day: string; sent: number; delivered: number; read: number; failed: number }>;
}

export interface DeliveryFilters {
  course?: string;
  counselorId?: string;
  templateKey?: string;
  status?: string;
}

const pct = (num: number, den: number): number =>
  den <= 0 ? 0 : Math.round((num / den) * 1000) / 10;

/** Lifecycle bucket for one row. A row sits in exactly one terminal bucket so
 *  the cards sum to `total` — read implies delivered+sent, etc. are collapsed. */
export function bucketOf(row: WaLogRow): keyof Omit<DeliveryBuckets, "total"> {
  if (row.status === "failed") return "failed";
  if (row.status === "skipped") return "skipped";
  if (row.readAt) return "read";
  if (row.deliveredAt) return "delivered";
  if (row.status === "sent" || row.sentAt) return "sent";
  return "queued";
}

export function filterLogs(rows: WaLogRow[], f: DeliveryFilters): WaLogRow[] {
  return rows.filter((r) => {
    if (f.course && (r.course ?? "") !== f.course) return false;
    if (f.counselorId && (r.counselorId ?? "") !== f.counselorId) return false;
    if (f.templateKey && r.templateKey !== f.templateKey) return false;
    if (f.status && bucketOf(r) !== f.status) return false;
    return true;
  });
}

const emptyGroup = (name: string): DeliveryGroupRow => ({
  name, total: 0, sent: 0, delivered: 0, read: 0, failed: 0,
});

function groupBy(rows: WaLogRow[], keyOf: (r: WaLogRow) => string): DeliveryGroupRow[] {
  const m = new Map<string, DeliveryGroupRow>();
  for (const r of rows) {
    const k = keyOf(r) || "—";
    const g = m.get(k) ?? emptyGroup(k);
    g.total += 1;
    const b = bucketOf(r);
    // "read" rolls up into delivered+sent for the funnel-style group bars.
    if (b === "read") { g.read += 1; g.delivered += 1; g.sent += 1; }
    else if (b === "delivered") { g.delivered += 1; g.sent += 1; }
    else if (b === "sent") { g.sent += 1; }
    else if (b === "failed") { g.failed += 1; }
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export function computeDelivery(
  rows: WaLogRow[],
  counselorName: (id: string | null) => string,
): DeliveryAnalytics {
  const buckets: DeliveryBuckets = {
    queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, total: rows.length,
  };
  for (const r of rows) buckets[bucketOf(r)] += 1;

  const dispatched = buckets.sent + buckets.delivered + buckets.read;
  const rates: DeliveryRates = {
    deliveryPct: pct(buckets.delivered + buckets.read, dispatched),
    readPct: pct(buckets.read, dispatched),
    failurePct: pct(buckets.failed, buckets.total),
  };

  const dayMap = new Map<string, { sent: number; delivered: number; read: number; failed: number }>();
  for (const r of rows) {
    const day = r.createdAt.slice(0, 10);
    const d = dayMap.get(day) ?? { sent: 0, delivered: 0, read: 0, failed: 0 };
    const b = bucketOf(r);
    if (b === "read") { d.read += 1; d.delivered += 1; d.sent += 1; }
    else if (b === "delivered") { d.delivered += 1; d.sent += 1; }
    else if (b === "sent") { d.sent += 1; }
    else if (b === "failed") { d.failed += 1; }
    dayMap.set(day, d);
  }

  return {
    buckets,
    rates,
    byCourse: groupBy(rows, (r) => r.course ?? "Unspecified"),
    byCounselor: groupBy(rows, (r) => counselorName(r.counselorId)),
    byTemplate: groupBy(rows, (r) => r.templateKey),
    byDay: [...dayMap.entries()].sort().map(([day, v]) => ({ day, ...v })),
  };
}
