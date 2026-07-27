import { describe, it, expect } from "vitest";
import {
  evaluateCandidate,
  extractParentCandidates,
  findExistingAccount,
  findSiblings,
  isValidEmail,
  isValidMobile,
  normalizeMobile,
  preferredCandidate,
  summariseGaps,
} from "../utils/parentCandidates";
import type { Student } from "@/features/students/types";

const student = (over: Partial<Student> = {}): Student =>
  ({
    id: over.id ?? "s1",
    name: over.name ?? "Ram",
    batch: "A",
    spi: 0,
    risk: "safe",
    active: true,
    ...over,
  }) as Student;

describe("normalizeMobile", () => {
  it("reduces every common spelling to the same 10 digits", () => {
    // The same parent arrives as all of these across admission forms and
    // imported spreadsheets. Treating them as different people would mint a
    // duplicate login per spelling.
    for (const v of ["9876543210", "+91 98765 43210", "091-9876543210", "0919876543210"]) {
      expect(normalizeMobile(v)).toBe("9876543210");
    }
  });

  it("handles junk without throwing", () => {
    expect(normalizeMobile(undefined)).toBe("");
    expect(normalizeMobile("n/a")).toBe("");
  });

  it("validates only true 10-digit numbers", () => {
    expect(isValidMobile("+91 98765 43210")).toBe(true);
    expect(isValidMobile("12345")).toBe(false);
    expect(isValidMobile("")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts real addresses and rejects the rest", () => {
    expect(isValidEmail("mani@example.com")).toBe(true);
    expect(isValidEmail("mani@example")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("  ")).toBe(false);
  });
});

describe("evaluateCandidate — what blocks creation", () => {
  it("blocks on a missing name", () => {
    const r = evaluateCandidate("", "9876543210", "a@b.com");
    expect(r.canCreate).toBe(false);
    expect(r.missing.find((m) => m.field === "name")?.severity).toBe("blocking");
  });

  it("allows creation with a mobile but no email", () => {
    const r = evaluateCandidate("Mani", "9876543210", "");
    expect(r.canCreate).toBe(true);
    expect(r.missing.find((m) => m.field === "email")?.severity).toBe("advisory");
  });

  it("allows creation with an email but no mobile", () => {
    const r = evaluateCandidate("Mani", "", "mani@example.com");
    expect(r.canCreate).toBe(true);
    expect(r.missing.find((m) => m.field === "mobile")?.severity).toBe("advisory");
  });

  it("BLOCKS when there is neither mobile nor email", () => {
    // The login would be created and then stranded — no way to deliver the
    // credentials to anyone.
    const r = evaluateCandidate("Mani", "", "");
    expect(r.canCreate).toBe(false);
    const blocking = r.missing.filter((m) => m.severity === "blocking");
    // Reported ONCE, not as two separate red rows — it is one failure.
    expect(blocking).toHaveLength(1);
    expect(blocking[0].label).toBe("Mobile number or email");
  });

  it("never labels a gap advisory while giving it blocking language", () => {
    // Regression: the email gap used to render in the amber "will still work"
    // panel while its text said there was no way to send the login.
    for (const [n, m, e] of [
      ["Mani", "", ""],
      ["Mani", "9876543210", ""],
      ["Mani", "", "a@b.com"],
      ["", "", ""],
    ] as [string, string, string][]) {
      for (const gap of evaluateCandidate(n, m, e).missing) {
        if (gap.severity === "advisory") {
          expect(gap.why).not.toMatch(/no way to send|cannot be created/i);
        }
      }
    }
  });

  it("flags a malformed mobile without blocking when an email exists", () => {
    const r = evaluateCandidate("Mani", "12345", "mani@example.com");
    expect(r.canCreate).toBe(true);
    expect(r.missing.some((m) => m.field === "mobile")).toBe(true);
  });

  it("is clean when everything is present", () => {
    const r = evaluateCandidate("Mani", "9876543210", "mani@example.com");
    expect(r.canCreate).toBe(true);
    expect(r.missing).toEqual([]);
  });
});

describe("extractParentCandidates", () => {
  it("returns all three slots even when empty", () => {
    // A visible "Mother — nothing recorded" is the actionable signal; silently
    // omitting the row hides the gap staff need to close.
    const c = extractParentCandidates(student());
    expect(c.map((x) => x.role)).toEqual(["father", "mother", "guardian"]);
    expect(c.every((x) => x.isEmpty)).toBe(true);
  });

  it("pulls father details off the student record", () => {
    const c = extractParentCandidates(
      student({ parentName: "Mani", parentContact: "9876543210", parentEmail: "mani@x.com" }),
    );
    expect(c[0]).toMatchObject({ name: "Mani", mobile: "9876543210", email: "mani@x.com" });
    expect(c[0].canCreate).toBe(true);
  });

  it("pulls mother details independently", () => {
    const c = extractParentCandidates(
      student({ motherName: "Latha", motherContact: "9000000001" }),
    );
    expect(c[1].name).toBe("Latha");
    expect(c[1].canCreate).toBe(true);
    expect(c[0].isEmpty).toBe(true);
  });

  it("labels the guardian with their relation", () => {
    const c = extractParentCandidates(
      student({ guardianName: "Suresh", guardianRelation: "Uncle", guardianContact: "9000000002" }),
    );
    expect(c[2].roleLabel).toBe("Guardian (Uncle)");
    expect(c[2].name).toBe("Suresh");
  });

  it("falls back to the shared parent email for a guardian", () => {
    // There is no guardian_email column on students.
    const c = extractParentCandidates(
      student({ guardianName: "Suresh", guardianContact: "9000000002", parentEmail: "home@x.com" }),
    );
    expect(c[2].email).toBe("home@x.com");
  });

  it("trims whitespace-only fields to empty", () => {
    const c = extractParentCandidates(student({ parentName: "   ", parentContact: "  " }));
    expect(c[0].isEmpty).toBe(true);
  });
});

describe("preferredCandidate", () => {
  it("prefers a slot that has a valid mobile", () => {
    const c = extractParentCandidates(
      student({
        parentName: "Mani",
        parentEmail: "mani@x.com",
        motherName: "Latha",
        motherContact: "9876543210",
      }),
    );
    expect(preferredCandidate(c)?.role).toBe("mother");
  });

  it("falls back to any creatable slot", () => {
    const c = extractParentCandidates(student({ parentName: "Mani", parentEmail: "m@x.com" }));
    expect(preferredCandidate(c)?.role).toBe("father");
  });

  it("surfaces a partially-filled slot when none can be created", () => {
    const c = extractParentCandidates(student({ parentName: "Mani" }));
    expect(preferredCandidate(c)?.role).toBe("father");
  });

  it("returns undefined when the record is entirely blank", () => {
    expect(preferredCandidate(extractParentCandidates(student()))).toBeUndefined();
  });
});

describe("findSiblings", () => {
  const kids = [
    student({ id: "1", name: "Ram", parentContact: "9876543210" }),
    student({ id: "2", name: "Sita", parentContact: "+91 98765 43210" }),
    student({ id: "3", name: "Other", parentContact: "9000000000" }),
    student({ id: "4", name: "Bala", motherContact: "9876543210" }),
  ];

  it("matches across mobile formats and guardian slots", () => {
    const out = findSiblings(kids, "9876543210", "1");
    expect(out.map((s) => s.name).sort()).toEqual(["Bala", "Sita"]);
  });

  it("excludes the student being provisioned", () => {
    expect(findSiblings(kids, "9876543210", "1").some((s) => s.id === "1")).toBe(false);
  });

  it("returns nothing for an invalid mobile", () => {
    expect(findSiblings(kids, "123", "1")).toEqual([]);
    expect(findSiblings(kids, "", "1")).toEqual([]);
  });
});

describe("findExistingAccount", () => {
  const accounts = [
    { id: "a", mobile: "+91 98765 43210", email: "mani@x.com", loginEmail: "mani.a1@parents.ark.local" },
    { id: "b", mobile: "9000000000", email: "", loginEmail: "other@parents.ark.local" },
  ];

  it("matches on mobile across formats", () => {
    expect(findExistingAccount(accounts, "9876543210", "")?.id).toBe("a");
  });

  it("falls back to email when the mobile does not match", () => {
    expect(findExistingAccount(accounts, "9111111111", "mani@x.com")?.id).toBe("a");
  });

  it("matches the synthesised login email too", () => {
    expect(findExistingAccount(accounts, "", "other@parents.ark.local")?.id).toBe("b");
  });

  it("returns undefined when the person is genuinely new", () => {
    expect(findExistingAccount(accounts, "9222222222", "new@x.com")).toBeUndefined();
  });

  it("does not match on an empty mobile and empty email", () => {
    expect(findExistingAccount(accounts, "", "")).toBeUndefined();
  });
});

describe("summariseGaps", () => {
  it("separates blocking from advisory and prefixes the guardian slot", () => {
    const c = extractParentCandidates(
      student({ parentName: "Mani", motherName: "Latha", motherContact: "9876543210" }),
    );
    const { blocking, advisory } = summariseGaps(c);
    // Father has a name but neither mobile nor email → blocking.
    expect(blocking.some((b) => b.label.startsWith("Father"))).toBe(true);
    // Mother has name + mobile, missing email only → advisory.
    expect(advisory.some((a) => a.label === "Mother — Email address")).toBe(true);
  });

  it("does not repeat the same gap twice for one slot", () => {
    const c = extractParentCandidates(student());
    const { blocking } = summariseGaps(c);
    expect(new Set(blocking.map((b) => b.label)).size).toBe(blocking.length);
  });
});
