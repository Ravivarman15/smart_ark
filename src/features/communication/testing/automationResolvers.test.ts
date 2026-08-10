import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RecipientCandidate } from "../types/communication.types";

// ════════════════════════════════════════════════════════════════════════════
// PHASE B — RESOLVER-DRIVEN DISPATCH
//
// The acceptance test for this phase, stated plainly:
//
//   "Can a school turn Attendance Alert ON once, mark attendance tomorrow, and
//    have the correct parents receive the correct message — without anyone
//    selecting students or typing variables?"
//
// So these tests drive dispatch() with NO recipients and NO resolver, and
// assert the engine produced correctly-rendered messages on its own.
//
// Collaborators are mocked at the same seams the existing dispatcher test uses,
// so this verifies the dispatcher's and resolvers' own decisions rather than
// Supabase.
// ════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => ({
  queuedRows: [] as { context_id: string }[],
  examRow: null as Record<string, unknown> | null,
  examStudents: [] as RecipientCandidate[],
  absentStudents: [] as RecipientCandidate[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "exams") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: hoisted.examRow, error: null }) }),
          }),
        };
      }
      // message_queue dedupe read
      return {
        select: () => ({
          eq: () => ({ gte: () => ({ limit: () => Promise.resolve({ data: hoisted.queuedRows, error: null }) }) }),
        }),
      };
    },
    functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) },
  },
}));

vi.mock("../services/commsAutomationSettings.service", () => ({
  commsAutomationSettingsService: { get: vi.fn() },
}));
vi.mock("../services/aisensy.service", () => ({
  aisensyService: {
    enqueueBulk: vi.fn().mockImplementation((reqs: unknown[]) =>
      Promise.resolve({ queued: reqs.length }),
    ),
    dispatchViaEdge: vi.fn().mockResolvedValue({ dispatched: true }),
  },
}));
vi.mock("../services/commsTemplates.service", () => ({
  commsTemplatesService: { getByKey: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../services/commsAudit.service", () => ({
  commsAuditService: { log: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../services/orgContext.service", () => ({
  orgContextService: {
    vars: vi.fn().mockResolvedValue({
      org_name: "Bright Future Academy",
      org_short_name: "BFA",
      org_legal_name: "Bright Future Academy Pvt Ltd",
      org_phone: "",
      org_email: "",
      org_website: "",
      org_address: "",
    }),
  },
}));
vi.mock("../services/commsRecipients.service", () => ({
  commsRecipientsService: {
    studentsForExam: vi.fn(() => Promise.resolve(hoisted.examStudents)),
    absentToday: vi.fn(() => Promise.resolve(hoisted.absentStudents)),
    birthdaysOn: vi.fn(() => Promise.resolve([])),
    studentsWithFeeStatus: vi.fn(() => Promise.resolve([])),
  },
}));

import { commsDispatcherService } from "../services/commsDispatcher.service";
import { commsAutomationSettingsService } from "../services/commsAutomationSettings.service";
import { automationResolverService } from "../services/automationResolvers";
import { aisensyService } from "../services/aisensy.service";

const setting = (over: Record<string, unknown> = {}) =>
  ({
    eventKey: "exam_scheduled",
    enabled: true,
    channel: "whatsapp",
    timing: "immediate",
    templateKey: "exam_reminder",
    priority: 5,
    ...over,
  }) as never;

const student = (
  id: string,
  name: string,
  over: Partial<RecipientCandidate> = {},
): RecipientCandidate => ({
  id,
  kind: "student",
  name,
  phone: "+919876543210",
  meta: { parent_name: `Parent of ${name}`, batch_name: "CBSE" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.queuedRows = [];
  hoisted.examRow = {
    id: "exam-1",
    title: "Physics Unit Test",
    exam_date: "2026-08-20",
    start_time: "10:00:00",
    hall: "Senior Campus",
    subject_name: "Physics",
    standard_id: "std-10",
    standard_name: "10th Standard",
    batch_id: "batch-cbse",
    batch_name: "CBSE",
    faculty_name: "Mr Kumar",
    total_marks: 50,
  };
  hoisted.examStudents = [student("s1", "Arjun"), student("s2", "Akhil")];
  hoisted.absentStudents = [student("s1", "Arjun")];
});

// ─────────────────────────────────────────────────────────────────────────────
describe("THE ACCEPTANCE TEST — an event sends with zero operator input", () => {
  it("resolves recipients AND variables from an exam id alone", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());

    // No recipients. No resolve. Just the entity that changed.
    const res = await commsDispatcherService.dispatch("exam_scheduled", {
      entityId: "exam-1",
    });

    expect(res.skipped).toBe(false);
    expect(res.queued, "nothing was queued — the resolver produced no audience").toBe(2);

    const reqs = vi.mocked(aisensyService.enqueueBulk).mock.calls[0][0] as Array<{
      rendered: { body: string };
      recipient: { name: string };
    }>;
    const body = reqs[0].rendered.body;

    // Every fact below was typed by hand on the old page.
    expect(body).toContain("Physics Unit Test");
    expect(body).toContain("20 Aug 2026");
    expect(body).toContain("10:00 AM");
    expect(body).toContain("Senior Campus");
    // exam_reminder derives its AiSensy positional parameters from the body
    // (no explicit `variables` list), so adding {{org_name}} to it would shift
    // the provider's parameter order and break the approved template. It
    // therefore carries no sign-off — asserted here so the reason is recorded
    // rather than rediscovered.
    expect(body).not.toContain("{{");
    expect(body, "a tenant name leaked in").not.toContain("ARK Learning Arena");
  });

  it("renders each recipient's own name, not the first one's", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());
    await commsDispatcherService.dispatch("exam_scheduled", { entityId: "exam-1" });

    const reqs = vi.mocked(aisensyService.enqueueBulk).mock.calls[0][0] as Array<{
      rendered: { body: string };
    }>;
    expect(reqs).toHaveLength(2);
    expect(reqs[0].rendered.body).toContain("Arjun");
    expect(reqs[1].rendered.body).toContain("Akhil");
    expect(reqs[0].rendered.body, "both recipients rendered identically")
      .not.toEqual(reqs[1].rendered.body);
  });

  it("attendance resolves from the date with no entity id", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(
      setting({ eventKey: "attendance_absent", templateKey: "attendance_absent" }),
    );
    const res = await commsDispatcherService.dispatch("attendance_absent", {
      date: "2026-08-07",
    });
    expect(res.queued).toBe(1);
  });
});

