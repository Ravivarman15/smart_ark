import { describe, it, expect } from "vitest";
import {
  bucketOf,
  filterLogs,
  computeDelivery,
  type WaLogRow,
} from "./whatsappDelivery";

const row = (over: Partial<WaLogRow>): WaLogRow => ({
  id: Math.random().toString(36).slice(2),
  leadId: "L1",
  templateKey: "lead_welcome_neet",
  course: "NEET",
  counselorId: "c1",
  recipientKind: "lead",
  status: "queued",
  queuedAt: "2026-06-18T10:00:00.000Z",
  sentAt: null,
  deliveredAt: null,
  readAt: null,
  createdAt: "2026-06-18T10:00:00.000Z",
  ...over,
});

const names: Record<string, string> = { c1: "Asha", c2: "Ravi" };
const nameOf = (id: string | null) => (id ? names[id] ?? "Unknown" : "Unassigned");

describe("bucketOf", () => {
  it("classifies each lifecycle stage to one terminal bucket", () => {
    expect(bucketOf(row({ status: "queued" }))).toBe("queued");
    expect(bucketOf(row({ status: "sent", sentAt: "x" }))).toBe("sent");
    expect(bucketOf(row({ status: "sent", deliveredAt: "x" }))).toBe("delivered");
    expect(bucketOf(row({ status: "sent", deliveredAt: "x", readAt: "y" }))).toBe("read");
    expect(bucketOf(row({ status: "failed" }))).toBe("failed");
    expect(bucketOf(row({ status: "skipped" }))).toBe("skipped");
  });
});

describe("computeDelivery", () => {
  const rows = [
    row({ status: "read", sentAt: "a", deliveredAt: "b", readAt: "c", course: "NEET", counselorId: "c1" }),
    row({ status: "sent", deliveredAt: "b", course: "NEET", counselorId: "c1" }), // delivered
    row({ status: "sent", sentAt: "a", course: "JEE", counselorId: "c2" }), // sent only
    row({ status: "failed", course: "JEE", counselorId: "c2" }),
    row({ status: "queued", course: "Foundation", counselorId: null }),
    row({ status: "skipped", course: "Tuition", counselorId: "c1" }),
  ];

  it("buckets sum to total", () => {
    const a = computeDelivery(rows, nameOf);
    const b = a.buckets;
    expect(b.read + b.delivered + b.sent + b.queued + b.failed + b.skipped).toBe(b.total);
    expect(b.total).toBe(6);
    expect(b).toMatchObject({ read: 1, delivered: 1, sent: 1, failed: 1, queued: 1, skipped: 1 });
  });

  it("computes delivery / read / failure rates against dispatched", () => {
    const { rates } = computeDelivery(rows, nameOf);
    // dispatched = sent+delivered+read = 3; delivered(=delivered+read)=2 → 66.7%
    expect(rates.deliveryPct).toBeCloseTo(66.7, 1);
    expect(rates.readPct).toBeCloseTo(33.3, 1);
    // failure = failed/total = 1/6 → 16.7%
    expect(rates.failurePct).toBeCloseTo(16.7, 1);
  });

  it("groups by course / counselor / template / day", () => {
    const a = computeDelivery(rows, nameOf);
    const neet = a.byCourse.find((g) => g.name === "NEET")!;
    expect(neet.total).toBe(2);
    expect(neet.delivered).toBe(2); // one read (rolls up) + one delivered
    expect(a.byCounselor.find((g) => g.name === "Asha")!.total).toBe(3);
    expect(a.byCounselor.find((g) => g.name === "Unassigned")!.total).toBe(1);
    expect(a.byTemplate[0].name).toBe("lead_welcome_neet");
    expect(a.byDay).toHaveLength(1);
    expect(a.byDay[0].day).toBe("2026-06-18");
  });

  it("rates are zero-safe with no dispatched rows", () => {
    const { rates } = computeDelivery([row({ status: "queued" })], nameOf);
    expect(rates.deliveryPct).toBe(0);
    expect(rates.readPct).toBe(0);
  });
});

describe("filterLogs", () => {
  const rows = [
    row({ course: "NEET", counselorId: "c1", templateKey: "lead_welcome_neet", status: "sent", sentAt: "a" }),
    row({ course: "JEE", counselorId: "c2", templateKey: "lead_welcome_jee", status: "failed" }),
  ];
  it("filters by course / counselor / template / status bucket", () => {
    expect(filterLogs(rows, { course: "NEET" })).toHaveLength(1);
    expect(filterLogs(rows, { counselorId: "c2" })).toHaveLength(1);
    expect(filterLogs(rows, { templateKey: "lead_welcome_jee" })).toHaveLength(1);
    expect(filterLogs(rows, { status: "failed" })).toHaveLength(1);
    expect(filterLogs(rows, { status: "sent" })).toHaveLength(1);
    expect(filterLogs(rows, { course: "NEET", status: "failed" })).toHaveLength(0);
  });
});
