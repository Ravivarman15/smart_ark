import { describe, it, expect } from "vitest";
import {
  aggregateDelivery,
  buildContactHealth,
  communicationHealthScore,
  groupDeliveryByDay,
  isValidEmail,
  isValidMobile,
  mobileKey,
  type ContactRow,
  type DeliveryRow,
} from "../utils/feeCommsCalc";

// ════════════════════════════════════════════════════════════════════════════
// Fee Communication pure calculators — the maths behind the Health Center,
// Delivery Dashboard and Enterprise cards. No DB, no React.
// ════════════════════════════════════════════════════════════════════════════

describe("validators", () => {
  it("validates emails", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
  it("validates mobiles by 10-digit key", () => {
    expect(isValidMobile("9876543210")).toBe(true);
    expect(isValidMobile("+91 98765 43210")).toBe(true); // 12 digits → last 10
    expect(isValidMobile("12345")).toBe(false);
    expect(mobileKey("091-9876543210")).toBe("9876543210");
  });
});

describe("buildContactHealth", () => {
  const rows: ContactRow[] = [
    { id: "1", name: "A", email: "a@x.com", mobile: "9876543210" },
    { id: "2", name: "B", email: "a@x.com", mobile: "1234" }, // dup email, invalid mobile
    { id: "3", name: "C", email: "bad", mobile: "" }, // invalid email, missing mobile
    { id: "4", name: "D" }, // missing both
  ];
  const h = buildContactHealth(rows);
  it("counts availability + gaps", () => {
    expect(h.total).toBe(4);
    expect(h.emailAvailable).toBe(3);
    expect(h.whatsappAvailable).toBe(2);
    expect(h.missingEmail).toBe(1);
    expect(h.missingMobile).toBe(2);
    expect(h.invalidEmail).toBe(1);
    expect(h.invalidMobile).toBe(1);
    expect(h.duplicateEmail).toBe(2);
  });
  it("scores reachability (both valid)", () => {
    expect(h.contactScore).toBe(25); // only student 1 reachable on both
  });
});

describe("aggregateDelivery", () => {
  const rows: DeliveryRow[] = [
    { channel: "email", status: "delivered", retryCount: 0, createdAt: "2026-07-01T10:00:00Z", sentAt: "2026-07-01T10:00:00Z", deliveredAt: "2026-07-01T10:00:05Z" },
    { channel: "email", status: "failed", retryCount: 1, createdAt: "2026-07-01T11:00:00Z" },
    { channel: "whatsapp", status: "read", retryCount: 0, createdAt: "2026-07-01T12:00:00Z" },
    { channel: "whatsapp", status: "queued", retryCount: 2, createdAt: "2026-07-02T09:00:00Z" },
  ];
  const s = aggregateDelivery(rows);
  it("splits channel success + counts", () => {
    expect(s.total).toBe(4);
    expect(s.emailTotal).toBe(2);
    expect(s.whatsappTotal).toBe(2);
    expect(s.emailSuccessRate).toBe(50); // 1 of 2 delivered
    expect(s.whatsappSuccessRate).toBe(50); // read counts, queued doesn't
    expect(s.bounced).toBe(1);
    expect(s.retrying).toBe(1); // queued with retryCount>0
    expect(s.pending).toBe(1);
    expect(s.avgDeliveryMs).toBe(5000);
  });
  it("groups by day", () => {
    const days = groupDeliveryByDay(rows);
    expect(days).toHaveLength(2);
    expect(days[0].date).toBe("2026-07-01");
    expect(days[0].total).toBe(3);
  });
});

describe("communicationHealthScore", () => {
  it("leans on contacts when nothing sent", () => {
    const contact = buildContactHealth([{ id: "1", name: "A", email: "a@x.com", mobile: "9876543210" }]);
    const delivery = aggregateDelivery([]);
    expect(communicationHealthScore(contact, delivery)).toBe(100);
  });
  it("blends contact + delivery once sending", () => {
    const contact = buildContactHealth([
      { id: "1", name: "A", email: "a@x.com", mobile: "9876543210" },
      { id: "2", name: "B" },
    ]); // contactScore 50
    const delivery = aggregateDelivery([
      { channel: "email", status: "delivered", retryCount: 0, createdAt: "2026-07-01T10:00:00Z" },
    ]); // emailSuccess 100
    // 0.4*50 + 0.6*100 = 80
    expect(communicationHealthScore(contact, delivery)).toBe(80);
  });
});
