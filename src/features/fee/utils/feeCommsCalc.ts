// ─────────────────────────────────────────────────────────────────────────────
// Fee Communication — PURE calculators (no React / no Supabase).
//
// The maths behind the Fee Communication Health Center, Delivery Dashboard and
// Enterprise cards. Everything here is a pure function over rows the service has
// already fetched from the EXISTING tables (`students`, `message_queue`) — no
// new engine, no duplicate analytics. Unit-tested directly.
// ─────────────────────────────────────────────────────────────────────────────

// ── Validation ────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC-lite email check — good enough to flag obviously-broken addresses. */
export const isValidEmail = (v?: string | null): boolean =>
  !!v && EMAIL_RE.test(v.trim());

/** Digits-only phone key (last 10 digits) — the dedupe + validity basis. */
export const mobileKey = (v?: string | null): string => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length < 7) return "";
  return d.length > 10 ? d.slice(-10) : d;
};

/** A mobile is valid when it yields a 10-digit Indian-style key. */
export const isValidMobile = (v?: string | null): boolean => mobileKey(v).length === 10;

// ── Contact model ─────────────────────────────────────────────────────────────
export interface ContactRow {
  id: string;
  name: string;
  admissionNo?: string;
  className?: string;
  section?: string;
  parentName?: string;
  /** Best email by the fee-receipt fallback chain (parent→mother→student). */
  email?: string;
  /** Best WhatsApp number by the fallback chain (parent→guardian→student). */
  mobile?: string;
}

export interface ContactHealth {
  total: number;
  emailAvailable: number;
  whatsappAvailable: number;
  missingEmail: number;
  missingMobile: number;
  invalidEmail: number;
  invalidMobile: number;
  duplicateEmail: number;
  duplicateMobile: number;
  /** 0–100 — share of students reachable on BOTH channels with valid contacts. */
  contactScore: number;
}

/** Summarise contact quality across the student body. */
export const buildContactHealth = (rows: ContactRow[]): ContactHealth => {
  const total = rows.length;
  const emailCounts = new Map<string, number>();
  const mobileCounts = new Map<string, number>();
  for (const r of rows) {
    const e = (r.email ?? "").trim().toLowerCase();
    if (e) emailCounts.set(e, (emailCounts.get(e) ?? 0) + 1);
    const m = mobileKey(r.mobile);
    if (m) mobileCounts.set(m, (mobileCounts.get(m) ?? 0) + 1);
  }

  let emailAvailable = 0,
    whatsappAvailable = 0,
    missingEmail = 0,
    missingMobile = 0,
    invalidEmail = 0,
    invalidMobile = 0,
    duplicateEmail = 0,
    duplicateMobile = 0,
    reachable = 0;

  for (const r of rows) {
    const e = (r.email ?? "").trim();
    const m = (r.mobile ?? "").trim();
    const emailOk = isValidEmail(e);
    const mobileOk = isValidMobile(m);
    if (e) emailAvailable += 1;
    else missingEmail += 1;
    if (m) whatsappAvailable += 1;
    else missingMobile += 1;
    if (e && !emailOk) invalidEmail += 1;
    if (m && !mobileOk) invalidMobile += 1;
    if (e && (emailCounts.get(e.toLowerCase()) ?? 0) > 1) duplicateEmail += 1;
    if (m && (mobileCounts.get(mobileKey(m)) ?? 0) > 1) duplicateMobile += 1;
    if (emailOk && mobileOk) reachable += 1;
  }

  return {
    total,
    emailAvailable,
    whatsappAvailable,
    missingEmail,
    missingMobile,
    invalidEmail,
    invalidMobile,
    duplicateEmail,
    duplicateMobile,
    contactScore: total ? Math.round((reachable / total) * 100) : 0,
  };
};

// ── Delivery model (message_queue rows, fee contexts only) ─────────────────────
export interface DeliveryRow {
  channel: string; // whatsapp | email
  status: string; // queued | processing | sent | delivered | read | failed | cancelled
  retryCount: number;
  createdAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  lastError?: string | null;
}

export interface DeliveryStats {
  total: number;
  queued: number;
  processing: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
  retrying: number;
  pending: number; // queued + processing
  emailSuccessRate: number; // delivered+read+sent over email total
  whatsappSuccessRate: number;
  emailTotal: number;
  whatsappTotal: number;
  /** Failed email sends — the closest signal to a bounce we have locally. */
  bounced: number;
  avgDeliveryMs: number | null;
}

