// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Lifecycle & Timezone Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { deriveAnnouncementStatus } from "../services/announcements.service";
import type { AnnouncementStatus } from "../types/announcements.types";

describe("Announcement Lifecycle & State Engine", () => {
  const now = new Date("2026-08-26T10:00:00.000Z").getTime();

  it("preserves explicit draft status regardless of timestamps", () => {
    const status = deriveAnnouncementStatus(
      "draft",
      "2026-08-26T08:00:00.000Z",
      "2026-08-26T20:00:00.000Z",
      now
    );
    expect(status).toBe("draft");
  });

  it("preserves explicit archived status regardless of timestamps", () => {
    const status = deriveAnnouncementStatus(
      "archived",
      "2026-08-26T08:00:00.000Z",
      "2026-08-26T20:00:00.000Z",
      now
    );
    expect(status).toBe("archived");
  });

  it("preserves explicit cancelled status", () => {
    const status = deriveAnnouncementStatus(
      "cancelled",
      "2026-08-26T12:00:00.000Z",
      "2026-08-26T20:00:00.000Z",
      now
    );
    expect(status).toBe("cancelled");
  });

  it("evaluates to 'scheduled' when publish_at is in the future", () => {
    const futurePublish = "2026-08-26T14:00:00.000Z";
    const futureExpiry = "2026-08-26T20:00:00.000Z";
    const status = deriveAnnouncementStatus("scheduled", futurePublish, futureExpiry, now);
    expect(status).toBe("scheduled");
  });

  it("evaluates to 'live' when current time is between publish_at and expires_at", () => {
    const pastPublish = "2026-08-26T08:00:00.000Z";
    const futureExpiry = "2026-08-26T20:00:00.000Z";
    const status = deriveAnnouncementStatus("live", pastPublish, futureExpiry, now);
    expect(status).toBe("live");
  });

  it("evaluates to 'live' even if raw status was 'scheduled' once publish_at has passed (late scheduler resilience)", () => {
    // Proves that visibility does not fail even if cron/scheduler is delayed
    const pastPublish = "2026-08-26T08:00:00.000Z";
    const futureExpiry = "2026-08-26T20:00:00.000Z";
    const status = deriveAnnouncementStatus("scheduled", pastPublish, futureExpiry, now);
    expect(status).toBe("live");
  });

  it("evaluates to 'expired' once expires_at has passed", () => {
    const pastPublish = "2026-08-26T06:00:00.000Z";
    const pastExpiry = "2026-08-26T09:00:00.000Z";
    const status = deriveAnnouncementStatus("live", pastPublish, pastExpiry, now);
    expect(status).toBe("expired");
  });

  it("stays 'live' indefinitely if no expires_at is configured", () => {
    const pastPublish = "2026-08-26T08:00:00.000Z";
    const status = deriveAnnouncementStatus("live", pastPublish, null, now);
    expect(status).toBe("live");
  });
});

describe("Organization Timezone Behavior (Onam Scenario)", () => {
  it("computes local timeline correctly for Asia/Kolkata (IST: UTC+5:30)", () => {
    // 26 Aug 2026 08:00 AM IST is 2026-08-26T02:30:00Z
    // 26 Aug 2026 11:59 PM IST is 2026-08-26T18:29:00Z
    const publishIST = "2026-08-26T02:30:00.000Z";
    const expireIST = "2026-08-26T18:29:00.000Z";

    // 1. Before 8:00 AM IST (e.g. 7:00 AM IST = 01:30 UTC) -> SCHEDULED
    const timeBeforeMorning = new Date("2026-08-26T01:30:00.000Z").getTime();
    expect(deriveAnnouncementStatus("scheduled", publishIST, expireIST, timeBeforeMorning)).toBe(
      "scheduled"
    );

    // 2. Mid-day (e.g. 12:00 PM IST = 06:30 UTC) -> LIVE
    const timeMidday = new Date("2026-08-26T06:30:00.000Z").getTime();
    expect(deriveAnnouncementStatus("scheduled", publishIST, expireIST, timeMidday)).toBe("live");

    // 3. Next morning (e.g. 27 Aug 2026 01:00 AM IST = 19:30 UTC) -> EXPIRED
    const timeNextDay = new Date("2026-08-26T19:30:00.000Z").getTime();
    expect(deriveAnnouncementStatus("live", publishIST, expireIST, timeNextDay)).toBe("expired");
  });

  it("behaves independently for two tenants in different timezones", () => {
    // Organization A (Asia/Kolkata, UTC+5:30) vs Organization B (America/New_York, UTC-4:00 EDT)
    // Both configured for "Expire at 11:59 PM local on 26 Aug 2026"
    const orgAExpire = "2026-08-26T18:29:00.000Z"; // 11:59 PM IST
    const orgBExpire = "2026-08-27T03:59:00.000Z"; // 11:59 PM EDT

    // At 2026-08-26T20:00:00Z:
    // - In India, it is 1:30 AM on 27 Aug -> Org A announcement is EXPIRED.
    // - In New York, it is 4:00 PM on 26 Aug -> Org B announcement is still LIVE.
    const testInstant = new Date("2026-08-26T20:00:00.000Z").getTime();

    const orgAStatus = deriveAnnouncementStatus("live", "2026-08-26T02:30:00.000Z", orgAExpire, testInstant);
    const orgBStatus = deriveAnnouncementStatus("live", "2026-08-26T12:00:00.000Z", orgBExpire, testInstant);

    expect(orgAStatus).toBe("expired");
    expect(orgBStatus).toBe("live");
  });
});
