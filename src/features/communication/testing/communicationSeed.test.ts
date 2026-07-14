import { describe, it, expect } from "vitest";

import {
  normalizePhone,
  isValidPhone,
  validateEnqueue,
  dedupeKey,
  dropDuplicates,
} from "../utils/commsValidation";
import {
  MAX_RETRIES,
  shouldRetry,
  backoffMinutes,
  classifyFailure,
  planAfterFailure,
  nextRetryAt,
} from "../utils/retryPolicy";
import {
  renderMessage,
  asCommsTemplate,
  BUILTIN_TEMPLATES_BY_KEY,
} from "../utils/whatsappTemplates";

// ════════════════════════════════════════════════════════════════════════════
// COMMUNICATION QA — executable verification.
//
// Runs the REAL communication engines (phone/validation gate, retry policy,
// dedupe, template resolution) against realistic inputs and hand-verifies the
// results. This is the "no fake success" half: the same validation that decides
// whether a message may be queued is exercised here, so a regression that would
// let a broken message report "sent" fails the build.
//
// What this does NOT (and cannot) assert — see testing/README.md:
//   actual AiSensy delivery, webhook receipts, credential login verification,
//   RBAC at runtime, realtime, mobile. Those need the live edge functions +
//   provider account + applied migrations.
// ════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────────────
// 1. PHONE NORMALISATION & VALIDATION
// ──────────────────────────────────────────────────────────────────────────────
describe("comms — phone normalisation & validation", () => {
  it("normalises common Indian formats to +91XXXXXXXXXX", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("91-9876543210")).toBe("+919876543210");
    expect(normalizePhone("")).toBe("");
  });

  it("accepts plausible E.164 numbers and rejects junk", () => {
    expect(isValidPhone("9876543210")).toBe(true);
    expect(isValidPhone("+919876543210")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);   // too short
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone(undefined)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. ENQUEUE VALIDATION GATE — never queue an unsendable message
// ──────────────────────────────────────────────────────────────────────────────
describe("comms — enqueue validation gate", () => {
  const rendered = (over: Partial<{ body: string; missing: string[] }> = {}) => ({
    body: over.body ?? "Hi Aarav, your fee is due.",
    missing: over.missing ?? [],
  });

  it("passes a complete whatsapp message", () => {
    const r = validateEnqueue({ channel: "whatsapp", rendered: rendered(), recipient: { name: "Aarav", phone: "9876543210" } });
    expect(r.ok).toBe(true);
  });

  it("rejects a missing phone (whatsapp)", () => {
    const r = validateEnqueue({ channel: "whatsapp", rendered: rendered(), recipient: { name: "Aarav" } });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("no_phone");
  });

  it("rejects an invalid phone", () => {
    const r = validateEnqueue({ channel: "whatsapp", rendered: rendered(), recipient: { name: "Aarav", phone: "123" } });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("bad_phone");
  });

  it("rejects unresolved template variables (no broken placeholders sent)", () => {
    const r = validateEnqueue({
      channel: "whatsapp",
      rendered: rendered({ missing: ["amount_pending", "due_date"] }),
      recipient: { name: "Aarav", phone: "9876543210" },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_vars");
    expect(r.reason).toContain("amount_pending");
  });

  it("rejects an empty body", () => {
    const r = validateEnqueue({ channel: "whatsapp", rendered: rendered({ body: "  " }), recipient: { name: "Aarav", phone: "9876543210" } });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("empty_body");
  });

  it("does not require a phone for in_app channel", () => {
    const r = validateEnqueue({ channel: "in_app", rendered: rendered(), recipient: { name: "Aarav" } });
    expect(r.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. DE-DUPLICATION — no duplicate message for the same reason
// ──────────────────────────────────────────────────────────────────────────────
describe("comms — de-duplication", () => {
  it("dedupe key is stable across phone formatting and distinguishes context", () => {
    const a = dedupeKey({ templateKey: "fee_due_reminder", phone: "9876543210", contextType: "fee", contextId: "F1" });
    const b = dedupeKey({ templateKey: "fee_due_reminder", phone: "+91 98765 43210", contextType: "fee", contextId: "F1" });
    const c = dedupeKey({ templateKey: "fee_due_reminder", phone: "9876543210", contextType: "fee", contextId: "F2" });
    expect(a).toBe(b);     // formatting doesn't defeat dedupe
    expect(a).not.toBe(c); // different fee record → different message
  });

  it("drops later duplicates within a batch, keeping the first", () => {
    const items = [
      { id: "1", phone: "9876543210", t: "birthday_wish" },
      { id: "2", phone: "09876543210", t: "birthday_wish" }, // same person, same wish
      { id: "3", phone: "9000000000", t: "birthday_wish" },
    ];
    const { unique, dropped } = dropDuplicates(items, (i) => dedupeKey({ templateKey: i.t, phone: i.phone }));
    expect(unique).toHaveLength(2);
    expect(dropped).toBe(1);
    expect(unique[0].id).toBe("1");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. RETRY POLICY
// ──────────────────────────────────────────────────────────────────────────────
describe("comms — retry policy", () => {
  it("backoff schedule and retry ceiling", () => {
    expect(MAX_RETRIES).toBe(3);
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(1)).toBe(5);
    expect(backoffMinutes(2)).toBe(30);
    expect(backoffMinutes(9)).toBe(30); // clamps
    expect(shouldRetry(2)).toBe(true);
    expect(shouldRetry(3)).toBe(false);
  });

  it("classifies provider failures (4xx permanent, 5xx/429/network transient)", () => {
    expect(classifyFailure(400)).toBe("permanent");
    expect(classifyFailure(401)).toBe("permanent");
    expect(classifyFailure(429)).toBe("transient");
    expect(classifyFailure(500)).toBe("transient");
    expect(classifyFailure(0)).toBe("transient"); // network
  });

  it("plans the next state after a failure", () => {
    const from = new Date("2026-06-08T10:00:00.000Z");
    // transient, first failure → re-queue with +1 min backoff
    const t = planAfterFailure(0, 503, from);
    expect(t.status).toBe("queued");
    expect(t.retryCount).toBe(1);
    expect(t.retryAt).toBe(nextRetryAt(0, from));
    expect(t.retryAt).toBe("2026-06-08T10:01:00.000Z");

    // permanent (4xx) → fail immediately, no retryAt
    const p = planAfterFailure(0, 400, from);
    expect(p.status).toBe("failed");
    expect(p.retryAt).toBeUndefined();

    // transient but retries exhausted → fail
    const x = planAfterFailure(3, 500, from);
    expect(x.status).toBe("failed");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. TEMPLATE RESOLUTION — every one of the 11 communication types resolves
// ──────────────────────────────────────────────────────────────────────────────
describe("comms — all 11 communication templates resolve cleanly", () => {
  // One realistic variable bag per template key behind each menu item.
  const VAR_BAGS: Record<string, Record<string, string>> = {
    inquiry_followup: { name: "Mr. Rao", branch_name: "ARK Central", cta_url: "https://ark.test/book" },
    student_welcome: { branch_name: "ARK Central", student_name: "Aarav Sharma", batch_name: "Grade 8 - A" },
    staff_welcome: { staff_name: "Priya Nair", branch_name: "ARK Central", designation: "Senior Teacher" },
    staff_credentials: { staff_name: "Priya Nair", branch_name: "ARK Central", username: "priya.n", password: "Temp@123", login_url: "https://ark.test/login" },
    student_credentials: { parent_name: "Mr. Sharma", branch_name: "ARK Central", student_name: "Aarav Sharma", username: "aarav.s", password: "Temp@123", login_url: "https://ark.test/app" },
    exam_reminder: { student_name: "Aarav Sharma", exam_name: "Mid-Term Maths", exam_date: "12 Jun 2026", exam_time: "10:00 AM", venue: "Room 4" },
    exam_result: { student_name: "Aarav Sharma", exam_name: "Mid-Term Maths", marks: "82", total: "100", percentage: "82", grade: "A", report_url: "https://ark.test/r/1" },
    fee_status: { parent_name: "Mr. Sharma", student_name: "Aarav Sharma", batch_name: "Grade 8 - A", amount_paid: "₹10,000", amount_pending: "₹5,000", due_date: "30 Jun 2026" },
    fee_due_reminder: { amount_pending: "₹5,000", student_name: "Aarav Sharma", batch_name: "Grade 8 - A", due_date: "30 Jun 2026", pay_url: "https://ark.test/pay/1" },
    // Enterprise utility template: {{1}} parent {{2}} student {{3}} class
    // {{4}} section {{5}} attendance_date. `section` is intentionally NOT a
    // required variable (a section-less student must still be notified).
    attendance_absent: { parent_name: "Mr. Sharma", student_name: "Aarav Sharma", class: "10", section: "A", attendance_date: "08 Jun 2026" },
    attendance_corrected: { parent_name: "Mr. Sharma", student_name: "Aarav Sharma", attendance_date: "08 Jun 2026" },
    birthday_wish: { student_name: "Aarav Sharma", branch_name: "ARK Central" },
  };

  for (const [key, vars] of Object.entries(VAR_BAGS)) {
    it(`${key} → no missing vars, no broken placeholders`, () => {
      const builtin = BUILTIN_TEMPLATES_BY_KEY[key];
      expect(builtin, `builtin template "${key}" must exist`).toBeTruthy();
      const msg = renderMessage(asCommsTemplate(builtin), vars);
      expect(msg.missing, `unresolved: ${msg.missing.join(", ")}`).toHaveLength(0);
      expect(msg.body).not.toContain("{{");
      expect(msg.body).not.toContain("}}");
      // Button CTA URLs (if any) must also be fully substituted.
      for (const b of msg.buttons) {
        if (b.value) expect(b.value).not.toContain("{{");
      }
    });
  }

  it("a genuinely missing variable IS reported (gate would block the send)", () => {
    const builtin = BUILTIN_TEMPLATES_BY_KEY.fee_due_reminder;
    const msg = renderMessage(asCommsTemplate(builtin), { student_name: "Aarav Sharma" }); // omit amount/due/batch
    expect(msg.missing.length).toBeGreaterThan(0);
    const gate = validateEnqueue({ channel: "whatsapp", rendered: msg, recipient: { name: "Aarav", phone: "9876543210" } });
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe("missing_vars");
  });
});
