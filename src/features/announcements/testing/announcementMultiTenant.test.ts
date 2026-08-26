// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Multi-Tenant Isolation Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { __setActiveOrganization, type Organization } from "@/core/tenant/tenant";
import { announcementsService } from "../services/announcements.service";
import { orgPath, stripOrgPrefix, hasOrgPrefix } from "@/lib/orgStorage";

const makeOrg = (id: string, slug: string): Organization => ({
  id,
  slug,
  displayName: `Org ${slug}`,
  legalName: `Org ${slug} Ltd`,
  status: "active",
  timezone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
});

describe("Announcements Multi-Tenant Storage Partitioning", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    __setActiveOrganization(null);
  });

  it("partitions attachment file paths with current organization ID", () => {
    __setActiveOrganization(makeOrg(orgA, "tenant-a"));
    const path = orgPath("announcements/timetable.pdf");
    expect(path).toBe(`${orgA}/announcements/timetable.pdf`);
    expect(hasOrgPrefix(path)).toBe(true);
    expect(stripOrgPrefix(path)).toBe("announcements/timetable.pdf");
  });

  it("throws when attempting to upload without an active organization context", () => {
    __setActiveOrganization(null);
    expect(() => orgPath("announcements/timetable.pdf")).toThrow(/No active organization/);
  });

  it("blocks Tenant B from generating download URLs for Tenant A file paths", async () => {
    __setActiveOrganization(makeOrg(orgB, "tenant-b"));
    const tenantAFilePath = `${orgA}/announcements/exam_timetable.pdf`;

    await expect(
      announcementsService.getAttachmentDownloadUrl(tenantAFilePath)
    ).rejects.toThrow();
  });
});
