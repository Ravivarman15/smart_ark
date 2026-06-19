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

  it("demo_scheduled → [student_name, course_name]", () => {
    expect(
      buildTemplateParams("demo_scheduled", { student_name: "Arjun", course_name: "Foundation" }),
    ).toEqual(["Arjun", "Foundation"]);
  });

  it("admission_completed → [student_name, course_name]", () => {
    expect(
      buildTemplateParams("admission_completed", { student_name: "Arjun", course_name: "NEET" }),
    ).toEqual(["Arjun", "NEET"]);
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
    expect(buildTemplateParams("lead_demo_reminder", { __body: "demo tomorrow" }))
      .toEqual(["demo tomorrow"]);
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
      "demo_scheduled",
      "admission_completed",
    ]);
  });
});
