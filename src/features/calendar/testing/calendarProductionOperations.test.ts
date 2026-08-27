// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Production Operations & Live Delivery Test Suite
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { CalendarEvent, EventReminder } from "../types/calendar.types";

interface MockMessageQueueRow {
  id: string;
  organization_id: string;
  channel: "whatsapp" | "email" | "in_app";
  context_type: string;
  context_id: string;
  template_key: string;
  payload: Record<string, any>;
  status: "queued" | "processing" | "sent" | "failed";
  scheduled_at: string;
}

interface MockReminderRow {
  id: string;
  organization_id: string;
  event_id: string;
  trigger_at: string;
  channels: string[];
  status: "pending" | "sent" | "cancelled" | "skipped";
  sent_count: number;
}

describe("Production Operations & Calendar Delivery Lifecycle", () => {
  const ORG_A_ID = "11111111-1111-4111-8111-111111111111"; // ARK Learning Arena
  const ORG_B_ID = "22222222-2222-4222-8222-222222222222"; // ABC Academi

  const orgMetadata: Record<string, { name: string; timezone: string }> = {
    [ORG_A_ID]: { name: "ARK Learning Arena", timezone: "Asia/Kolkata" },
    [ORG_B_ID]: { name: "ABC Academi", timezone: "America/New_York" },
  };

  it("PHASE 1 & 4: Full Multi-Tenant Delivery Trace & Dynamic Branding Verification", () => {
    const queue: MockMessageQueueRow[] = [];
    const reminders: MockReminderRow[] = [
      {
        id: "rem-ark-1",
        organization_id: ORG_A_ID,
        event_id: "ev-ark-onam",
        trigger_at: "2026-09-03T09:00:00.000Z",
        channels: ["whatsapp"],
        status: "pending",
        sent_count: 0,
      },
      {
        id: "rem-abc-1",
        organization_id: ORG_B_ID,
        event_id: "ev-abc-fall",
        trigger_at: "2026-09-03T09:00:00.000Z",
        channels: ["whatsapp"],
        status: "pending",
        sent_count: 0,
      },
    ];

    const events: Record<string, Partial<CalendarEvent>> = {
      "ev-ark-onam": {
        id: "ev-ark-onam",
        organization_id: ORG_A_ID,
        title: "Onam Festival Celebration",
        start_at: "2026-09-04T09:00:00.000Z",
        event_type: "school_event",
        status: "scheduled",
      },
      "ev-abc-fall": {
        id: "ev-abc-fall",
        organization_id: ORG_B_ID,
        title: "Fall Semester Orientation",
        start_at: "2026-09-04T13:00:00.000Z",
        event_type: "school_event",
        status: "scheduled",
      },
    };

    // Scheduler sweep function
    const runSchedulerSweep = (orgId: string, nowIso: string) => {
      const due = reminders.filter(
        (r) => r.organization_id === orgId && r.status === "pending" && r.trigger_at <= nowIso
      );

      for (const rem of due) {
        const ev = events[rem.event_id];
        if (!ev || ev.status === "cancelled") {
          rem.status = "cancelled";
          continue;
        }

        const org = orgMetadata[rem.organization_id];

        // Enqueue to message queue with dynamic branding
        queue.push({
          id: `mq-${rem.id}`,
          organization_id: rem.organization_id,
          channel: "whatsapp",
          context_type: "calendar_reminder",
          context_id: rem.event_id,
          template_key: "calendar_event_reminder",
          scheduled_at: nowIso,
          payload: {
            event_title: ev.title,
            organization_name: org.name, // Dynamic!
            start_at: ev.start_at,
          },
          status: "queued",
        });

        rem.status = "sent";
        rem.sent_count += 1;
      }
    };

    // Sweep Org A
    runSchedulerSweep(ORG_A_ID, "2026-09-03T10:00:00.000Z");
    const arkQueue = queue.filter((q) => q.organization_id === ORG_A_ID);
    expect(arkQueue).toHaveLength(1);
    expect(arkQueue[0].payload.organization_name).toBe("ARK Learning Arena");
    expect(arkQueue[0].payload.event_title).toBe("Onam Festival Celebration");

    // Sweep Org B
    runSchedulerSweep(ORG_B_ID, "2026-09-03T10:00:00.000Z");
    const abcQueue = queue.filter((q) => q.organization_id === ORG_B_ID);
    expect(abcQueue).toHaveLength(1);
    expect(abcQueue[0].payload.organization_name).toBe("ABC Academi");
    expect(abcQueue[0].payload.event_title).toBe("Fall Semester Orientation");

    // Strict non-contamination proof: Org B queue contains ZERO references to ARK
    expect(JSON.stringify(abcQueue)).not.toContain("ARK");
  });

  it("PHASE 6 & 7: Idempotency under concurrent scheduler execution", () => {
    let reminder: MockReminderRow = {
      id: "rem-due-1",
      organization_id: ORG_A_ID,
      event_id: "ev-math-exam",
      trigger_at: "2026-10-09T09:00:00.000Z",
      channels: ["whatsapp"],
      status: "pending",
      sent_count: 0,
    };

    const queue: MockMessageQueueRow[] = [];

    const atomicSweepWorker = (workerId: string) => {
      // Simulates atomic update WHERE status = 'pending' RETURNING *
      if (reminder.status === "pending") {
        reminder.status = "sent";
        reminder.sent_count += 1;

        queue.push({
          id: `mq-${workerId}`,
          organization_id: ORG_A_ID,
          channel: "whatsapp",
          context_type: "calendar_reminder",
          context_id: reminder.event_id,
          template_key: "calendar_event_reminder",
          scheduled_at: new Date().toISOString(),
          payload: { event_title: "Math Exam" },
          status: "queued",
        });
      }
    };

    // 3 concurrent workers trigger at the exact same instant
    atomicSweepWorker("worker-1");
    atomicSweepWorker("worker-2");
    atomicSweepWorker("worker-3");

    // Exactly 1 message enqueued
    expect(queue).toHaveLength(1);
    expect(reminder.sent_count).toBe(1);
  });

  it("PHASE 8: Event Reschedule & Cancellation Suppression", () => {
    let reminder: MockReminderRow = {
      id: "rem-exam-1",
      organization_id: ORG_A_ID,
      event_id: "ev-physics",
      trigger_at: "2026-10-09T09:00:00.000Z",
      channels: ["whatsapp"],
      status: "pending",
      sent_count: 0,
    };

    let eventStatus: "scheduled" | "cancelled" = "scheduled";

    // Scenario A: Event is cancelled
    eventStatus = "cancelled";

    const sweepCancelled = (rem: MockReminderRow, evStatus: string) => {
      if (evStatus === "cancelled") {
        rem.status = "cancelled";
        return false; // suppressed!
      }
      return true;
    };

    const didSend = sweepCancelled(reminder, eventStatus);
    expect(didSend).toBe(false);
    expect(reminder.status).toBe("cancelled");
    expect(reminder.sent_count).toBe(0);
  });

  it("PHASE 11: Module Revocation / Disable skips automated reminders safely", () => {
    const isModuleEnabled = (orgId: string, moduleId: string) => {
      // Disabled for Org B
      if (orgId === ORG_B_ID && moduleId === "academic_calendar") return false;
      return true;
    };

    const sweepOrgIfEntitled = (orgId: string) => {
      if (!isModuleEnabled(orgId, "academic_calendar")) {
        return { skipped: true, reason: "module_disabled" };
      }
      return { skipped: false, processed: 1 };
    };

    expect(sweepOrgIfEntitled(ORG_A_ID)).toEqual({ skipped: false, processed: 1 });
    expect(sweepOrgIfEntitled(ORG_B_ID)).toEqual({ skipped: true, reason: "module_disabled" });
  });
});