describe("Backward compatibility", () => {
  it("an existing caller passing recipients + resolve is unchanged", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());
    const res = await commsDispatcherService.dispatch("exam_scheduled", {
      recipients: [student("x1", "Manual Student")],
      resolve: () => ({
        exam_name: "Manual Exam", exam_date: "01 Jan 2027",
        exam_time: "9:00 AM", venue: "Hall A",
        student_name: "Manual Student", parent_name: "Manual Parent",
      }),
    });
    expect(res.queued).toBe(1);
    const reqs = vi.mocked(aisensyService.enqueueBulk).mock.calls[0][0] as Array<{
      rendered: { body: string };
    }>;
    // The caller's values win — the registry was never consulted.
    expect(reqs[0].rendered.body).toContain("Manual Exam");
  });

  it("an event with no resolver and no recipients is skipped, not guessed", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(
      setting({ eventKey: "certificate_ready", templateKey: "certificate_ready" }),
    );
    const res = await commsDispatcherService.dispatch("certificate_ready", {});
    expect(res.skipped).toBe(true);
    expect(res.reason).toMatch(/no resolver/);
    expect(aisensyService.enqueueBulk).not.toHaveBeenCalled();
  });
});

describe("Communication preference is finally enforced", () => {
  it("a recipient set to NONE is not messaged", async () => {
    // communicationPreference.ts existed and was unit-tested, but no send path
    // called it — a student set to NONE was messaged anyway.
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());
    hoisted.examStudents = [
      student("s1", "Arjun", { meta: { parent_name: "Ravi", communication_preference: "NONE" } }),
      student("s2", "Akhil", { meta: { parent_name: "Sunil" } }),
    ];

    const res = await commsDispatcherService.dispatch("exam_scheduled", { entityId: "exam-1" });
    expect(res.queued, "the opted-out parent was messaged").toBe(1);

    const reqs = vi.mocked(aisensyService.enqueueBulk).mock.calls[0][0] as Array<{
      recipient: { name: string };
    }>;
    expect(reqs[0].recipient.name).toBe("Akhil");
  });

  it("EMAIL-only preference blocks a WhatsApp event", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting({ channel: "whatsapp" }));
    hoisted.examStudents = [
      student("s1", "Arjun", { meta: { parent_name: "Ravi", communication_preference: "EMAIL" } }),
    ];
    const res = await commsDispatcherService.dispatch("exam_scheduled", { entityId: "exam-1" });
    expect(res.queued).toBe(0);
  });

  it("an unset preference is not a restriction", async () => {
    // Most existing students predate the column. Treating blank as "blocked"
    // would silently switch off every automation for the whole roster.
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());
    hoisted.examStudents = [student("s1", "Arjun", { meta: { parent_name: "Ravi" } })];
    const res = await commsDispatcherService.dispatch("exam_scheduled", { entityId: "exam-1" });
    expect(res.queued).toBe(1);
  });
});

