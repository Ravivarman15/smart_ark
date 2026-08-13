import { describe, it, expect, vi, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// ENTERPRISE ATTENDANCE WHATSAPP AUTOMATION
//
// Verifies the contract the feature is defined by:
//   • attendance submits successfully even when WhatsApp fails
//   • the provider is called IMMEDIATELY (synchronously), not queued
//   • NO QUEUE IS USED — no row is ever written in 'queued' state, so the
//     send-aisensy drainer (which claims only status='queued') can never see it
//   • duplicate prevention (student + date) — atomic, via the unique index
//   • missing / invalid parent mobile handled and reported, never silent
//   • comms_audit + lead_whatsapp_logs + the ledger are all written
//   • ABSENT → PRESENT sends the correction
//   • dashboard counters reflect what was actually sent
//
// The Supabase mock below emulates the real DB semantics that matter: the
// PARTIAL UNIQUE INDEX on (context_type, context_id, payload->>attendance_date)
// WHERE status NOT IN ('failed','cancelled'). Duplicate suppression is asserted
// against that behaviour, not against an if-statement in the service.
// ════════════════════════════════════════════════════════════════════════════

interface QueueRow {
  id: string;
  context_type: string;
  context_id: string;
  status: string;
  payload: Record<string, unknown>;
  recipient_phone: string | null;
  recipient_student_id: string | null;
  recipient_name: string | null;
  last_error: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  created_at: string;
}

const store = vi.hoisted(() => ({
  students: [] as Record<string, unknown>[],
  queue: [] as QueueRow[],
  waLogs: [] as Record<string, unknown>[],
  /** Every send-aisensy invocation — the proof the call was immediate. */
  invokes: [] as { body: unknown }[],
  direct: { ok: true, providerMessageId: "wamid.TEST", error: null as string | null, transient: false },
  seq: 0,
}));

/** The partial unique index: only live rows occupy the key. */
const LIVE = (s: string) => s !== "failed" && s !== "cancelled";
const keyOf = (r: { context_type: string; context_id: string; payload: Record<string, unknown> }) =>
  `${r.context_type}|${r.context_id}|${String(r.payload?.attendance_date ?? "")}`;

vi.mock("@/integrations/supabase/client", () => {
  const run = (
    table: string,
    op: "select" | "insert" | "update",
    state: { row?: Record<string, unknown>; patch?: Record<string, unknown> },
    f: Record<string, unknown>,
  ) => {
    // The tenant's own identity. Without this the mock returned nothing,
    // org_name resolved to "" and the sign-off assertion proved nothing —
    // while in production an EMPTY {{6}} is a parameter Meta rejects outright.
    if (table === "organizations" && op === "select") {
      return { data: { id: "org-1", display_name: ORG_NAME, legal_name: ORG_NAME, slug: "test-org" }, error: null };
    }

    if (table === "students" && op === "select") {
      const ids = (f["id__in"] as string[]) ?? [];
      return { data: store.students.filter((s) => ids.includes(s.id as string)), error: null };
    }

    if (table === "message_queue" && op === "select") {
      // Two query shapes hit this table:
      //   existingNotices() → .eq(context_type).eq(date).in(context_id, ids)
      //   attendanceComms.list() → .in(context_type, [...]).gte(date).lte(date)
      const ids = f["context_id__in"] as string[] | undefined;
      const types = f["context_type__in"] as string[] | undefined;
      const rows = store.queue.filter((r) => {
        const d = String(r.payload?.attendance_date ?? "");
        if (types && !types.includes(r.context_type)) return false;
        if (f["context_type"] && r.context_type !== f["context_type"]) return false;
        if (f["payload->>attendance_date"] && d !== f["payload->>attendance_date"]) return false;
        if (f["gte:payload->>attendance_date"] && d < String(f["gte:payload->>attendance_date"])) return false;
        if (f["lte:payload->>attendance_date"] && d > String(f["lte:payload->>attendance_date"])) return false;
        if (ids && !ids.includes(r.context_id)) return false;
        return true;
      });
      return { data: rows, error: null };
    }

    if (table === "comms_audit" && op === "select") {
      return { data: [], error: null, count: 0 };
    }

    if (table === "message_queue" && op === "insert") {
      const row = state.row as unknown as QueueRow;
      // Emulate the partial UNIQUE index.
      if (LIVE(row.status) && store.queue.some((r) => LIVE(r.status) && keyOf(r) === keyOf(row))) {
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }
      const saved: QueueRow = { ...row, id: `mq-${++store.seq}`, created_at: new Date().toISOString() };
      store.queue.push(saved);
      return { data: { id: saved.id }, error: null };
    }

    if (table === "message_queue" && op === "update") {
      for (const r of store.queue) {
        if (r.id !== f["id"]) continue;
        if (f["status"] && r.status !== f["status"]) continue; // .eq("status","sending") guard
        Object.assign(r, state.patch);
      }
      return { data: null, error: null };
    }

    if (table === "lead_whatsapp_logs" && op === "insert") {
      store.waLogs.push(state.row as Record<string, unknown>);
      return { data: null, error: null };
    }

    return { data: [], error: null };
  };

  const builder = (
    table: string,
    op: "select" | "insert" | "update",
    state: { row?: Record<string, unknown>; patch?: Record<string, unknown> },
  ) => {
    const f: Record<string, unknown> = {};
    const api: Record<string, unknown> = {
      select: () => api,
      single: () => api,
      maybeSingle: () => api,
      order: () => api,
      limit: () => api,
      gte: (k: string, v: unknown) => {
        f[`gte:${k}`] = v;
        return api;
      },
      lte: (k: string, v: unknown) => {
        f[`lte:${k}`] = v;
        return api;
      },
      eq: (k: string, v: unknown) => {
        f[k] = v;
        return api;
      },
      in: (k: string, v: unknown) => {
        f[`${k}__in`] = v;
        return api;
      },
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve(run(table, op, state, f)).then(ok, err),
    };
    return api;
  };

  return {
    supabase: {
      from: (table: string) => ({
        select: () => builder(table, "select", {}),
        insert: (row: Record<string, unknown>) => builder(table, "insert", { row }),
        update: (patch: Record<string, unknown>) => builder(table, "update", { patch }),
      }),
      functions: {
        invoke: (_name: string, opts: { body: unknown }) => {
          store.invokes.push({ body: opts.body });
          return Promise.resolve({ data: { ...store.direct }, error: null });
        },
      },
    },
  };
});

const settings = vi.hoisted(() => ({
  value: {
    eventKey: "attendance_absent",
    enabled: true,
    channel: "whatsapp" as const,
    timing: "immediate" as const,
    templateKey: "attendance_absent",
    priority: 1,
    quietStart: undefined as string | undefined,
    quietEnd: undefined as string | undefined,
  },
}));

vi.mock("@/features/communication/services", () => ({
  commsAuditService: { log: vi.fn().mockResolvedValue(undefined) },
  commsAutomationSettingsService: { get: vi.fn(() => Promise.resolve(settings.value)) },
}));

import {
  resolveCampaign,
  PROVIDER_TEMPLATES_BY_KEY,
} from "@/features/communication/constants/providerTemplates";
import { attendanceWhatsappService } from "./attendanceWhatsapp.service";
import { attendanceCommsService } from "./attendanceComms.service";
import { commsAuditService } from "@/features/communication/services";

const DATE = "2026-07-14";

// The organization the mocked client belongs to. Deliberately NOT "ARK
// Learning Arena": the assertion has to fail if the service ever reverts to a
// hardcoded tenant name, and it cannot do that if the fixture uses that name.
const ORG_NAME = "Test Institute";

const student = (over: Record<string, unknown> = {}) => ({
  id: "stu-1",
  name: "Aarav Kumar",
  parent_name: "Ramesh Kumar",
  parent_contact: "9876543210",
  parent_contact2: null,
  guardian_contact: null,
  guardian_name: null,
  mother_name: null,
  section: "A",
  standards: { name: "10" },
  batches: { name: "Batch A" },
  ...over,
});

const submit = (rows: Array<{ studentId: string; status: string; previousStatus?: string }>) =>
  attendanceWhatsappService.notifyAbsentees({ date: DATE, rows, actorId: "teacher-1", actorRole: "teacher" });

beforeEach(() => {
  store.students = [student()];
  store.queue = [];
  store.waLogs = [];
  store.invokes = [];
  store.direct = { ok: true, providerMessageId: "wamid.TEST", error: null, transient: false };
  store.seq = 0;
  settings.value = { ...settings.value, enabled: true, quietStart: undefined, quietEnd: undefined };
  vi.clearAllMocks();
});

describe("Attendance WhatsApp — immediate send", () => {
  it("sends to the parent of every absent student, synchronously", async () => {
    const res = await submit([
      { studentId: "stu-1", status: "absent" },
    ]);

    expect(res.sent).toBe(1);
    expect(res.failed).toBe(0);
    // The provider was called during the submit — not deferred to a drainer.
    expect(store.invokes).toHaveLength(1);
  });

  it("calls AiSensy in DIRECT mode with the ordered utility-template params", async () => {
    await submit([{ studentId: "stu-1", status: "absent" }]);

    const body = store.invokes[0].body as { direct: { campaignName: string; templateParams: string[] } };

    // ── The campaign comes from resolveCampaign(), not from a constant ──
    // This assertion is the whole point of the 2026-08-13 cutover. It used to
    // expect `ark_attendance_absent`, because the service posted the hardcoded
    // `template.providerName` and never consulted the provider lifecycle — so
    // marking a student absent in ANY tenant's portal sent ARK's approved Meta
    // body, signed "Thank you, ARK Learning Arena", to that tenant's parents.
    const resolved = resolveCampaign("attendance_absent")!;
    expect(body.direct.campaignName).toBe(resolved.campaign);

    // Parameter COUNT follows the resolved campaign: the legacy template takes
    // five, the organization-neutral one takes six with org_name appended last.
    // Asserting against the declaration rather than a literal means a future
    // rollback to the legacy campaign does not silently pass with six.
    const declared = PROVIDER_TEMPLATES_BY_KEY.attendance_absent;
    const expected = ["Ramesh Kumar", "Aarav Kumar", "10", "A", "14 Jul 2026"];
    if (resolved.isMultiTenant) expected.push(ORG_NAME);
    expect(body.direct.templateParams).toEqual(expected);
    expect(body.direct.templateParams).toHaveLength(
      resolved.isMultiTenant ? declared.params.length : declared.params.length - 1,
    );
  });

  it("NEVER uses the queue — no row is ever written in 'queued' state", async () => {
    await submit([{ studentId: "stu-1", status: "absent" }]);

    // send-aisensy's drain loop claims rows with .eq("status","queued"). If no
    // attendance row is ever in that state, the drainer cannot touch it: no
    // queueing, no scheduling, no double-send.
    expect(store.queue.every((r) => r.status !== "queued")).toBe(true);
    expect(store.queue).toHaveLength(1);
    expect(store.queue[0].status).toBe("sent");
    expect(store.queue[0].sent_at).toBeTruthy();
    expect(store.queue[0].provider_message_id).toBe("wamid.TEST");
  });

  it("does not notify students who are present", async () => {
    store.students = [student(), student({ id: "stu-2", name: "Diya" })];
    const res = await submit([
      { studentId: "stu-1", status: "absent" },
      { studentId: "stu-2", status: "present" },
    ]);
    expect(res.sent).toBe(1);
    expect(store.invokes).toHaveLength(1);
  });
});

describe("Attendance WhatsApp — duplicate prevention", () => {
  it("never sends the same (student, date) notice twice", async () => {
    const first = await submit([{ studentId: "stu-1", status: "absent" }]);
    expect(first.sent).toBe(1);

    // Teacher re-submits the same register.
    const second = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(second.sent).toBe(0);
    expect(second.duplicates).toBe(1);
    // The parent's phone rang exactly once.
    expect(store.invokes).toHaveLength(1);
  });

  it("logs 'duplicate_prevented' to the audit trail", async () => {
    await submit([{ studentId: "stu-1", status: "absent" }]);
    vi.clearAllMocks();
    await submit([{ studentId: "stu-1", status: "absent" }]);

    const calls = vi.mocked(commsAuditService.log).mock.calls;
    expect(
      calls.some((c) => (c[0].payload as Record<string, unknown>)?.result === "duplicate_prevented"),
    ).toBe(true);
  });

  it("survives a CONCURRENT double-submit — the unique index decides", async () => {
    // Both runs read "nothing sent yet", then race on the claim INSERT.
    const [a, b] = await Promise.all([
      submit([{ studentId: "stu-1", status: "absent" }]),
      submit([{ studentId: "stu-1", status: "absent" }]),
    ]);

    expect(a.sent + b.sent).toBe(1);
    expect(a.duplicates + b.duplicates).toBe(1);
    expect(store.invokes).toHaveLength(1);
  });

  it("a FAILED notice does not block a later retry (the parent never got it)", async () => {
    store.direct = { ok: false, providerMessageId: null, error: "HTTP 400: bad number", transient: false };
    const first = await submit([{ studentId: "stu-1", status: "absent" }]);
    expect(first.failed).toBe(1);

    // Number fixed, teacher resubmits → must actually send this time.
    store.direct = { ok: true, providerMessageId: "wamid.2", error: null, transient: false };
    const second = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(second.sent).toBe(1);
    expect(second.duplicates).toBe(0);
    expect(store.invokes).toHaveLength(2);
  });
});

describe("Attendance WhatsApp — bad contact data", () => {
  it("handles a MISSING parent mobile without sending or throwing", async () => {
    store.students = [student({ parent_contact: null, guardian_contact: null, parent_contact2: null })];

    const res = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(res.missingMobile).toBe(1);
    expect(res.sent).toBe(0);
    expect(store.invokes).toHaveLength(0); // no provider call burned
    // Recorded as an actionable failure, not silently dropped.
    expect(store.queue[0].status).toBe("failed");
    expect(store.queue[0].last_error).toMatch(/missing parent mobile/i);
  });

  it("handles an INVALID parent mobile", async () => {
    store.students = [student({ parent_contact: "123" })];

    const res = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(res.invalidMobile).toBe(1);
    expect(res.sent).toBe(0);
    expect(store.invokes).toHaveLength(0);
    expect(store.queue[0].status).toBe("failed");
  });

  it("falls back to the guardian number when the parent has none", async () => {
    store.students = [student({ parent_contact: null, guardian_contact: "9812345678" })];

    const res = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(res.sent).toBe(1);
    const body = store.invokes[0].body as { direct: { destination: string } };
    expect(body.direct.destination).toBe("9812345678");
  });

  it("sends '-' for a blank section rather than failing validation", async () => {
    store.students = [student({ section: null })];

    const res = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(res.sent).toBe(1);
    const body = store.invokes[0].body as { direct: { templateParams: string[] } };
    expect(body.direct.templateParams[3]).toBe("-");
  });

  it("keeps processing the remaining students after one fails", async () => {
    store.students = [
      student({ id: "stu-1", parent_contact: null }), // missing mobile
      student({ id: "stu-2", name: "Diya", parent_contact: "9811111111" }),
      student({ id: "stu-3", name: "Kabir", parent_contact: "9822222222" }),
    ];

    const res = await submit([
      { studentId: "stu-1", status: "absent" },
      { studentId: "stu-2", status: "absent" },
      { studentId: "stu-3", status: "absent" },
    ]);

    expect(res.missingMobile).toBe(1);
    expect(res.sent).toBe(2); // the failure did not abort the loop
  });
});

describe("Attendance WhatsApp — failures never break attendance", () => {
  it("resolves (never throws) when the provider rejects the send", async () => {
    store.direct = { ok: false, providerMessageId: null, error: "HTTP 500: upstream", transient: true };

    const res = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(res.failed).toBe(1);
    expect(store.queue[0].status).toBe("failed");
    expect(store.queue[0].last_error).toMatch(/HTTP 500/);
  });

  it("records the failure reason in lead_whatsapp_logs (shown in the dashboard)", async () => {
    store.direct = { ok: false, providerMessageId: null, error: "HTTP 401: bad key", transient: false };

    await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(store.waLogs).toHaveLength(1);
    expect(store.waLogs[0].status).toBe("failed");
    expect(String(store.waLogs[0].error)).toMatch(/HTTP 401/);
  });

  it("logs the failure to comms_audit", async () => {
    store.direct = { ok: false, providerMessageId: null, error: "HTTP 401", transient: false };

    await submit([{ studentId: "stu-1", status: "absent" }]);

    const calls = vi.mocked(commsAuditService.log).mock.calls;
    expect(calls.some((c) => c[0].action === "fail")).toBe(true);
  });
});

describe("Attendance WhatsApp — communication logs", () => {
  it("writes the ledger, lead_whatsapp_logs and comms_audit on a successful send", async () => {
    await submit([{ studentId: "stu-1", status: "absent" }]);

    // Ledger (drives Student 360 Timeline / Dashboard / Health — all read message_queue)
    expect(store.queue).toHaveLength(1);
    expect(store.queue[0].recipient_student_id).toBe("stu-1");
    expect(store.queue[0].context_type).toBe("attendance_absent");

    // Unified WhatsApp delivery log
    expect(store.waLogs).toHaveLength(1);
    expect(store.waLogs[0].student_id).toBe("stu-1");
    expect(store.waLogs[0].status).toBe("sent");
    expect(store.waLogs[0].lead_id).toBeNull();

    // Audit
    expect(vi.mocked(commsAuditService.log).mock.calls.some((c) => c[0].action === "send")).toBe(true);
  });
});

describe("Attendance WhatsApp — correction (ABSENT → PRESENT)", () => {
  it("sends attendance_corrected when the parent already received the absent notice", async () => {
    await submit([{ studentId: "stu-1", status: "absent" }]);
    expect(store.queue[0].status).toBe("sent");

    const res = await submit([
      { studentId: "stu-1", status: "present", previousStatus: "absent" },
    ]);

    expect(res.corrections).toBe(1);
    const last = store.invokes[store.invokes.length - 1].body as {
      direct: { campaignName: string; templateParams: string[] };
    };
    const resolved = resolveCampaign("attendance_corrected")!;
    expect(last.direct.campaignName).toBe(resolved.campaign);
    // {{1}} parent {{2}} student {{3}} date  (+ {{4}} org_name once cut over)
    const expected = ["Ramesh Kumar", "Aarav Kumar", "14 Jul 2026"];
    if (resolved.isMultiTenant) expected.push(ORG_NAME);
    expect(last.direct.templateParams).toEqual(expected);
  });

  it("sends NO correction when the parent was never notified", async () => {
    const res = await submit([
      { studentId: "stu-1", status: "present", previousStatus: "absent" },
    ]);

    expect(res.corrections).toBe(0);
    expect(store.invokes).toHaveLength(0);
  });

  it("cancels an in-flight notice instead of correcting it", async () => {
    // A notice stuck mid-send (interrupted run).
    store.queue.push({
      id: "mq-stuck",
      context_type: "attendance_absent",
      context_id: "stu-1",
      status: "sending",
      payload: { attendance_date: DATE },
      recipient_phone: "+919876543210",
      recipient_student_id: "stu-1",
      recipient_name: "Ramesh Kumar",
      last_error: null,
      provider_message_id: null,
      sent_at: null,
      created_at: new Date().toISOString(),
    });

    const res = await submit([
      { studentId: "stu-1", status: "present", previousStatus: "absent" },
    ]);

    expect(res.corrections).toBe(0);
    expect(store.invokes).toHaveLength(0); // nothing sent
    expect(store.queue.find((r) => r.id === "mq-stuck")?.status).toBe("cancelled");
  });

  it("does not re-send a correction twice", async () => {
    await submit([{ studentId: "stu-1", status: "absent" }]);
    await submit([{ studentId: "stu-1", status: "present", previousStatus: "absent" }]);
    const before = store.invokes.length;

    const again = await submit([
      { studentId: "stu-1", status: "present", previousStatus: "absent" },
    ]);

    expect(again.corrections).toBe(0);
    expect(store.invokes).toHaveLength(before);
  });
});

describe("Attendance WhatsApp — automation settings gate", () => {
  it("sends nothing when the automation is disabled", async () => {
    settings.value = { ...settings.value, enabled: false };

    const res = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(res.skipped).toBe(true);
    expect(store.invokes).toHaveLength(0);
  });

  it("is ON by default (the registry default, pre-seed)", async () => {
    const res = await submit([{ studentId: "stu-1", status: "absent" }]);
    expect(res.skipped).toBe(false);
    expect(res.sent).toBe(1);
  });

  it("SUPPRESSES (never defers) inside quiet hours — a scheduled send is not allowed", async () => {
    settings.value = { ...settings.value, quietStart: "00:00", quietEnd: "23:59" };

    const res = await submit([{ studentId: "stu-1", status: "absent" }]);

    expect(res.skipped).toBe(true);
    expect(res.reason).toMatch(/quiet hours/i);
    expect(store.invokes).toHaveLength(0);
    // Nothing was parked for later — the queue stays empty.
    expect(store.queue).toHaveLength(0);
  });

  it("management override sends inside quiet hours", async () => {
    settings.value = { ...settings.value, quietStart: "00:00", quietEnd: "23:59" };

    const res = await attendanceWhatsappService.notifyAbsentees({
      date: DATE,
      rows: [{ studentId: "stu-1", status: "absent" }],
      actorId: "admin-1",
      actorRole: "management",
    });

    expect(res.skipped).toBe(false);
    expect(res.sent).toBe(1);
  });
});

describe("Attendance Communication Dashboard — counters", () => {
  it("counts delivered / failed / missing-mobile and the success rate", async () => {
    store.students = [
      student({ id: "stu-1", parent_contact: "9811111111" }),
      student({ id: "stu-2", name: "Diya", parent_contact: "9822222222" }),
      student({ id: "stu-3", name: "Kabir", parent_contact: null }), // missing mobile
    ];

    await submit([
      { studentId: "stu-1", status: "absent" },
      { studentId: "stu-2", status: "absent" },
      { studentId: "stu-3", status: "absent" },
    ]);

    const stats = await attendanceCommsService.stats(DATE);

    expect(stats.absentNotifications).toBe(3);
    expect(stats.delivered).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.missingParentMobile).toBe(1);
    expect(stats.successPct).toBe(67);
  });

  it("reports zero — not NaN — on a day with no absences", async () => {
    const stats = await attendanceCommsService.stats(DATE);
    expect(stats.absentNotifications).toBe(0);
    expect(stats.successPct).toBe(0);
  });
});
