import { describe, it, expect } from "vitest";
import { ensureWhatsappPhone, isWhatsappPhone } from "./whatsappPhone";

describe("ensureWhatsappPhone", () => {
  it("prefixes a bare 10-digit Indian mobile with 91", () => {
    expect(ensureWhatsappPhone("7305801869")).toEqual({ phone: "917305801869", reason: null });
  });

  it("strips +, spaces and hyphens from an E.164 number", () => {
    expect(ensureWhatsappPhone("+91 73058-01869").phone).toBe("917305801869");
  });

  it("drops a leading STD 0", () => {
    expect(ensureWhatsappPhone("07305801869").phone).toBe("917305801869");
  });

  it("passes through an already-canonical 91XXXXXXXXXX number", () => {
    expect(ensureWhatsappPhone("917305801869").phone).toBe("917305801869");
  });

  it("rejects null / empty with a 'missing' reason", () => {
    expect(ensureWhatsappPhone(null)).toEqual({ phone: null, reason: "Phone number missing" });
    expect(ensureWhatsappPhone("")).toEqual({ phone: null, reason: "Phone number missing" });
    expect(ensureWhatsappPhone("   ")).toEqual({ phone: null, reason: "Phone number missing" });
  });

  it("rejects fewer than 10 digits with an 'invalid' reason", () => {
    const r = ensureWhatsappPhone("12345");
    expect(r.phone).toBeNull();
    expect(r.reason).toMatch(/invalid/i);
  });

  it("isWhatsappPhone reflects validity", () => {
    expect(isWhatsappPhone("7305801869")).toBe(true);
    expect(isWhatsappPhone("123")).toBe(false);
    expect(isWhatsappPhone(undefined)).toBe(false);
  });
});
