import { describe, it, expect } from "vitest";
import {
  welcomeTemplateForCourse,
  renderLeadMessage,
  LEAD_TEMPLATES,
} from "./leadWhatsappTemplates";

describe("welcomeTemplateForCourse", () => {
  it("always maps to the single lead_welcome template", () => {
    expect(welcomeTemplateForCourse("NEET Repeater")).toBe("lead_welcome");
    expect(welcomeTemplateForCourse("JEE Mains")).toBe("lead_welcome");
    expect(welcomeTemplateForCourse("Foundation 9th")).toBe("lead_welcome");
    expect(welcomeTemplateForCourse("Home Tuition")).toBe("lead_welcome");
    expect(welcomeTemplateForCourse("Crash Course")).toBe("lead_welcome");
    expect(welcomeTemplateForCourse(undefined)).toBe("lead_welcome");
    expect(welcomeTemplateForCourse("")).toBe("lead_welcome");
  });

  it("no longer exposes course-specific welcome templates", () => {
    expect(LEAD_TEMPLATES).not.toHaveProperty("lead_welcome_neet");
    expect(LEAD_TEMPLATES).not.toHaveProperty("lead_welcome_jee");
    expect(LEAD_TEMPLATES).not.toHaveProperty("lead_welcome_foundation");
    expect(LEAD_TEMPLATES).not.toHaveProperty("lead_welcome_tuition");
  });
});

describe("renderLeadMessage", () => {
  it("renders the welcome with student_name ({{1}}) + course_name ({{2}}) substituted", () => {
    const r = renderLeadMessage("lead_welcome", {
      student_name: "Arjun",
      course_name: "NEET",
    });
    expect(r.body).toContain("Hi Arjun");
    expect(r.body).toContain("ARK Learning Arena");
    expect(r.body).toContain("successfully received your enquiry for NEET");
    expect(r.missing).toHaveLength(0);
  });

  it("renders the counselor-assignment alert with all 4 positional vars", () => {
    const r = renderLeadMessage("lead_assigned_counselor", {
      counselor_name: "Asha",
      student_name: "Arjun",
      course_name: "NEET",
      mobile_number: "9876543210",
    });
    expect(r.body).toContain("Asha");
    expect(r.body).toContain("New Lead Assigned");
    expect(r.body).toContain("Arjun");
    expect(r.body).toContain("NEET");
    expect(r.body).toContain("9876543210");
    expect(r.body).toContain("15 minutes");
    expect(r.missing).toHaveLength(0);
  });

  it("every template key has a non-empty body", () => {
    for (const [key, t] of Object.entries(LEAD_TEMPLATES)) {
      expect(t.body.length, key).toBeGreaterThan(0);
    }
  });

  it("registers every AiSensy campaign name the funnel dispatches (Phase 2 spec)", () => {
    // These are the exact provider campaign names send-aisensy posts as
    // `campaignName`. A missing key here = broken WhatsApp delivery.
    const required = [
      "lead_welcome",
      "lead_assigned_counselor",
      "lead_followup_reminder",
      "sla_breach_alert",
      "demo_scheduled",
      "admission_completed",
      "lead_unassigned_alert",
    ] as const;
    for (const key of required) {
      expect(LEAD_TEMPLATES[key], key).toBeDefined();
      // providerName is what becomes the AiSensy campaignName — must equal the key.
      expect(LEAD_TEMPLATES[key].providerName, key).toBe(key);
    }
  });
});
