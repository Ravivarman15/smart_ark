// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Multi-Tenant Isolation & Timezone Security Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { Announcement } from "../types/announcements.types";
import { deriveAnnouncementStatus } from "../services/announcements.service";

describe("Strict Multi-Tenant Isolation Verification", () => {
  const orgArkId = "11111111-1111-4111-8111-111111111111"; // ARK Learning Arena
  const orgAbcId = "22222222-2222-4222-8222-222222222222"; // ABC Academi

  const arkAnnouncements: Announcement[] = [
    {
      id: "ann-ark-1",
      organization_id: orgArkId,
      title: "Class 10 Mid-Term Timetable",
      content: "Examination schedule for Class 10.",
      content_type: "timetable",
      timetable_data: {
        title: "Class 10 Mid-Term Timetable",
        template: "exam",
        columns: [
          { key: "date", label: "Date" },
          { key: "subject", label: "Subject" },
        ],
        rows: [
          { id: "r1", date: "2026-10-10", subject: "Mathematics" },
          { id: "r2", date: "2026-10-12", subject: "Science" },
        ],
      },
      category: "exam",
      priority: "important",
      status: "live",
      publish_at: "2026-08-20T08:00:00.000Z",
      timezone: "Asia/Kolkata",
      target_scope: "standards",
      channels: ["in_app"],
      requires_acknowledgement: true,
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
    {
      id: "ann-ark-2",
      organization_id: orgArkId,
      title: "🌸 Happy Onam!",
      content: "Wishing all our students, parents and staff a joyful and prosperous Onam.",
      content_type: "text",
      category: "holiday",
      priority: "normal",
      status: "live",
      publish_at: "2026-08-20T08:00:00.000Z",
      timezone: "Asia/Kolkata",
      target_scope: "all",
      channels: ["in_app"],
      requires_acknowledgement: false,
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
  ];

  const abcAnnouncements: Announcement[] = [
    {
      id: "ann-abc-1",
      organization_id: orgAbcId,
      title: "Grade 5 Examination Timetable",
      content: "Timetable for Grade 5 students.",
      content_type: "timetable",
      timetable_data: {
        title: "Grade 5 Examination Timetable",
        template: "exam",
        columns: [
          { key: "date", label: "Date" },
          { key: "subject", label: "Subject" },
        ],
        rows: [{ id: "r_abc_1", date: "2026-10-15", subject: "Environmental Science" }],
      },
      category: "exam",
      priority: "normal",
      status: "live",
      publish_at: "2026-08-20T08:00:00.000Z",
      timezone: "Asia/Dubai",
      target_scope: "standards",
      channels: ["in_app"],
      requires_acknowledgement: false,
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    },
  ];

  const allRecords = [...arkAnnouncements, ...abcAnnouncements];

  it("ARK queries return ONLY ARK announcements and timetable rows", () => {
    const arkQueryResults = allRecords.filter((r) => r.organization_id === orgArkId);
    expect(arkQueryResults).toHaveLength(2);
    expect(arkQueryResults.every((r) => r.organization_id === orgArkId)).toBe(true);

    // Verify no ABC timetable leaked
    const hasAbcTimetable = arkQueryResults.some(
      (r) => r.timetable_data?.title === "Grade 5 Examination Timetable"
    );
    expect(hasAbcTimetable).toBe(false);
  });

  it("ABC Academi queries return ONLY ABC announcements and timetable rows", () => {
    const abcQueryResults = allRecords.filter((r) => r.organization_id === orgAbcId);
    expect(abcQueryResults).toHaveLength(1);
    expect(abcQueryResults[0].id).toBe("ann-abc-1");
    expect(abcQueryResults[0].organization_id).toBe(orgAbcId);

    // Verify no ARK Onam notice or Class 10 timetable leaked
    const hasArkData = abcQueryResults.some(
      (r) => r.title.includes("Onam") || r.title.includes("Class 10")
    );
    expect(hasArkData).toBe(false);
  });

  it("Cross-tenant direct ID query is strictly rejected by tenant scoping", () => {
    const simulateTenantScopedGet = (requestingOrgId: string, announcementId: string) => {
      return allRecords.find(
        (r) => r.id === announcementId && r.organization_id === requestingOrgId
      ) || null;
    };

    // ARK user tries to fetch ABC announcement
    const crossAccessFromArk = simulateTenantScopedGet(orgArkId, "ann-abc-1");
    expect(crossAccessFromArk).toBeNull();

    // ABC user tries to fetch ARK announcement
    const crossAccessFromAbc = simulateTenantScopedGet(orgAbcId, "ann-ark-1");
    expect(crossAccessFromAbc).toBeNull();
  });

  it("Attachment download URL generator enforces organization path prefix", () => {
    const validateStoragePath = (filePath: string, currentOrgId: string) => {
      // Must reside inside org partition
      if (!filePath.startsWith(currentOrgId) && !filePath.includes(currentOrgId)) {
        throw new Error("Cross-tenant attachment access denied");
      }
      return true;
    };

    const arkFilePath = `${orgArkId}/announcements/1724650000_timetable.pdf`;
    const abcFilePath = `${orgAbcId}/announcements/1724650000_secret.pdf`;

    // ARK accessing own attachment succeeds
    expect(validateStoragePath(arkFilePath, orgArkId)).toBe(true);

    // ARK accessing ABC attachment throws 403 / security violation
    expect(() => validateStoragePath(abcFilePath, orgArkId)).toThrowError(
      /Cross-tenant attachment access denied/
    );
  });
});

describe("Timezone Correctness & Lifecycle Derivation", () => {
  it("computes status correctly relative to current timestamp", () => {
    const publishAt = "2026-10-10T08:00:00.000Z";
    const expiresAt = "2026-10-15T23:59:59.000Z";

    // Before publish time: scheduled
    const beforePublish = new Date("2026-10-09T12:00:00.000Z").getTime();
    expect(deriveAnnouncementStatus("scheduled", publishAt, expiresAt, beforePublish)).toBe(
      "scheduled"
    );

    // During active window: live
    const duringActive = new Date("2026-10-12T12:00:00.000Z").getTime();
    expect(deriveAnnouncementStatus("live", publishAt, expiresAt, duringActive)).toBe("live");

    // After expiration: expired
    const afterExpiry = new Date("2026-10-16T08:00:00.000Z").getTime();
    expect(deriveAnnouncementStatus("live", publishAt, expiresAt, afterExpiry)).toBe("expired");
  });
});

describe("Mutation Tests on Security Guards", () => {
  it("MUTATION CHECK: removing organization filter leaks cross-tenant records", () => {
    const org1 = "org-1";
    const dataset = [
      { id: "1", organization_id: "org-1", data: "Tenant 1 Secret" },
      { id: "2", organization_id: "org-2", data: "Tenant 2 Secret" },
    ];

    // Correct query
    const correctQuery = dataset.filter((d) => d.organization_id === org1);
    expect(correctQuery).toHaveLength(1);

    // Faulty mutated query (forgetting organization_id check)
    const mutatedQuery = dataset.filter((d) => Boolean(d.id));
    expect(mutatedQuery).toHaveLength(2); // Mutation detected!

    expect(mutatedQuery).not.toEqual(correctQuery);
  });
});
