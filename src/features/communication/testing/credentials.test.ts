import { describe, it, expect } from "vitest";
import {
  classifyStaffCredential,
  findDuplicates,
  summarizeStaffCredentials,
  credentialReasonLabel,
  type StaffCredRow,
} from "../utils/credentialHealth";

// ════════════════════════════════════════════════════════════════════════════
// CREDENTIAL HEALTH — executable verification (pure classification).
//
// The authoritative login proof happens server-side in the verify-credentials
// edge function (it performs a real signInWithPassword and is NOT runnable from
// the repo). This suite verifies the client-side structural classification that
// drives the Credential Health page and decides what needs repair first.
// ════════════════════════════════════════════════════════════════════════════

const row = (over: Partial<StaffCredRow>): StaffCredRow => ({
  profileId: over.profileId ?? "p",
  name: over.name ?? "Staff",
  email: over.email,
  userId: over.userId,
  isActive: over.isActive,
});

describe("credential health — staff classification", () => {
  it("no auth link → cannot log in at all", () => {
    expect(classifyStaffCredential(row({ userId: null, email: "a@x.com" }))).toBe("no_auth_link");
  });
  it("linked but no email", () => {
    expect(classifyStaffCredential(row({ userId: "u1", email: null }))).toBe("no_email");
  });
  it("inactive account", () => {
    expect(classifyStaffCredential(row({ userId: "u1", email: "a@x.com", isActive: false }))).toBe("inactive");
  });
  it("fully linked", () => {
    expect(classifyStaffCredential(row({ userId: "u1", email: "a@x.com", isActive: true }))).toBe("linked");
  });
});

describe("credential health — duplicate detection", () => {
  it("is case-insensitive and ignores blanks", () => {
    expect(findDuplicates(["a@x.com", "A@X.COM", "b@y.com", "", null])).toEqual(["a@x.com"]);
    expect(findDuplicates(["a@x.com", "b@y.com"])).toEqual([]);
  });
});

describe("credential health — summary", () => {
  it("rolls up counts and surfaces only the issues", () => {
    const s = summarizeStaffCredentials([
      row({ profileId: "1", name: "OK One", userId: "u1", email: "ok1@x.com", isActive: true }),
      row({ profileId: "2", name: "OK Two", userId: "u2", email: "ok2@x.com", isActive: true }),
      row({ profileId: "3", name: "No Login", userId: null, email: "nl@x.com" }),
      row({ profileId: "4", name: "No Email", userId: "u4", email: null }),
      row({ profileId: "5", name: "Dup A", userId: "u5", email: "dup@x.com", isActive: true }),
      row({ profileId: "6", name: "Dup B", userId: "u6", email: "DUP@x.com", isActive: true }),
    ]);
    expect(s.total).toBe(6);
    expect(s.linked).toBe(4);            // 1,2,5,6
    expect(s.missingAuthLink).toBe(1);   // 3
    expect(s.missingEmail).toBe(1);      // 4
    expect(s.issues.map((i) => i.profileId).sort()).toEqual(["3", "4"]);
    expect(s.duplicateEmails).toEqual(["dup@x.com"]);
  });
});

describe("credential health — reason labels", () => {
  it("maps known reasons and falls back for unknown", () => {
    expect(credentialReasonLabel("no_student_auth_backend")).toContain("no login backend");
    expect(credentialReasonLabel("login_failed")).toContain("Login validation failed");
    expect(credentialReasonLabel("something_new")).toBe("something_new");
    expect(credentialReasonLabel(undefined)).toBe("Unknown issue");
  });
});
