// ──────────────────────────────────────────────────────────────────────────────
// Help & Support — centralised calculation helpers.
// All SLA / response-time / NPS maths live here. Zero calc in UI.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  HelpAnalytics,
  SupportFeedback,
  SupportTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../types/help.types";

export const TICKET_CATEGORIES: TicketCategory[] = [
  "general",
  "fee",
  "exam",
  "attendance",
  "student",
  "staff",
  "login",
  "app_bug",
  "feature_request",
  "other",
];

export const TICKET_PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

export const TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
  "cancelled",
];

// SLA defaults per priority (minutes). Values mirror common enterprise tiers.
export const SLA_DEFAULTS: Record<
  TicketPriority,
  { firstResponse: number; resolution: number }
> = {
  urgent: { firstResponse: 60, resolution: 240 },
  high: { firstResponse: 120, resolution: 480 },
  medium: { firstResponse: 240, resolution: 1440 },
  low: { firstResponse: 480, resolution: 4320 },
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_user: "Waiting on user",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<
  TicketStatus,
  "default" | "positive" | "negative" | "warning" | "info"
> = {
  open: "info",
  in_progress: "warning",
  waiting_user: "warning",
  resolved: "positive",
  closed: "default",
  cancelled: "default",
};

export const PRIORITY_TONE: Record<
  TicketPriority,
  "default" | "positive" | "negative" | "warning" | "info"
> = {
  low: "default",
  medium: "info",
  high: "warning",
  urgent: "negative",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const isOpenStatus = (s: TicketStatus): boolean =>
  s === "open" || s === "in_progress" || s === "waiting_user";

export const minutesBetween = (a?: string | null, b?: string | null): number => {
  if (!a || !b) return 0;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.max(0, Math.round((t2 - t1) / 60_000));
};

export const ageMinutes = (createdAt?: string | null): number => {
  if (!createdAt) return 0;
  return minutesBetween(createdAt, new Date().toISOString());
};

export const formatDuration = (mins: number): string => {
  if (!mins || mins <= 0) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh > 0 ? `${d}d ${hh}h` : `${d}d`;
};

export interface SlaState {
  /** Minutes until SLA exhausts (negative when breached). */
  remainingMinutes: number;
  budgetMinutes: number;
  elapsedMinutes: number;
  /** 0..100, capped. */
  consumedPercent: number;
  breached: boolean;
  warn: boolean; // > 75% but not breached
}

export const slaFirstResponseState = (t: SupportTicket): SlaState => {
  const budget = t.slaFirstResponseMinutes;
  const elapsed = t.firstResponseAt
    ? minutesBetween(t.createdAt, t.firstResponseAt)
    : ageMinutes(t.createdAt);
  const remaining = budget - elapsed;
  const consumed = budget > 0 ? Math.min(100, Math.round((elapsed / budget) * 100)) : 0;
  return {
    budgetMinutes: budget,
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    consumedPercent: consumed,
    breached: !t.firstResponseAt && remaining < 0,
    warn: !t.firstResponseAt && remaining >= 0 && consumed >= 75,
  };
};

export const slaResolutionState = (t: SupportTicket): SlaState => {
  const budget = t.slaResolutionMinutes;
  const elapsed = t.resolvedAt
    ? minutesBetween(t.createdAt, t.resolvedAt)
    : ageMinutes(t.createdAt);
  const remaining = budget - elapsed;
  const consumed = budget > 0 ? Math.min(100, Math.round((elapsed / budget) * 100)) : 0;
  return {
    budgetMinutes: budget,
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    consumedPercent: consumed,
    breached: !t.resolvedAt && remaining < 0,
    warn: !t.resolvedAt && remaining >= 0 && consumed >= 75,
  };
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

// ── NPS ───────────────────────────────────────────────────────────────────
export const npsScore = (scores: number[]): number => {
  if (scores.length === 0) return 0;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const pct = (n: number) => Math.round((n / scores.length) * 100);
  return pct(promoters) - pct(detractors);
};

// ── Aggregation (used by the analytics service) ───────────────────────────
const emptyAnalytics = (): HelpAnalytics => ({
  totalTickets: 0,
  open: 0,
  inProgress: 0,
  waitingUser: 0,
  resolved: 0,
  closed: 0,
  cancelled: 0,
  slaBreachedFirstResponse: 0,
  slaBreachedResolution: 0,
  avgFirstResponseMinutes: 0,
  avgResolutionMinutes: 0,
  satisfactionAverage: 0,
  satisfactionCount: 0,
  npsScore: 0,
  npsResponses: 0,
  byCategory: [],
  byPriority: [],
  byAssignee: [],
  byDay: [],
  feedbackByKind: [],
});

export const aggregateAnalytics = (
  tickets: SupportTicket[],
  feedback: SupportFeedback[],
): HelpAnalytics => {
  const out = emptyAnalytics();
  out.totalTickets = tickets.length;

  const catMap = new Map<TicketCategory, { total: number; resolved: number }>();
  const priMap = new Map<TicketPriority, number>();
  const asgMap = new Map<string, { total: number; resolved: number }>();
  const dayMap = new Map<string, { total: number; resolved: number }>();

  let frSum = 0;
  let frCount = 0;
  let resSum = 0;
  let resCount = 0;
  let satSum = 0;
  let satCount = 0;

  for (const t of tickets) {
    switch (t.status) {
      case "open":
        out.open++;
        break;
      case "in_progress":
        out.inProgress++;
        break;
      case "waiting_user":
        out.waitingUser++;
        break;
      case "resolved":
        out.resolved++;
        break;
      case "closed":
        out.closed++;
        break;
      case "cancelled":
        out.cancelled++;
        break;
    }
    if (t.slaBreachedFirstResponse) out.slaBreachedFirstResponse++;
    if (t.slaBreachedResolution) out.slaBreachedResolution++;
    if (t.firstResponseAt) {
      frSum += minutesBetween(t.createdAt, t.firstResponseAt);
      frCount++;
    }
    if (t.resolvedAt) {
      resSum += minutesBetween(t.createdAt, t.resolvedAt);
      resCount++;
    }
    if (typeof t.satisfactionRating === "number") {
      satSum += t.satisfactionRating;
      satCount++;
    }

    const c = catMap.get(t.category) ?? { total: 0, resolved: 0 };
    c.total++;
    if (t.status === "resolved" || t.status === "closed") c.resolved++;
    catMap.set(t.category, c);

    priMap.set(t.priority, (priMap.get(t.priority) ?? 0) + 1);

    const assignee = t.assignedToName ?? "Unassigned";
    const a = asgMap.get(assignee) ?? { total: 0, resolved: 0 };
    a.total++;
    if (t.status === "resolved" || t.status === "closed") a.resolved++;
    asgMap.set(assignee, a);

    const day = t.createdAt.slice(0, 10);
    const d = dayMap.get(day) ?? { total: 0, resolved: 0 };
    d.total++;
    if (t.status === "resolved" || t.status === "closed") d.resolved++;
    dayMap.set(day, d);
  }

  out.avgFirstResponseMinutes = frCount > 0 ? Math.round(frSum / frCount) : 0;
  out.avgResolutionMinutes = resCount > 0 ? Math.round(resSum / resCount) : 0;
  out.satisfactionAverage = satCount > 0 ? Math.round((satSum / satCount) * 10) / 10 : 0;
  out.satisfactionCount = satCount;

  out.byCategory = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);
  out.byPriority = TICKET_PRIORITIES.map((priority) => ({
    priority,
    total: priMap.get(priority) ?? 0,
  }));
  out.byAssignee = Array.from(asgMap.entries())
    .map(([assignee, v]) => ({ assignee, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  out.byDay = Array.from(dayMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));

  const npsScores = feedback
    .filter((f) => f.kind === "nps" && typeof f.score === "number")
    .map((f) => f.score as number);
  out.npsResponses = npsScores.length;
  out.npsScore = npsScore(npsScores);

  const fbMap = new Map<SupportFeedback["kind"], number>();
  for (const f of feedback) fbMap.set(f.kind, (fbMap.get(f.kind) ?? 0) + 1);
  out.feedbackByKind = Array.from(fbMap.entries())
    .map(([kind, total]) => ({ kind, total }))
    .sort((a, b) => b.total - a.total);

  return out;
};

export const collectBrowserInfo = (): string => {
  if (typeof navigator === "undefined") return "";
  return [
    navigator.userAgent,
    `viewport=${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : ""}`,
    `lang=${navigator.language}`,
  ].join(" | ");
};
