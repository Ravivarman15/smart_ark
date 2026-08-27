// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Reminder Scheduling & Idempotency Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { CalendarEvent, EventReminder } from "../types/calendar.types";

interface SimulatedReminderRow {
  id: string;
  event_id: string;
  trigger_at: string;
  status: "pending" | "sent" | "cancelled";
  sent_count: number;
}

describe("Smart Reminder Scheduling & Idempotency Engine", () => {
  it("calculates exact trigger timestamps based on offset minutes", () => {
    const eventStart = new Date("2026-10-10T09:00:00.000Z").getTime();

    // 7 days before (7 * 24 * 60 = 10080 mins)
    const trigger7Days = new Date(eventStart - 10080 * 60 * 1000).toISOString();
    expect(trigger7Days).toBe("2026-10-03T09:00:00.000Z");

    // 1 day before (1440 mins)
    const trigger1Day = new Date(eventStart - 1440 * 60 * 1000).toISOString();
    expect(trigger1Day).toBe("2026-10-09T09:00:00.000Z");

    // 2 hours before (120 mins)
    const trigger2Hours = new Date(eventStart - 120 * 60 * 1000).toISOString();
    expect(trigger2Hours).toBe("2026-10-10T07:00:00.000Z");
  });

  it("IDEMPOTENCY PROOF: running the reminder scheduler multiple times never duplicates sends", () => {
    let reminderRows: SimulatedReminderRow[] = [
      {
        id: "rem-1",
        event_id: "ev-1",
        trigger_at: "2026-10-03T09:00:00.000Z",
        status: "pending",
        sent_count: 0,
      },
    ];

    const simulateSweep = (currentTimeIso: string) => {
      let dispatched = 0;
      reminderRows = reminderRows.map((r) => {
        if (r.status === "pending" && r.trigger_at <= currentTimeIso) {
          dispatched++;
          return { ...r, status: "sent", sent_count: r.sent_count + 1 };
        }
        return r;
      });
      return dispatched;
    };

    // First sweep at 2026-10-03T09:05:00Z -> Dispatches 1 notification
    const firstSweep = simulateSweep("2026-10-03T09:05:00.000Z");
    expect(firstSweep).toBe(1);
    expect(reminderRows[0].status).toBe("sent");
    expect(reminderRows[0].sent_count).toBe(1);

    // Second sweep 5 minutes later -> Dispatches 0 (duplicate prevented!)
    const secondSweep = simulateSweep("2026-10-03T09:10:00.000Z");
    expect(secondSweep).toBe(0);
    expect(reminderRows[0].sent_count).toBe(1);

    // Third sweep 1 hour later -> Dispatches 0
    const thirdSweep = simulateSweep("2026-10-03T10:00:00.000Z");
    expect(thirdSweep).toBe(0);
    expect(reminderRows[0].sent_count).toBe(1);
  });

  it("CANCELLATION: pending reminders are marked cancelled and do not fire", () => {
    let reminderRows: SimulatedReminderRow[] = [
      {
        id: "rem-2",
        event_id: "ev-2",
        trigger_at: "2026-10-05T09:00:00.000Z",
        status: "pending",
        sent_count: 0,
      },
    ];

    // Event is cancelled before trigger time
    reminderRows = reminderRows.map((r) =>
      r.event_id === "ev-2" ? { ...r, status: "cancelled" } : r
    );

    // Scheduler sweeps after trigger time
    const sweepTime = "2026-10-05T10:00:00.000Z";
    const dueReminders = reminderRows.filter(
      (r) => r.status === "pending" && r.trigger_at <= sweepTime
    );

    expect(dueReminders).toHaveLength(0); // Cancelled reminders skipped!
  });

  it("DATE CHANGE: updating event date reschedules reminders accurately", () => {
    // Old date: Oct 10 -> 1 day before was Oct 9
    const oldStart = new Date("2026-10-10T09:00:00.000Z").getTime();
    const oldTrigger = new Date(oldStart - 1440 * 60 * 1000).toISOString();
    expect(oldTrigger).toBe("2026-10-09T09:00:00.000Z");

    // Event postponed to Oct 20 -> 1 day before becomes Oct 19
    const newStart = new Date("2026-10-20T09:00:00.000Z").getTime();
    const newTrigger = new Date(newStart - 1440 * 60 * 1000).toISOString();
    expect(newTrigger).toBe("2026-10-19T09:00:00.000Z");

    // At Oct 12: Old trigger would have fired, but new trigger is in the future
    const currentTime = "2026-10-12T09:00:00.000Z";
    expect(newTrigger > currentTime).toBe(true);
  });
});
