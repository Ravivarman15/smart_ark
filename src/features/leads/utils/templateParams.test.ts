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
    ]);
  });
});
