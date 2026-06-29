import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RecipientCandidate } from "../types/communication.types";

// ════════════════════════════════════════════════════════════════════════════
// EVENT DISPATCHER — orchestration over the existing engine. Collaborators are
// mocked so this verifies the dispatcher's own decisions: disabled-skip,
// channel fan-out (whatsapp / email / both), and duplicate protection.
// ════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => ({
  queuedRows: [] as { context_id: string }[],
  emailOk: true,
}));

// Supabase client: queuedTodaySet() reads message_queue; send-email via functions.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ gte: () => ({ limit: () => Promise.resolve({ data: hoisted.queuedRows, error: null }) }) }),
      }),
    }),
    functions: { invoke: () => Promise.resolve({ data: { ok: hoisted.emailOk }, error: null }) },
  },
}));

vi.mock("../services/commsAutomationSettings.service", () => ({
  commsAutomationSettingsService: { get: vi.fn() },
}));
vi.mock("../services/aisensy.service", () => ({
  aisensyService: { enqueueBulk: vi.fn(), dispatchViaEdge: vi.fn().mockResolvedValue({ dispatched: true }) },
}));
vi.mock("../services/commsTemplates.service", () => ({
  // null → dispatcher falls back to the real builtin template registry.
  commsTemplatesService: { getByKey: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../services/commsAudit.service", () => ({
  commsAuditService: { log: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../services/commsRecipients.service", () => ({
  commsRecipientsService: { birthdaysOn: vi.fn(), studentsWithFeeStatus: vi.fn() },
}));

import { commsDispatcherService } from "../services/commsDispatcher.service";
import { commsAutomationSettingsService } from "../services/commsAutomationSettings.service";
import { aisensyService } from "../services/aisensy.service";

const setting = (over: Record<string, unknown> = {}) => ({
  eventKey: "birthday_student",
  enabled: true,
  channel: "whatsapp",
  timing: "scheduled",
  templateKey: "birthday_wish",
  priority: 7,
  ...over,
});

const recip = (id: string, name: string): RecipientCandidate => ({
  id,
  kind: "student",
  name,
  phone: "9876543210",
  email: `${id}@ark.test`,
});

const ctx = (recipients: RecipientCandidate[]) => ({
  recipients,
  branchName: "ARK Central",
  resolve: (c: RecipientCandidate) => ({ student_name: c.name }),
});

beforeEach(() => {
  vi.clearAllMocks(); // reset call history (keeps mock implementations)
  hoisted.queuedRows = [];
  hoisted.emailOk = true;
  vi.mocked(aisensyService.enqueueBulk).mockImplementation(async (inputs) => ({
    queued: inputs.length,
    skipped: 0,
    ids: inputs.map((_, i) => String(i)),
    invalid: [],
  }));
});

describe("dispatcher — enable gate", () => {
  it("skips a disabled event without enqueuing", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting({ enabled: false }));
    const res = await commsDispatcherService.dispatch("birthday_student", ctx([recip("a", "Aarav")]));
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("event disabled");
    expect(res.queued).toBe(0);
    expect(aisensyService.enqueueBulk).not.toHaveBeenCalled();
  });
});

describe("dispatcher — channels", () => {
  it("whatsapp: enqueues valid recipients with the event context_type", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting({ channel: "whatsapp" }));
    const res = await commsDispatcherService.dispatch(
      "birthday_student",
      ctx([recip("a", "Aarav"), recip("b", "Diya")]),
    );
    expect(res.queued).toBe(2);
    expect(res.skipped).toBe(false);
    const inputs = vi.mocked(aisensyService.enqueueBulk).mock.calls[0][0];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].contextType).toBe("birthday_student");
    expect(inputs[0].contextId).toBe("a");
  });

  it("both: enqueues whatsapp AND sends email", async () => {
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting({ channel: "both" }));
    const res = await commsDispatcherService.dispatch(
      "birthday_student",
      ctx([recip("a", "Aarav"), recip("b", "Diya")]),
    );
    expect(res.queued).toBe(2);
    expect(res.emailed).toBe(2);
  });
});

describe("dispatcher — duplicate protection", () => {
  it("drops recipients already queued today for the event", async () => {
    hoisted.queuedRows = [{ context_id: "a" }]; // 'a' already notified today
    vi.mocked(commsAutomationSettingsService.get).mockResolvedValue(setting({ channel: "whatsapp" }));
    const res = await commsDispatcherService.dispatch(
      "birthday_student",
      ctx([recip("a", "Aarav"), recip("b", "Diya")]),
    );
    expect(res.duplicates).toBe(1);
    expect(res.queued).toBe(1);
    const inputs = vi.mocked(aisensyService.enqueueBulk).mock.calls[0][0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].contextId).toBe("b");
  });
});
