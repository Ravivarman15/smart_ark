import { describe, it, expect } from "vitest";
import { buildTemplateParams, POSITIONAL_TEMPLATES } from "./templateParams";

describe("buildTemplateParams", () => {
  it("lead_welcome → [student_name, course_name]", () => {
    expect(
      buildTemplateParams("lead_welcome", { student_name: "Arjun", course_name: "NEET" }),
    ).toEqual(["Arjun", "NEET"]);
  });

  it("lead_assigned_counselor → [counselor_name, student_name, course_name, mobile_number]", () => {
    expect(
      buildTemplateParams("lead_assigned_counselor", {
        counselor_name: "Asha",
        student_name: "Arjun",
        course_name: "NEET",
        mobile_number: "9876543210",
      }),
    ).toEqual(["Asha", "Arjun", "NEET", "9876543210"]);
  });

  it("lead_followup_reminder → [counselor_name, student_name, course_name]", () => {
    expect(
      buildTemplateParams("lead_followup_reminder", {
        counselor_name: "Asha",
        student_name: "Arjun",
        course_name: "JEE",
      }),
    ).toEqual(["Asha", "Arjun", "JEE"]);
  });

  it("sla_breach_alert → [counselor_name, student_name, course_name]", () => {
    expect(
      buildTemplateParams("sla_breach_alert", {
        counselor_name: "Asha",
        student_name: "Arjun",
        course_name: "NEET",
        __body: "SLA BREACH text",
      }),
    ).toEqual(["Asha", "Arjun", "NEET"]);
  });

  it("lead_demo_scheduled_v2 → [student_name, course_name, demo_date, demo_time, faculty_name]", () => {
    expect(
      buildTemplateParams("lead_demo_scheduled_v2", {
        student_name: "Arjun",
        course_name: "Foundation",
        demo_date: "24 Jun 2026",
        demo_time: "05:30 PM",
        faculty_name: "Mr. Rao",
      }),
    ).toEqual(["Arjun", "Foundation", "24 Jun 2026", "05:30 PM", "Mr. Rao"]);
  });

  it("lead_demo_scheduled_v2 accepts faculty alias for faculty_name", () => {
    expect(
      buildTemplateParams("lead_demo_scheduled_v2", {
        student_name: "Arjun",
        course: "Foundation",
        demo_date: "24 Jun 2026",
        demo_time: "05:30 PM",
        faculty: "Mr. Rao",
      }),
    ).toEqual(["Arjun", "Foundation", "24 Jun 2026", "05:30 PM", "Mr. Rao"]);
  });

  it("lead_admission_completed_v2 → [parent_name, student_name, course_name] (order is FINAL)", () => {
    expect(
      buildTemplateParams("lead_admission_completed_v2", {
        parent_name: "Mr. Sharma",
        student_name: "Arjun",
        course_name: "NEET",
      }),
    ).toEqual(["Mr. Sharma", "Arjun", "NEET"]);
  });

  it("lead_demo_reminder_v2 → [student_name, course_name, demo_date, demo_time]", () => {
    expect(
      buildTemplateParams("lead_demo_reminder_v2", {
        student_name: "Arjun",
        course_name: "JEE",
        demo_date: "24 Jun 2026",
        demo_time: "05:30 PM",
      }),
    ).toEqual(["Arjun", "JEE", "24 Jun 2026", "05:30 PM"]);
  });

  it("aliases course_name←course and mobile_number←mobile/phone", () => {
    expect(buildTemplateParams("lead_welcome", { student_name: "A", course: "NEET" }))
      .toEqual(["A", "NEET"]);
    expect(
      buildTemplateParams("lead_assigned_counselor", {
        counselor_name: "Asha", student_name: "A", course: "NEET", phone: "9000000000",
      }),
    ).toEqual(["Asha", "A", "NEET", "9000000000"]);
  });

  it("missing values become empty strings, order preserved", () => {
    expect(buildTemplateParams("lead_assigned_counselor", { student_name: "A" }))
      .toEqual(["", "A", "", ""]);
  });

  it("non-positional templates fall back to the single rendered body", () => {
    expect(buildTemplateParams("lead_unassigned_alert", { __body: "unassigned text" }))
      .toEqual(["unassigned text"]);
    expect(buildTemplateParams("lead_low_performance", { __body: "low perf" }))
      .toEqual(["low perf"]);
  });

  it("unknown template with no body → empty array", () => {
    expect(buildTemplateParams("nope", {})).toEqual([]);
  });

  it("exposes the positional template set", () => {
    expect(POSITIONAL_TEMPLATES).toEqual([
      "lead_welcome",
      "lead_assigned_counselor",
      "lead_followup_reminder",
      "sla_breach_alert",
      "lead_demo_scheduled_v2",
      "lead_admission_completed_v2",
      "lead_demo_reminder_v2",
      "fee_receipt",
      "staff_credentials",
      "parent_credentials",
      "attendance_absent",
      "attendance_corrected",
      // ── Multi-tenant family (Phase E) ─────────────────────────────────
      // New campaigns, each appending org_name as the LAST positional
      // parameter. They receive no traffic until their status is ACTIVE in
      // providerTemplates.ts — resolveCampaign() returns the legacy campaign
      // for every other status.
      "smartark_attendance_absent",
      "smartark_attendance_corrected",
      "smartark_staff_credentials1",
      "smartark_student_credentials1",
      "smartark_fee_receipt",
      // ── Lead CRM / Enquiry family (Phase F) ───────────────────────────
      // The legacy lead campaigns take NO org_name parameter, so the
      // institution's name is static text inside the approved Meta body —
      // ARK's name, delivered to every tenant's enquirers. Each of these is
      // its legacy order with org_name appended.
      "smartark_lead_enquiry_received",
      "smartark_lead_assigned",
      "smartark_lead_followup_due",
      "smartark_lead_sla_breach",
      "smartark_lead_demo_scheduled",
      "smartark_lead_demo_reminder",
      "smartark_lead_admission_confirmed",
      // ── Legacy campaign-name aliases ──────────────────────────────────
      // attendanceWhatsapp.service now looks specs up by the RESOLVED
      // CAMPAIGN rather than the template key, so the `ark_`-prefixed names
      // must resolve too. Without them buildTemplateParams falls through to
      // the single-body parameter and ARK's live five-parameter attendance
      // template silently starts receiving one.
      "ark_attendance_absent",
      "ark_attendance_corrected",
    ]);
  });

  it("staff_credentials → staff, role, login email, password, portal link", () => {
    expect(
      buildTemplateParams("staff_credentials", {
        staff_name: "Asha Rao",
        role: "Teacher",
        login_email: "asha@thearktuition.com",
        password: "Ark#7712",
        login_url: "https://smartark.vercel.app/login",
      }),
    ).toEqual([
      "Asha Rao",
      "Teacher",
      "asha@thearktuition.com",
      "Ark#7712",
      "https://smartark.vercel.app/login",
    ]);
  });

  it("staff_credentials accepts the login-proven username for {{3}}", () => {
    // The gated Send Staff Credentials page composes with the username the
    // password was just verified against, not the profile email.
    expect(
      buildTemplateParams("staff_credentials", {
        staff_name: "A",
        designation: "Coordinator",
        username: "asha@thearktuition.com",
        password: "p",
        login_url: "https://x/login",
      }),
    ).toEqual(["A", "Coordinator", "asha@thearktuition.com", "p", "https://x/login"]);
  });

  // Parent Portal credentials. A wrong order here sends a parent their password
  // in the "login email" line — and the password field is shown ONCE, so there
  // is no second copy to compare against.
  it("parent_credentials → parent, student, login email, password, portal link", () => {
    expect(
      buildTemplateParams("parent_credentials", {
        parent_name: "Ravivarman",
        student_name: "Ravi test",
        login_email: "ravi.a3f9@parents.ark.local",
        password: "Ark#4821",
        login_url: "https://smartark.vercel.app/login",
      }),
    ).toEqual([
      "Ravivarman",
      "Ravi test",
      "ravi.a3f9@parents.ark.local",
      "Ark#4821",
      "https://smartark.vercel.app/login",
    ]);
  });

  it("parent_credentials accepts username as an alias for the login email", () => {
    expect(
      buildTemplateParams("parent_credentials", {
        parent_name: "R",
        student_name: "S",
        username: "s.a3f9",
        password: "p",
        login_url: "https://x/login",
      })[2],
    ).toBe("s.a3f9");
  });

  // Enterprise Attendance WhatsApp Automation — these are sent synchronously on
  // Submit Attendance, so a wrong order here messages parents with the fields
  // swapped. Pinned to the AiSensy utility templates.
  it("attendance_absent → parent, student, class, section, date", () => {
    expect(
      buildTemplateParams("attendance_absent", {
        parent_name: "Mr. Sharma",
        student_name: "Aarav Sharma",
        class: "10",
        section: "A",
        attendance_date: "14 Jul 2026",
      }),
    ).toEqual(["Mr. Sharma", "Aarav Sharma", "10", "A", "14 Jul 2026"]);
  });

  it("attendance_corrected → parent, student, date", () => {
    expect(
      buildTemplateParams("attendance_corrected", {
        parent_name: "Mr. Sharma",
        student_name: "Aarav Sharma",
        attendance_date: "14 Jul 2026",
      }),
    ).toEqual(["Mr. Sharma", "Aarav Sharma", "14 Jul 2026"]);
  });
});
