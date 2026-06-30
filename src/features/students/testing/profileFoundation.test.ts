import { describe, it, expect } from "vitest";
import {
  channelsForPreference,
  decideChannel,
  partitionByPreference,
} from "@/features/communication/utils/communicationPreference";
import { rowsToImportRecords } from "../utils/importMapping";

describe("communication preference", () => {
  it("maps each preference to the right channels", () => {
    expect(channelsForPreference("WHATSAPP")).toEqual(["whatsapp"]);
    expect(channelsForPreference("EMAIL")).toEqual(["email"]);
    expect(channelsForPreference("SMS")).toEqual(["sms"]);
    expect(channelsForPreference("BOTH")).toEqual(["whatsapp", "email"]);
    expect(channelsForPreference("NONE")).toEqual([]);
    // Unknown / empty must NOT block legacy students.
    expect(channelsForPreference(undefined)).toContain("whatsapp");
    expect(channelsForPreference("")).toContain("email");
  });

  it("decides + logs a reason when a channel is blocked", () => {
    expect(decideChannel("whatsapp", "WHATSAPP").allowed).toBe(true);
    const none = decideChannel("whatsapp", "NONE");
    expect(none.allowed).toBe(false);
    expect(none.reason).toMatch(/NONE/);
    const wrong = decideChannel("email", "WHATSAPP");
    expect(wrong.allowed).toBe(false);
    expect(wrong.reason).toMatch(/not permitted/);
  });

  it("partitions recipients with skip reasons", () => {
    const recipients = [
      { id: "1", communicationPreference: "WHATSAPP" },
      { id: "2", communicationPreference: "NONE" },
      { id: "3", communicationPreference: "EMAIL" },
      { id: "4" }, // no preference → allowed
    ];
    const { send, skipped } = partitionByPreference(recipients, "whatsapp");
    expect(send.map((r) => r.id)).toEqual(["1", "4"]);
    expect(skipped).toHaveLength(2);
    expect(skipped.every((s) => !!s.reason)).toBe(true);
  });
});

describe("import smart aliases — foundation fields", () => {
  it("maps section / blood / transport / hostel / emergency / medical / comm pref", () => {
    const sheet = [
      [
        "Name",
        "Section",
        "Blood Group",
        "Transport",
        "Hostel",
        "Emergency Contact Name",
        "Emergency Number",
        "Medical Notes",
        "Communication Preference",
        "Student Status",
      ],
      [
        "Asha R",
        "B",
        "O+",
        "Yes",
        "No",
        "Ravi R",
        "+91 98765 43210",
        "Asthma",
        "WhatsApp",
        "Active",
      ],
    ];
    const [rec] = rowsToImportRecords(sheet);
    const s = rec.student as Record<string, unknown>;
    expect(s.section).toBe("B");
    expect(s.bloodGroup).toBe("O+");
    expect(s.transportRequired).toBe(true);
    expect(s.hostelRequired).toBe(false);
    expect(s.emergencyContactName).toBe("Ravi R");
    expect(s.emergencyContactNumber).toBe("919876543210");
    expect(s.medicalConditions).toBe("Asthma");
    expect(s.communicationPreference).toBe("WHATSAPP");
    expect(s.studentStatus).toBe("ACTIVE");
  });

  it("drops an unrecognised communication preference rather than writing junk", () => {
    const sheet = [
      ["Name", "Communication Preference"],
      ["Bimal K", "carrier pigeon"],
    ];
    const [rec] = rowsToImportRecords(sheet);
    expect((rec.student as Record<string, unknown>).communicationPreference).toBeUndefined();
  });
});
