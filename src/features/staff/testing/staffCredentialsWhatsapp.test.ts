// ── Staff credentials over WhatsApp ──────────────────────────────────────────
//
// The welcome EMAIL is sent server-side by `invite-staff` and is not this
// service's job — duplicating it would mean two emails or, worse, two different
// passwords. What is pinned here is the second channel: the same password the
// email carries, on the registered `staff_credentials` utility template, in the
// exact positional order AiSensy expects.
//
// A wrong order here is not cosmetic. Swap {{3}} and {{4}} and every new staff
// member is sent their password in the "login email" line — and the password is
// shown once, so there is nothing left to compare it against.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}) },
}));

vi.mock("../utils/appUrl", () => ({
  appBaseUrl: () => "https://smart-ark.example.com",
  loginUrl: () => "https://smart-ark.example.com/login",
}));

const enqueue = vi.fn();
const dispatchViaEdge = vi.fn();
vi.mock("@/features/communication/services/aisensy.service", () => ({
  aisensyService: {
    enqueue: (...a: unknown[]) => enqueue(...a),
    dispatchViaEdge: (...a: unknown[]) => dispatchViaEdge(...a),
  },
}));

import { staffCredentialsService } from "../services/staffCredentials.service";
import { buildTemplateParams } from "@/features/leads/utils/templateParams";
import type { EnqueueInput } from "@/features/communication/services/aisensy.service";

const INPUT = {
  staffName: "Asha Rao",
  loginEmail: "asha.rao@thearktuition.com",
  password: "Ark#7712",
  mobile: "+91 98765 43210",
  role: "teacher",
  profileId: "pr-1",
};

const lastEnqueue = (): EnqueueInput => enqueue.mock.calls[0][0] as EnqueueInput;

beforeEach(() => {
  enqueue.mockReset().mockResolvedValue({ queued: 1, skipped: 0, ids: ["q1"], invalid: [] });
  dispatchViaEdge.mockReset().mockResolvedValue({ dispatched: true });
});

describe("staffCredentialsService.sendWhatsapp", () => {
  it("sends a fully-rendered body with every field resolved", async () => {
    const res = await staffCredentialsService.sendWhatsapp(INPUT);

    expect(res).toEqual({ channel: "whatsapp", ok: true });
    const { rendered } = lastEnqueue();
    expect(rendered.missing).toEqual([]);
    expect(rendered.body).not.toMatch(/\{\{/);
    expect(rendered.body).toContain("Asha Rao");
    expect(rendered.body).toContain("asha.rao@thearktuition.com");
    expect(rendered.body).toContain("Ark#7712");
    expect(rendered.body).toContain("https://smart-ark.example.com/login");
  });

  it("produces the exact positional params the utility template declares", async () => {
    await staffCredentialsService.sendWhatsapp(INPUT);
    const { rendered } = lastEnqueue();

    expect(buildTemplateParams(rendered.providerName, rendered.variables)).toEqual([
      "Asha Rao",
      "Teacher",
      "asha.rao@thearktuition.com",
      "Ark#7712",
      "https://smart-ark.example.com/login",
    ]);
  });

  it("titles the role and prefers the designation over the role code", async () => {
    await staffCredentialsService.sendWhatsapp({ ...INPUT, designation: "senior teacher" });
    expect(lastEnqueue().rendered.variables.role).toBe("Senior Teacher");
  });

  it("falls back to a readable role rather than an empty line", async () => {
    await staffCredentialsService.sendWhatsapp({ ...INPUT, role: undefined });
    expect(lastEnqueue().rendered.variables.role).toBe("Staff");
  });

  it("files the message under the staff member, not a guardian", async () => {
    await staffCredentialsService.sendWhatsapp(INPUT);
    const input = lastEnqueue();
    expect(input.recipient.kind).toBe("staff");
    expect(input.contextType).toBe("staff_credentials");
    expect(input.contextId).toBe("pr-1");
  });

  it("skips quietly when there is no mobile on record", async () => {
    const res = await staffCredentialsService.sendWhatsapp({ ...INPUT, mobile: undefined });
    expect(res).toMatchObject({ ok: false, skipped: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reports 'queued but not sent' when the sender is down", async () => {
    dispatchViaEdge.mockResolvedValue({ dispatched: false, reason: "AISENSY_API_KEY missing" });
    const res = await staffCredentialsService.sendWhatsapp(INPUT);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/AISENSY_API_KEY missing/);
  });
});
