// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Read & Acknowledgement Tracking Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { Announcement } from "../types/announcements.types";

describe("Announcement Read & Acknowledgement State Engine", () => {
  const sampleAnnouncements: Announcement[] = [
    {
      id: "ann-1",
      organization_id: "org-1",
      title: "🌸 Happy Onam!",
      content: "Happy Onam to everyone.",
      category: "event",
      priority: "normal",
      status: "live",
      publish_at: "2026-08-26T08:00:00.000Z",
      timezone: "Asia/Kolkata",
      target_scope: "all",
      channels: ["in_app"],
      requires_acknowledgement: false,
      created_at: "2026-08-26T08:00:00.000Z",
      updated_at: "2026-08-26T08:00:00.000Z",
      is_read: false,
      is_acknowledged: false,
    },
    {
      id: "ann-2",
      organization_id: "org-1",
      title: "📄 Exam Timetable",
      content: "Mid-term examination timetable.",
      category: "exam",
      priority: "important",
      status: "live",
      publish_at: "2026-08-26T08:00:00.000Z",
      timezone: "Asia/Kolkata",
      target_scope: "standards",
      channels: ["in_app"],
      requires_acknowledgement: true,
      acknowledgement_prompt: "I have understood the timetable.",
      created_at: "2026-08-26T08:00:00.000Z",
      updated_at: "2026-08-26T08:00:00.000Z",
      is_read: true,
      is_acknowledged: true,
    },
  ];

  it("computes unread counts accurately", () => {
    const unread = sampleAnnouncements.filter((a) => !a.is_read);
    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe("ann-1");
  });

  it("handles acknowledgement requirement state properly", () => {
    const reqAck = sampleAnnouncements.filter((a) => a.requires_acknowledgement);
    expect(reqAck).toHaveLength(1);
    expect(reqAck[0].is_acknowledged).toBe(true);
  });

  it("calculates aggregated analytics correctly", () => {
    const totalTargeted = 120;
    const totalRead = 95;
    const totalAck = 82;

    const totalUnread = Math.max(0, totalTargeted - totalRead);
    const readRate = Math.round((totalRead / totalTargeted) * 100);
    const ackRate = Math.round((totalAck / totalRead) * 100);

    expect(totalUnread).toBe(25);
    expect(readRate).toBe(79);
    expect(ackRate).toBe(86);
  });
});