describe("One bad recipient never stops the batch", () => {
  it("a student with no phone is skipped and the rest still send", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());
    hoisted.examStudents = [
      student("s1", "Arjun", { phone: undefined }),
      student("s2", "Akhil"),
      student("s3", "Ananya"),
    ];
    const res = await commsDispatcherService.dispatch("exam_scheduled", { entityId: "exam-1" });
    expect(res.queued).toBe(2);
    expect(res.invalid).toBe(1);
  });
});

describe("REAL DATA — the shape ARK actually has", () => {
  it("still sends when an exam has no start_time and no venue", async () => {
    // Measured against the live database: 334 exams, 334 with an audience,
    // ZERO with a start_time or a hall. validateEnqueue rejects an unresolved
    // variable, so without a fallback this event would resolve the right
    // parents and then skip every one of them — the automation would look
    // enabled and send nothing.
    //
    // The mocked happy path above passes with a fully-populated exam. This is
    // the test that would have caught the real-world failure.
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());
    hoisted.examRow = {
      ...hoisted.examRow,
      start_time: null,
      hall: null,
    };

    const res = await commsDispatcherService.dispatch("exam_scheduled", { entityId: "exam-1" });
    expect(res.queued, "every recipient was skipped for missing variables").toBe(2);

    const reqs = vi.mocked(aisensyService.enqueueBulk).mock.calls[0][0] as Array<{
      rendered: { body: string };
    }>;
    // Truthful, not invented: no time is recorded, so the message says so.
    expect(reqs[0].rendered.body).toContain("TBA");
    expect(reqs[0].rendered.body).not.toContain("{{");
  });

  it("an exam with no date at all still resolves rather than skipping", async () => {
    // 111 of 334 live exams have no exam_date.
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting());
    hoisted.examRow = { ...hoisted.examRow, exam_date: null, start_time: null, hall: null };
    const res = await commsDispatcherService.dispatch("exam_scheduled", { entityId: "exam-1" });
    expect(res.queued).toBe(2);
  });
});

describe("Resolvers refuse to guess", () => {
  it("an exam with no standard and no batch resolves to nobody", async () => {
    // Not "everyone". An exam with neither dimension is a data problem, and
    // messaging the entire school because of it is unrecoverable.
    hoisted.examRow = { ...hoisted.examRow, standard_id: null, batch_id: null };
    hoisted.examStudents = [];
    const out = await automationResolverService.resolve("exam_scheduled", { entityId: "exam-1" });
    expect(out?.recipients ?? []).toEqual([]);
  });

  it("a missing exam id resolves to nobody with a reason", async () => {
    const out = await automationResolverService.resolve("exam_scheduled", {});
    expect(out?.recipients).toEqual([]);
    expect(out?.notes?.[0]).toMatch(/no exam id/);
  });

  it("registry keys are canonical automation events", async () => {
    const { AUTOMATION_EVENTS_BY_KEY } = await import("../constants/automationEvents");
    for (const key of automationResolverService.automatableEvents()) {
      expect(AUTOMATION_EVENTS_BY_KEY[key], `${key} is not a canonical event`).toBeTruthy();
    }
  });
});
