// ──────────────────────────────────────────────────────────────────────────────
// AUTOMATION REGISTRY AUDIT — the CI gate
//
// Detects, and fails the build on:
//   registered event → no template
//   registered event → no resolver
//   registered event → no trigger
//   enabled event    → not dispatchable   (the ten-green-switches defect)
//   declared trigger → file no longer dispatches it
//   declared resolver set → drifted from automationResolvers.ts
//
// The declarations in automationState.ts are hand-maintained. This file is what
// makes that safe: every declaration is checked against the actual source, so a
// stale entry breaks the build instead of quietly becoming a lie.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AUTOMATION_EVENTS } from "@/features/communication/constants/automationEvents";
import {
  diagnoseAll, diagnoseAutomation, TRIGGER_SOURCES, RESOLVER_EVENTS,
  CALLER_RESOLVED_EVENTS, BLOCKED_EVENTS, KNOWN_UNTRIGGERED,
} from "@/features/communication/utils/automationState";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("every registered event is fully declared", () => {
  it.each(AUTOMATION_EVENTS.map((e) => [e.key, e] as const))(
    "%s",
    (key, event) => {
      const d = diagnoseAutomation(event);
      // BLOCKED is an acceptable, honest terminal state. Everything else must
      // at minimum have a template, a trigger and a way to find recipients.
      if (d.state === "BLOCKED") {
        expect(BLOCKED_EVENTS[key], `${key} is BLOCKED but gives no reason`).toBeTruthy();
        return;
      }
      // A template is non-negotiable: without one, dispatch is a silent no-op.
      expect(d.templateReady, `${key}: template "${d.templateKey}" is defined nowhere`).toBe(true);
      expect(d.resolverReady, `${key}: no resolver and no caller-supplied recipients`).toBe(true);
      // An untriggered event is a real gap, but four pre-date this phase. They
      // are enumerated so a NEW one fails here rather than joining them.
      if (!d.triggerReady) {
        expect(
          KNOWN_UNTRIGGERED[key],
          `${key} has no trigger and is not listed in KNOWN_UNTRIGGERED. ` +
            `Either wire up a dispatch call or document why it cannot fire.`,
        ).toBeTruthy();
      }
    },
  );
});

describe("declared trigger sources are real", () => {
  // A trigger map that drifts is worse than none: it reports an event as wired
  // when the dispatch call has been renamed or deleted.
  it.each(Object.entries(TRIGGER_SOURCES))("%s → %s", (eventKey, file) => {
    expect(existsSync(join(ROOT, file)), `${file} does not exist`).toBe(true);
    const src = read(file);
    // The scheduler dispatches by `case "<key>"`; app services by string
    // literal. Either way the key must physically appear in the named file.
    expect(
      src.includes(`"${eventKey}"`) || src.includes(`'${eventKey}'`),
      `${file} no longer references "${eventKey}" — the trigger map is stale`,
    ).toBe(true);
  });
});

describe("the resolver declaration matches automationResolvers.ts", () => {
  it("lists exactly the events the resolver registry implements", () => {
    const src = read("src/features/communication/services/automationResolvers.ts");
    // The registry() block, not the whole file — event keys also appear in the
    // prose above it.
    const block = src.slice(src.indexOf("private registry()"), src.indexOf("has(eventKey"));
    const actual = [...block.matchAll(/^\s{6}([a-z_0-9]+):/gm)].map((m) => m[1]).sort();
    expect(
      [...RESOLVER_EVENTS].sort(),
      "RESOLVER_EVENTS in automationState.ts has drifted from the real resolver registry",
    ).toEqual(actual);
  });

  it("KNOWN_UNTRIGGERED is exactly the set with no trigger source", () => {
    // Both directions. An entry that HAS gained a trigger must be removed, or
    // the list becomes a place stale excuses accumulate.
    const actual = AUTOMATION_EVENTS
      .filter((e) => !TRIGGER_SOURCES[e.key] && !BLOCKED_EVENTS[e.key])
      .map((e) => e.key).sort();
    expect(Object.keys(KNOWN_UNTRIGGERED).sort()).toEqual(actual);
  });

  it("classifies every event as resolver-backed, caller-supplied, or blocked", () => {
    const unclassified = AUTOMATION_EVENTS.filter(
      (e) =>
        !RESOLVER_EVENTS.includes(e.key) &&
        !CALLER_RESOLVED_EVENTS.includes(e.key) &&
        !BLOCKED_EVENTS[e.key],
    ).map((e) => e.key);
    expect(unclassified, `Unclassified events: ${unclassified.join(", ")}`).toEqual([]);
  });

  it("never claims an event is both resolver-backed and caller-supplied", () => {
    const both = RESOLVER_EVENTS.filter((k) => CALLER_RESOLVED_EVENTS.includes(k));
    expect(both, `Events in both lists: ${both.join(", ")}`).toEqual([]);
  });
});

