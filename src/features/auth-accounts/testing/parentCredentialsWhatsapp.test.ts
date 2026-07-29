// ── Regression: parent credentials must actually reach WhatsApp ──────────────
//
// THE BUG THIS PINS
// `sendWhatsapp` used to hand-write a message_queue row:
//
//     template: "parent_portal_credentials",
//     payload: { parentName, loginEmail, password, loginUrl, children }
//
// Neither half could ever be delivered:
//   • no `__body` — send-aisensy's first guard fails the row outright with
//     "empty body", before any provider call
//   • `parent_portal_credentials` is not a registered template and has no
//     positional-param spec, so AiSensy had nothing to render
//
// …and the UI reported "credentials queued for WhatsApp" the whole time. So the
// properties pinned here are about DELIVERABILITY, not about queue mechanics:
// a rendered body exists, every variable resolved, and the ordered params match
// the Meta utility template exactly.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }) },
}));

vi.mock("@/features/staff/utils/appUrl", () => ({
  appBaseUrl: () => "https://smart-ark.example.com",
  loginUrl: () => "https://smart-ark.example.com/login",
}));

// Mock the concrete module, not the barrel: the shared credential helper the
// service delegates to imports it directly, and mocking the barrel would leave
// the helper talking to the real client.
const enqueue = vi.fn();
const dispatchViaEdge = vi.fn();
vi.mock("@/features/communication/services/aisensy.service", () => ({
  aisensyService: {
    enqueue: (...a: unknown[]) => enqueue(...a),
    dispatchViaEdge: (...a: unknown[]) => dispatchViaEdge(...a),
  },
}));

import { parentCredentialsService } from "../services/parentCredentials.service";
import { buildTemplateParams } from "@/features/leads/utils/templateParams";
import type { EnqueueInput } from "@/features/communication/services/aisensy.service";

const INPUT = {
  parentName: "Ravivarman",
  loginEmail: "ravi.a3f9@parents.ark.local",
  password: "Ark#4821",
  mobile: "+91 73058 01869",
  childNames: ["Ravi test"],
  parentAccountId: "pa-1",
  studentId: "st-1",
};

const lastEnqueue = (): EnqueueInput => enqueue.mock.calls[0][0] as EnqueueInput;

beforeEach(() => {
  enqueue.mockReset().mockResolvedValue({ queued: 1, skipped: 0, ids: ["q1"], invalid: [] });
  dispatchViaEdge.mockReset().mockResolvedValue({ dispatched: true });
});

describe("parentCredentialsService.sendWhatsapp", () => {
  it("sends a fully-rendered body — never an empty one", async () => {
    const res = await parentCredentialsService.sendWhatsapp(INPUT);

    expect(res).toEqual({ channel: "whatsapp", ok: true });
    const { rendered } = lastEnqueue();
    expect(rendered.body.trim()).not.toBe("");
    // No placeholder may survive into a message a parent reads.
    expect(rendered.body).not.toMatch(/\{\{/);
    expect(rendered.missing).toEqual([]);
  });

  it("carries every credential the parent needs to sign in", async () => {
    await parentCredentialsService.sendWhatsapp(INPUT);
    const { rendered } = lastEnqueue();

    expect(rendered.body).toContain("Ravivarman");
    expect(rendered.body).toContain("Ravi test");
    expect(rendered.body).toContain("ravi.a3f9@parents.ark.local");
    expect(rendered.body).toContain("Ark#4821");
    expect(rendered.body).toContain("https://smart-ark.example.com/login");
  });

  it("produces the exact positional params the utility template declares", async () => {
    await parentCredentialsService.sendWhatsapp(INPUT);
    const { rendered } = lastEnqueue();

    // Reproduces what send-aisensy does with the stored payload.
    expect(buildTemplateParams(rendered.providerName, rendered.variables)).toEqual([
      "Ravivarman",
      "Ravi test",
      "ravi.a3f9@parents.ark.local",
      "Ark#4821",
      "https://smart-ark.example.com/login",
    ]);
  });

  it("uses the registered template key, not an invented one", async () => {
    await parentCredentialsService.sendWhatsapp(INPUT);
    const { rendered } = lastEnqueue();
    expect(rendered.templateKey).toBe("parent_credentials");
    expect(rendered.providerName).toBe("parent_credentials");
  });

  it("names every linked child, so a second child is not invisible", async () => {
    await parentCredentialsService.sendWhatsapp({ ...INPUT, childNames: ["Ravi test", "Meera test"] });
    expect(lastEnqueue().rendered.variables.student_name).toBe("Ravi test, Meera test");
  });

  it("drains the queue immediately — credentials do not wait for a cron tick", async () => {
    await parentCredentialsService.sendWhatsapp(INPUT);
    expect(dispatchViaEdge).toHaveBeenCalledTimes(1);
  });

  it("reports 'queued but not sent' rather than success when the sender is down", async () => {
    dispatchViaEdge.mockResolvedValue({ dispatched: false, reason: "send-aisensy not deployed" });
    const res = await parentCredentialsService.sendWhatsapp(INPUT);

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/send-aisensy not deployed/);
    expect(res.skipped).toBeUndefined(); // not "nothing to do" — it is unfinished
  });

  it("surfaces the validation reason when the message is rejected before sending", async () => {
    enqueue.mockResolvedValue({ queued: 0, skipped: 1, ids: [], invalid: [{ reason: "bad phone" }] });
    const res = await parentCredentialsService.sendWhatsapp(INPUT);
    expect(res).toMatchObject({ ok: false, message: "bad phone" });
  });

  it("skips — without an error — when there is no mobile on record", async () => {
    const res = await parentCredentialsService.sendWhatsapp({ ...INPUT, mobile: "" });
    expect(res).toMatchObject({ ok: false, skipped: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects a mobile that is not a full 10-digit number", async () => {
    const res = await parentCredentialsService.sendWhatsapp({ ...INPUT, mobile: "73058" });
    expect(res.skipped).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("passes the guardian + student context so the message lands in the family timeline", async () => {
    await parentCredentialsService.sendWhatsapp(INPUT);
    const input = lastEnqueue();
    expect(input.contextType).toBe("parent_credentials");
    expect(input.contextId).toBe("pa-1");
    expect(input.recipient).toMatchObject({ kind: "guardian", studentId: "st-1" });
  });
});
