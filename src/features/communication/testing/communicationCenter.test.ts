import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTOMATION_EVENTS, AUTOMATION_CATEGORIES } from "../constants/automationEvents";
import { automationResolverService } from "../services/automationResolvers";

// ════════════════════════════════════════════════════════════════════════════
// COMMUNICATION CENTER — REGISTRY-DRIVEN UI
//
// The mandatory requirement: a developer adding an event to the canonical
// registry must get a working card here with NO UI change. That property is
// impossible to verify by looking at a screenshot and trivial to destroy with
// one `if (eventKey === …)`, so it is asserted structurally.
// ════════════════════════════════════════════════════════════════════════════

const HERE = join(__dirname, "..");
const page = readFileSync(join(HERE, "pages", "CommunicationCenterPage.tsx"), "utf8");
const stripComments = (s: string) =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const code = stripComments(page);

describe("The UI is derived from the registry, never hardcoded", () => {
  it("renders from AUTOMATION_EVENTS", () => {
    expect(code).toMatch(/AUTOMATION_EVENTS\.filter|AUTOMATION_EVENTS\.map/);
  });

  it("names no individual event", () => {
    // A single hardcoded key means the next event added silently does not
    // appear — the exact failure this requirement exists to prevent.
    const named = AUTOMATION_EVENTS.map((e) => e.key).filter((k) =>
      new RegExp(`["'\`]${k}["'\`]`).test(code),
    );
    expect(named, `these event keys are hardcoded in the UI: ${named.join(", ")}`).toEqual([]);
  });

  it("branches on no event key", () => {
    expect(code, "a switch over event keys defeats auto-discovery")
      .not.toMatch(/switch\s*\(\s*e\.key|switch\s*\(\s*eventKey/);
    expect(code).not.toMatch(/e\.key === ["'`]/);
  });

  it("derives its category filter from the registry too", () => {
    // Otherwise a new category appears in the data and not in the filter.
    expect(code).toMatch(/AUTOMATION_CATEGORIES/);
    expect(AUTOMATION_CATEGORIES.length).toBeGreaterThan(3);
  });

  it("derives 'fully automatic' from the resolver registry", () => {
    expect(code).toMatch(/automationResolverService\.automatableEvents\(\)/);
    // And that list must be real, not empty — otherwise every card would
    // silently read "trigger-supplied".
    expect(automationResolverService.automatableEvents().length).toBeGreaterThan(5);
  });

  it("every automatable event is a canonical registry event", () => {
    const known = new Set(AUTOMATION_EVENTS.map((e) => e.key));
    for (const k of automationResolverService.automatableEvents()) {
      expect(known.has(k), `${k} has a resolver but is not in the canonical registry`).toBe(true);
    }
  });
});

describe("A new event appears with no UI change", () => {
  it("the page reads label, category, description, channel and template generically", () => {
    // Each of these must come off the registry object, so a new entry renders
    // completely rather than as a card with blank fields.
    for (const field of ["e.label", "e.category", "e.description", "e.defaultChannel", "e.defaultTemplate"]) {
      expect(code, `the card does not render ${field}`).toContain(field);
    }
  });

  it("the toggle writes back the event's own key", () => {
    expect(code).toMatch(/eventKey: e\.key/);
  });

  it("an unsaved event falls back to the registry default, not to ON", () => {
    // Defaulting an unconfigured event to enabled would start messaging
    // parents the moment a developer adds a registry entry.
    expect(code).toMatch(/setting\?\.enabled \?\? e\.defaultEnabled \?\? false/);
  });
});

describe("Nothing is fabricated", () => {
  it("metrics come from the analytics service", () => {
    expect(code).toMatch(/useCommsAnalytics/);
  });

  it("a missing metric renders as a dash, never as zero", () => {
    // "0 delivered" and "we could not read the delivery count" are different
    // facts, and showing the first for the second is how a dashboard lies.
    expect(code).toMatch(/analytics\?\.sent \?\? "—"/);
    expect(code).toMatch(/analytics\?\.delivered \?\? "—"/);
  });

  it("provider status is shown, never assumed", () => {
    // Claiming a template is live when Meta has not approved it is how an
    // unapproved send gets a WhatsApp number flagged.
    expect(code).toMatch(/PROVIDER_TEMPLATES_BY_KEY/);
    expect(page).toMatch(/status is <strong>active<\/strong>/);
  });

  it("shows the campaign actually posted today, not the aspirational one", () => {
    // Pre-cutover that is the LEGACY ARK campaign, and saying so is the point.
    expect(code).toMatch(/pt\.status === "ACTIVE" \? pt\.campaign : pt\.legacyCampaign/);
  });
});

describe("Registered like every other module", () => {
  const ROOT = join(HERE, "..", "..", "..");
  it("appears in the RBAC catalog, the menu and sharedRoutes", () => {
    // Missing any one of these means it is invisible to some role, or
    // ungrantable in Manage Staff Role.
    const catalog = readFileSync(join(ROOT, "src/features/rbac/constants/catalog.ts"), "utf8");
    const menu = readFileSync(join(ROOT, "src/core/navigation/menu.config.ts"), "utf8");
    const routes = readFileSync(join(ROOT, "src/core/routing/sharedRoutes.tsx"), "utf8");
    expect(catalog).toContain('"whatsapp.center"');
    expect(menu).toContain('"whatsapp.center"');
    expect(routes).toContain('submodule: "whatsapp.center"');
  });
});
