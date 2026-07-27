import { describe, it, expect } from "vitest";
import {
  suggestUsername,
  synthLoginEmail,
  isSyntheticEmail,
  classifyAccountHealth,
  findDuplicates,
  summarizeAccountHealth,
  accountReasonLabel,
  STUDENT_LOGIN_DOMAIN,
  PARENT_LOGIN_DOMAIN,
} from "../utils/authAccounts";
import type { StudentAuthAccount, ParentAuthAccount } from "../types/authAccounts.types";

// ════════════════════════════════════════════════════════════════════════════
// STUDENT & PARENT AUTH — executable verification (pure logic).
//
// The authoritative login proof runs server-side in the student-parent-accounts
// edge function (real signInWithPassword — NOT runnable from the repo). This
// suite verifies the deterministic helpers that drive provisioning + the Account
// Health dashboard.
// ════════════════════════════════════════════════════════════════════════════

describe("auth accounts — username & login email", () => {
  it("suggestUsername slugifies name + salt deterministically", () => {
    expect(suggestUsername("Aarav Sharma", "abcd1234")).toBe("aarav.sharma.abcd");
    expect(suggestUsername("  R.K. Menon!! ", "XY99zz")).toBe("r.k.menon.xy99");
    expect(suggestUsername("", "")).toBe("user.0000");
  });

  it("synthLoginEmail uses the right domain per subject", () => {
    expect(synthLoginEmail("aarav.sharma.abcd", "student")).toBe(`aarav.sharma.abcd@${STUDENT_LOGIN_DOMAIN}`);
    expect(synthLoginEmail("rk.menon.xy99", "parent")).toBe(`rk.menon.xy99@${PARENT_LOGIN_DOMAIN}`);
  });

  it("isSyntheticEmail detects placeholder logins", () => {
    expect(isSyntheticEmail(`x@${STUDENT_LOGIN_DOMAIN}`)).toBe(true);
    expect(isSyntheticEmail(`y@${PARENT_LOGIN_DOMAIN}`)).toBe(true);
    expect(isSyntheticEmail("real@gmail.com")).toBe(false);
    expect(isSyntheticEmail(null)).toBe(false);
  });
});

describe("auth accounts — health classification", () => {
  it("no userId → no_login, else passthrough status", () => {
    expect(classifyAccountHealth({ status: "active" })).toBe("no_login");
    expect(classifyAccountHealth({ userId: "u", status: "active" })).toBe("active");
    expect(classifyAccountHealth({ userId: "u", status: "disabled" })).toBe("disabled");
    expect(classifyAccountHealth({ userId: "u", status: "locked" })).toBe("locked");
    expect(classifyAccountHealth({ userId: "u", status: "pending" })).toBe("pending");
  });

  it("findDuplicates is case-insensitive and skips blanks", () => {
    expect(findDuplicates(["jo.x", "JO.X", "k.y", "", null])).toEqual(["jo.x"]);
    expect(findDuplicates(["a", "b"])).toEqual([]);
  });
});

describe("auth accounts — health snapshot", () => {
  const stu = (over: Partial<StudentAuthAccount>): StudentAuthAccount => ({
    id: over.id ?? "s", studentId: over.studentId ?? "stu", userId: over.userId,
    username: over.username, loginEmail: over.loginEmail, status: over.status ?? "pending",
  });
  const par = (over: Partial<ParentAuthAccount>): ParentAuthAccount => ({
    id: over.id ?? "p", userId: over.userId, username: over.username, loginEmail: over.loginEmail,
    status: over.status ?? "pending", linkedStudentIds: over.linkedStudentIds ?? [],
    children: over.children ?? [],
  });

  it("counts created/missing/status and flags duplicates (ignoring synthetic emails)", () => {
    const studentAccounts = [
      stu({ id: "1", userId: "u1", username: "a.one", loginEmail: `a.one@${STUDENT_LOGIN_DOMAIN}`, status: "active" }),
      stu({ id: "2", userId: "u2", username: "a.two", loginEmail: `a.two@${STUDENT_LOGIN_DOMAIN}`, status: "disabled" }),
      stu({ id: "3", userId: "u3", username: "a.three", loginEmail: `a.three@${STUDENT_LOGIN_DOMAIN}`, status: "pending" }), // provisioned, not yet active
    ];
    const parentAccounts = [
      par({ id: "p1", userId: "pu1", username: "p.one", loginEmail: "real@gmail.com", status: "active" }),
      par({ id: "p2", userId: "pu2", username: "p.one", loginEmail: "REAL@gmail.com", status: "locked" }), // dup username + dup real email
    ];
    const snap = summarizeAccountHealth({ totalStudents: 5, studentAccounts, parentAccounts });

    expect(snap.totalStudents).toBe(5);
    expect(snap.studentAccountsCreated).toBe(3);          // all 3 have userId
    expect(snap.studentAccountsMissing).toBe(2);          // 5 - 3
    expect(snap.parentAccountsCreated).toBe(2);
    expect(snap.disabledAccounts).toBe(1);
    expect(snap.lockedAccounts).toBe(1);
    expect(snap.pendingAccounts).toBe(1);                 // the un-provisioned student
    expect(snap.duplicateUsernames).toEqual(["p.one"]);
    expect(snap.duplicateEmails).toEqual(["real@gmail.com"]); // synthetic student emails NOT flagged
  });
});

describe("auth accounts — reason labels", () => {
  it("maps known reasons and falls back", () => {
    expect(accountReasonLabel("no_student_account")).toContain("create one first");
    expect(accountReasonLabel("login_failed")).toContain("Login validation failed");
    expect(accountReasonLabel("brand_new")).toBe("brand_new");
    expect(accountReasonLabel(undefined)).toBe("Unknown issue");
  });
});
