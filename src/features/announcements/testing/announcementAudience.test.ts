// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Audience Targeting & Deduplication Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { AnnouncementAudienceService } from "../services/announcementAudience.service";
import type { AnnouncementAudience } from "../types/announcements.types";

describe("Audience Targeting & Summary Formatter", () => {
  it("formats Entire Organization when targetScope is 'all'", () => {
    const summary = AnnouncementAudienceService.formatAudienceSummary([], "all");
    expect(summary).toBe("Entire Organization");
  });

  it("formats single standard audience", () => {
    const audiences: AnnouncementAudience[] = [
      { target_type: "standard", target_id: "std-10", target_name: "Class 10" },
    ];
    const summary = AnnouncementAudienceService.formatAudienceSummary(audiences, "custom");
    expect(summary).toBe("Standards: Class 10");
  });

  it("formats multiple sections / batches", () => {
    const audiences: AnnouncementAudience[] = [
      { target_type: "batch", target_id: "batch-10a", target_name: "Class 10A" },
      { target_type: "batch", target_id: "batch-10b", target_name: "Class 10B" },
    ];
    const summary = AnnouncementAudienceService.formatAudienceSummary(audiences, "custom");
    expect(summary).toBe("Classes: Class 10A, Class 10B");
  });

  it("formats combined audiences (Classes + Roles)", () => {
    const audiences: AnnouncementAudience[] = [
      { target_type: "batch", target_id: "batch-10a", target_name: "Class 10A" },
      { target_type: "role", target_id: "teacher", target_name: "Teachers" },
    ];
    const summary = AnnouncementAudienceService.formatAudienceSummary(audiences, "custom");
    expect(summary).toContain("Classes: Class 10A");
    expect(summary).toContain("Roles: Teachers");
  });
});

describe("Recipient Deduplication Engine", () => {
  it("deduplicates identical recipient IDs across multiple audience matches", () => {
    // A parent whose 2 children are in Class 10A and Class 10B
    const recipients = [
      { recipient_id: "parent-user-1", name: "John Doe", child: "Child A (10A)" },
      { recipient_id: "parent-user-1", name: "John Doe", child: "Child B (10B)" },
      { recipient_id: "parent-user-2", name: "Jane Smith", child: "Child C (10A)" },
    ];

    const deduplicated = AnnouncementAudienceService.deduplicateRecipients(recipients);

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.map((r) => r.recipient_id)).toEqual(["parent-user-1", "parent-user-2"]);
  });

  it("preserves unique recipients when no duplicates exist", () => {
    const recipients = [
      { recipient_id: "u-1", name: "Alice" },
      { recipient_id: "u-2", name: "Bob" },
      { recipient_id: "u-3", name: "Charlie" },
    ];

    const deduplicated = AnnouncementAudienceService.deduplicateRecipients(recipients);
    expect(deduplicated).toHaveLength(3);
  });
});