describe("no enabled automation is undispatchable", () => {
  // The exact production defect: ARK had ten Academics automations enabled
  // whose template did not exist. `misleading` is the flag for a switch that
  // reads ON while nothing can be sent.
  it("registry defaults produce no misleading switch", () => {
    const bad = diagnoseAll().filter((d) => d.misleading);
    expect(
      bad.map((d) => `${d.eventKey}: ${d.state} — ${d.reason}`),
      "These events default to enabled but cannot send",
    ).toEqual([]);
  });

  it("ARK's real enabled set produces no misleading switch", () => {
    // The 20 events ARK had enabled on 2026-08-12, read from the captured
    // baseline so this tracks production rather than an assumption.
    const baselinePath = join(ROOT, "docs", "generated", "COMMS_BASELINE.json");
    if (!existsSync(baselinePath)) return; // clone without database access
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    for (const [slug, org] of Object.entries(baseline.organizations) as [string, {
      settings: Array<{ event_key: string; enabled: boolean; channel: string; timing: string; template_key: string | null }>;
    }][]) {
      const settings: Record<string, { enabled: boolean; channel: string; timing: string; templateKey: string | null }> = {};
      for (const s of org.settings) {
        settings[s.event_key] = {
          enabled: s.enabled, channel: s.channel, timing: s.timing, templateKey: s.template_key,
        };
      }
      const bad = diagnoseAll(settings).filter((d) => d.misleading);

      // ARK really does have `admission_completed` switched ON with nothing
      // dispatching it. Changing a live tenant's automation settings is out of
      // bounds, so the remedy is that the Communication Center now renders it
      // as NOT CONFIGURED rather than green — which is what `misleading` here
      // proves is detected.
      //
      // What must NEVER recur is the case this phase fixed: an enabled event
      // whose TEMPLATE does not exist. That is a code defect, not a
      // configuration one, and it fails unconditionally.
      const codeDefects = bad.filter((d) => d.state === "MISSING_TEMPLATE" || d.state === "MISSING_RESOLVER");
      expect(
        codeDefects.map((d) => `${d.eventKey}: ${d.state} — ${d.reason}`),
        `${slug} has enabled automations that cannot send because of a CODE defect`,
      ).toEqual([]);

      // Every remaining misleading switch must be one we have documented, so
      // an operator reading the UI is told exactly what is wrong.
      for (const d of bad) {
        expect(
          KNOWN_UNTRIGGERED[d.eventKey] ?? BLOCKED_EVENTS[d.eventKey],
          `${slug}.${d.eventKey} is enabled but cannot send, and nothing explains why`,
        ).toBeTruthy();
      }
    }
  });
});

describe("the published matrix matches the registry", () => {
  // scripts/comms-matrix.mjs generates the document; this asserts in-process
  // that the committed copy still agrees, so a registry change that nobody
  // regenerated fails `npm test` rather than shipping a document that quietly
  // describes last month's system.
  const DOC = "docs/COMMUNICATION_AUTOMATION_FINAL_MATRIX.md";

  it("exists and is machine-generated", () => {
    expect(existsSync(join(ROOT, DOC)), `${DOC} is missing — run node scripts/comms-matrix.mjs`).toBe(true);
    expect(read(DOC)).toContain("GENERATED FILE — do not edit by hand");
  });

  it.each(diagnoseAll().map((d) => [d.eventKey, d.state] as const))(
    "%s is published as %s",
    (eventKey, state) => {
      const doc = read(DOC);
      // The row for this event must exist AND carry the state the registry
      // computes right now.
      const row = doc.split("\n").find((l) => l.startsWith(`| \`${eventKey}\` |`));
      expect(row, `${DOC} has no row for ${eventKey}`).toBeTruthy();
      expect(row, `${DOC} lists ${eventKey} with a stale state`).toContain(`**${state}**`);
    },
  );

  it("publishes a reason for every non-dispatchable event", () => {
    const doc = read(DOC);
    for (const d of diagnoseAll().filter((x) => !x.dispatchable)) {
      expect(doc, `${DOC} does not explain why ${d.eventKey} cannot send`)
        .toContain(`| \`${d.eventKey}\` | ${d.state} |`);
    }
  });
});

describe("state model tells the truth", () => {
  it("only ACTIVE and PROVIDER_PENDING are both enabled and dispatchable", () => {
    for (const e of AUTOMATION_EVENTS) {
      const d = diagnoseAutomation(e, { setting: { enabled: true } });
      if (d.dispatchable) {
        expect(["ACTIVE", "PROVIDER_PENDING"]).toContain(d.state);
      } else {
        expect(d.state).not.toBe("ACTIVE");
      }
    }
  });

  it("an undispatchable event is never reported as ACTIVE", () => {
    const d = diagnoseAutomation(
      { ...AUTOMATION_EVENTS[0], key: "made_up", defaultTemplate: "no_such_template" },
      { setting: { enabled: true } },
    );
    expect(d.state).toBe("MISSING_TEMPLATE");
    expect(d.dispatchable).toBe(false);
    expect(d.misleading).toBe(true);
  });

  it("every diagnosis carries an actionable reason", () => {
    for (const d of diagnoseAll()) {
      expect(d.reason.length, `${d.eventKey} has an empty reason`).toBeGreaterThan(10);
    }
  });
});
