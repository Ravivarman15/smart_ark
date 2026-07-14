import { describe, it, expect } from "vitest";

import { buildAutomatedBatch } from "../utils/commsAutomation";
import { asCommsTemplate, BUILTIN_TEMPLATES_BY_KEY } from "../utils/whatsappTemplates";
import type { RecipientCandidate } from "../types/communication.types";

// ════════════════════════════════════════════════════════════════════════════
// AUTOMATION ENGINE — zero-manual-variable batch builder.
//
// Exercises the REAL renderMessage + validateEnqueue pipeline through
// buildAutomatedBatch: variables are resolved from each candidate's ERP `meta`
// (no manual entry), valid rows become enqueue requests, and bad rows are
// counted + skipped without ever throwing ("never stop the whole batch").
// ════════════════════════════════════════════════════════════════════════════

const absentTemplate = asCommsTemplate(BUILTIN_TEMPLATES_BY_KEY.attendance_absent);
const feeTemplate = asCommsTemplate(BUILTIN_TEMPLATES_BY_KEY.fee_due_reminder);

const student = (over: Partial<RecipientCandidate> = {}): RecipientCandidate => ({
  id: over.id ?? "s1",
  kind: "student",
  name: over.name ?? "Aarav Sharma",
  phone: "phone" in over ? over.phone : "9876543210",
  meta: { parent_name: "Mr. Sharma", batch_name: "Grade 8 - A", ...over.meta },
});

// The page's perRecipientDefaults for the absent flow. Mirrors
// SendAbsentAttendancePage — kept in step with the attendance_absent utility
// template ({{1}} parent {{2}} student {{3}} class {{4}} section {{5}} date).
const absentResolve = (c: RecipientCandidate) => ({
  student_name: c.name,
  parent_name: c.meta?.parent_name ?? c.name,
  class: c.meta?.class_name ?? c.meta?.batch_name ?? "",
  section: c.meta?.section ?? "-",
  attendance_date: "08 Jun 2026",
});

describe("automation — buildAutomatedBatch", () => {
  it("auto-resolves variables and queues an all-valid batch (no manual entry)", () => {
    const candidates = [student({ id: "a" }), student({ id: "b", name: "Diya Rao" })];
    const { requests, summary } = buildAutomatedBatch({
      template: absentTemplate,
      candidates,
      resolve: absentResolve,
      audienceKind: "attendance",
    });

    expect(summary.total).toBe(2);
    expect(summary.valid).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(requests).toHaveLength(2);
    // Variables came from ERP meta — body is fully rendered, no placeholders.
    expect(requests[0].rendered.body).not.toContain("{{");
    expect(requests[0].rendered.missing).toHaveLength(0);
    expect(requests[0].recipient.studentId).toBe("a");
  });

  it("skips a recipient with no phone but keeps the rest of the batch", () => {
    const candidates = [
      student({ id: "ok" }),
      student({ id: "nophone", phone: undefined }),
    ];
    const { requests, summary } = buildAutomatedBatch({
      template: absentTemplate,
      candidates,
      resolve: absentResolve,
    });

    expect(summary.total).toBe(2);
    expect(summary.valid).toBe(1);
    expect(summary.noPhone).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(requests).toHaveLength(1);
    expect(summary.invalidList[0].recipient).toBe("Aarav Sharma");
  });

  it("skips a recipient whose ERP data cannot resolve a required variable", () => {
    // fee_due_reminder needs amount_pending / batch_name / due_date — resolver
    // intentionally omits them, so the row is counted as missingVars + skipped.
    const { requests, summary } = buildAutomatedBatch({
      template: feeTemplate,
      candidates: [student({ id: "f1" })],
      resolve: (c) => ({ student_name: c.name }),
      audienceKind: "fee",
    });

    expect(summary.valid).toBe(0);
    expect(summary.missingVars).toBe(1);
    expect(requests).toHaveLength(0);
    expect(summary.invalidList[0].reason).toContain("amount_pending");
  });

  it("counts a mixed batch correctly and never throws", () => {
    const candidates = [
      student({ id: "ok1" }),
      student({ id: "ok2", name: "Diya Rao" }),
      student({ id: "bad", phone: "123" }), // invalid phone
      student({ id: "nophone", phone: undefined }),
    ];
    const { requests, summary } = buildAutomatedBatch({
      template: absentTemplate,
      candidates,
      resolve: absentResolve,
    });

    expect(summary.total).toBe(4);
    expect(summary.valid).toBe(2);
    expect(summary.noPhone).toBe(2); // bad_phone + no_phone both counted here
    expect(summary.skipped).toBe(2);
    expect(requests).toHaveLength(2);
  });

  it("returns an all-zero summary for an empty candidate list", () => {
    const { requests, summary } = buildAutomatedBatch({
      template: absentTemplate,
      candidates: [],
      resolve: absentResolve,
    });
    expect(summary).toEqual({
      total: 0,
      valid: 0,
      noPhone: 0,
      missingVars: 0,
      emptyBody: 0,
      skipped: 0,
      invalidList: [],
    });
    expect(requests).toHaveLength(0);
  });
});
