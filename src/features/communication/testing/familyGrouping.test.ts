import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  groupByFamily,
  applyFamilyGrouping,
  supportsFamilyGrouping,
  renderStudentLines,
} from "../utils/familyGrouping";
import type { RecipientCandidate } from "../types/communication.types";

// ════════════════════════════════════════════════════════════════════════════
// FAMILY GROUPING
//
// A parent with three children currently receives three separate WhatsApp
// messages when all three are absent. From their side that is spam from a
// number they are meant to trust.
//
// The risk in fixing it is the opposite failure: consolidating an event that
// is inherently about ONE student — a fee receipt, an exam result, a
// credential — produces a message that is ambiguous at best and leaks one
// child's data into another's context at worst. So grouping is opt-in per
// event, and these tests pin which events opt in.
// ════════════════════════════════════════════════════════════════════════════

const kid = (id: string, name: string, phone?: string): RecipientCandidate => ({
  id,
  kind: "student",
  name,
  phone,
  meta: { parent_name: "Ravi" },
});

describe("Grouping is opt-in per event", () => {
  it("attendance groups", () => {
    expect(supportsFamilyGrouping("attendance_absent")).toBe(true);
  });

  it("student-specific events do NOT group", () => {
    // Consolidating these would merge one child's marks, fees or password into
    // a message about another.
    for (const e of ["exam_published", "fee_due", "fee_paid", "student_credentials", "birthday_student"]) {
      expect(supportsFamilyGrouping(e), `${e} must not consolidate`).toBe(false);
    }
  });
});

describe("Siblings sharing a number collapse to one message", () => {
  it("three children on one parent number become one recipient", () => {
    const groups = groupByFamily([
      kid("s1", "Arjun", "+91 98765 43210"),
      kid("s2", "Akhil", "9876543210"),
      kid("s3", "Ananya", "09876543210"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].students.map((s) => s.name)).toEqual(["Ananya", "Akhil", "Arjun"].sort());
  });

  it("normalises formatting differences in the same number", () => {
    // Real imports store the same parent's number three different ways. Without
    // normalisation the grouping silently does nothing for most live data.
    const groups = groupByFamily([
      kid("s1", "A", "+919876543210"),
      kid("s2", "B", "98765 43210"),
    ]);
    expect(groups, "formatting variants were treated as different parents").toHaveLength(1);
  });

  it("different parents stay separate", () => {
    const groups = groupByFamily([
      kid("s1", "Arjun", "9876543210"),
      kid("s2", "Meera", "9000000000"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("a student with no phone is kept, not dropped", () => {
    // Dropping here would hide the problem from the pre-flight count; the
    // downstream validator rejects it with a proper reason instead.
    const groups = groupByFamily([kid("s1", "Arjun"), kid("s2", "Akhil", "9876543210")]);
    expect(groups).toHaveLength(2);
  });

  it("a too-short number is not treated as a match", () => {
    // Two students with "123" must not be merged into one family.
    const groups = groupByFamily([kid("s1", "A", "123"), kid("s2", "B", "123")]);
    expect(groups).toHaveLength(2);
  });
});

describe("Consolidated variables", () => {
  it("builds a per-child list with each child's own status", () => {
    const recipients = [
      kid("s1", "Arjun", "9876543210"),
      kid("s2", "Akhil", "9876543210"),
    ];
    const vars = {
      s1: { attendance_status: "Absent", parent_name: "Ravi" },
      s2: { attendance_status: "Present", parent_name: "Ravi" },
    };
    const out = applyFamilyGrouping(recipients, vars);

    expect(out.recipients).toHaveLength(1);
    expect(out.collapsed).toBe(1);
    const merged = out.variablesByRecipient[out.recipients[0].id];
    // Each child keeps its OWN status — the whole point. A consolidated
    // message saying all three were absent when one was present is worse
    // than three separate messages.
    expect(merged.student_list).toContain("Arjun — Absent");
    expect(merged.student_list).toContain("Akhil — Present");
    expect(merged.student_count).toBe("2");
  });

  it("a single child is left completely unchanged", () => {
    const recipients = [kid("s1", "Arjun", "9876543210")];
    const vars = { s1: { attendance_status: "Absent", student_name: "Arjun" } };
    const out = applyFamilyGrouping(recipients, vars);
    expect(out.collapsed).toBe(0);
    expect(out.variablesByRecipient.s1).toEqual(vars.s1);
    expect(out.variablesByRecipient.s1.student_list).toBeUndefined();
  });

  it("renders lines as flat text, because Meta params cannot carry a list", () => {
    const line = renderStudentLines([kid("a", "Arjun"), kid("b", "Akhil")], () => "Absent");
    expect(line).toBe("Arjun — Absent\nAkhil — Absent");
  });
});

describe("Credentials are never persisted", () => {
  const resolvers = readFileSync(
    join(__dirname, "..", "services", "automationResolvers.ts"), "utf8",
  );
  const drainer = readFileSync(
    join(__dirname, "..", "..", "..", "..", "supabase", "functions", "send-aisensy", "index.ts"),
    "utf8",
  );

  it("the password arrives at trigger time and is never re-derived", () => {
    // It is generated in memory at account creation and never stored, so a
    // resolver running later cannot read it. Trying would mean either storing
    // plaintext or regenerating — a breach, or a lockout.
    expect(resolvers).toMatch(/triggerData/);
    expect(resolvers).toMatch(/credentials must be supplied at trigger time/);
  });

  it("a credential send with no password resolves to nobody", () => {
    expect(resolvers).toMatch(/if \(!ctx\.entityId \|\| !password\)/);
  });

  it("the queue payload is redacted once the message is sent", () => {
    // message_queue is readable by every staff member with comms access. A
    // password sitting there after delivery is a standing breach.
    expect(drainer).toMatch(/const SECRET_KEYS/);
    expect(drainer).toMatch(/redactSecrets/);
    expect(drainer).toMatch(/__body.*redacted/);
  });

  it("redaction failure never turns a successful send into an error", () => {
    expect(drainer).toMatch(/redaction failed/);
  });

  it("the audit payload carries counts only, never variables", () => {
    const dispatcher = readFileSync(
      join(__dirname, "..", "services", "commsDispatcher.service.ts"), "utf8",
    );
    const audit = dispatcher.slice(dispatcher.indexOf("commsAuditService.log({"));
    const payload = audit.slice(audit.indexOf("payload:"), audit.indexOf("});"));
    expect(payload, "trigger data reaches the audit log").not.toMatch(/triggerData/);
    expect(payload, "raw variables reach the audit log").not.toMatch(/resolveVars|variables/);
  });
});