const SUCCESS = new Set(["sent", "delivered", "read"]);

/** Aggregate message_queue delivery rows into the dashboard counts. */
export const aggregateDelivery = (rows: DeliveryRow[]): DeliveryStats => {
  const s: DeliveryStats = {
    total: rows.length,
    queued: 0,
    processing: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    cancelled: 0,
    retrying: 0,
    pending: 0,
    emailSuccessRate: 0,
    whatsappSuccessRate: 0,
    emailTotal: 0,
    whatsappTotal: 0,
    bounced: 0,
    avgDeliveryMs: null,
  };
  let emailOk = 0,
    waOk = 0;
  const deltas: number[] = [];
  for (const r of rows) {
    switch (r.status) {
      case "queued":
        s.queued += 1;
        break;
      case "processing":
        s.processing += 1;
        break;
      case "sent":
        s.sent += 1;
        break;
      case "delivered":
        s.delivered += 1;
        break;
      case "read":
        s.read += 1;
        break;
      case "failed":
        s.failed += 1;
        break;
      case "cancelled":
        s.cancelled += 1;
        break;
    }
    if (r.status === "queued" && r.retryCount > 0) s.retrying += 1;
    const ok = SUCCESS.has(r.status);
    if (r.channel === "email") {
      s.emailTotal += 1;
      if (ok) emailOk += 1;
      if (r.status === "failed") s.bounced += 1;
    } else {
      s.whatsappTotal += 1;
      if (ok) waOk += 1;
    }
    if (r.sentAt && r.deliveredAt) {
      const d = new Date(r.deliveredAt).getTime() - new Date(r.sentAt).getTime();
      if (Number.isFinite(d) && d >= 0) deltas.push(d);
    }
  }
  s.pending = s.queued + s.processing;
  s.emailSuccessRate = s.emailTotal ? Math.round((emailOk / s.emailTotal) * 100) : 0;
  s.whatsappSuccessRate = s.whatsappTotal ? Math.round((waOk / s.whatsappTotal) * 100) : 0;
  s.avgDeliveryMs = deltas.length
    ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
    : null;
  return s;
};

export interface DayPoint {
  date: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

/** Group delivery rows by day (ascending) for the trend charts. */
export const groupDeliveryByDay = (rows: DeliveryRow[]): DayPoint[] => {
  const map = new Map<string, { total: number; success: number; failed: number }>();
  for (const r of rows) {
    const day = (r.createdAt ?? "").slice(0, 10);
    if (!day) continue;
    const v = map.get(day) ?? { total: 0, success: 0, failed: 0 };
    v.total += 1;
    if (SUCCESS.has(r.status)) v.success += 1;
    if (r.status === "failed") v.failed += 1;
    map.set(day, v);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      ...v,
      successRate: v.total ? Math.round((v.success / v.total) * 100) : 0,
    }));
};

/** Group by YYYY-MM for the monthly success-rate chart. */
export const groupDeliveryByMonth = (rows: DeliveryRow[]): DayPoint[] => {
  const map = new Map<string, { total: number; success: number; failed: number }>();
  for (const r of rows) {
    const month = (r.createdAt ?? "").slice(0, 7);
    if (!month) continue;
    const v = map.get(month) ?? { total: 0, success: 0, failed: 0 };
    v.total += 1;
    if (SUCCESS.has(r.status)) v.success += 1;
    if (r.status === "failed") v.failed += 1;
    map.set(month, v);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      ...v,
      successRate: v.total ? Math.round((v.success / v.total) * 100) : 0,
    }));
};

/**
 * Overall Communication Health Score (0–100): a blend of contact reachability
 * and delivery success. Weighted 40% contacts, 60% delivery (delivery is the
 * outcome that matters most once contacts exist).
 */
export const communicationHealthScore = (
  contact: ContactHealth,
  delivery: DeliveryStats,
): number => {
  const deliveryScore =
    delivery.emailTotal + delivery.whatsappTotal === 0
      ? contact.contactScore // nothing sent yet — lean on contact quality
      : Math.round(
          (delivery.emailSuccessRate * delivery.emailTotal +
            delivery.whatsappSuccessRate * delivery.whatsappTotal) /
            (delivery.emailTotal + delivery.whatsappTotal),
        );
  return Math.round(contact.contactScore * 0.4 + deliveryScore * 0.6);
};

/** Human-readable duration for "average delivery time". */
export const formatDuration = (ms: number | null): string => {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
};
