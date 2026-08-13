// ──────────────────────────────────────────────────────────────────────────────
// EXPORT BRIDGE — registry + diagnoses, for scripts/comms-matrix.mjs
//
// The registry and the state model are TypeScript with path aliases, so a plain
// node script cannot import them. Rather than duplicating the data into a
// second place — which is precisely how the old hand-written matrix came to
// claim four dead automations were working — the generator reads them THROUGH
// this bridge, so the document is derived from the same source the UI uses.
//
// Silent unless EMIT_MATRIX_EXPORT=1: the payload is tens of kilobytes and
// would otherwise be printed on every suite run.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { AUTOMATION_EVENTS } from "@/features/communication/constants/automationEvents";
import { diagnoseAll } from "@/features/communication/utils/automationState";

describe("communication matrix export bridge", () => {
  it("emits the registry and its diagnoses", () => {
    const events = AUTOMATION_EVENTS.map((e) => ({
      key: e.key,
      label: e.label,
      category: e.category,
      description: e.description,
      defaultTemplate: e.defaultTemplate,
      defaultChannel: e.defaultChannel,
      defaultTiming: e.defaultTiming,
      kind: e.kind,
      defaultEnabled: e.defaultEnabled ?? false,
    }));
    const diagnoses = diagnoseAll();

    expect(events.length).toBeGreaterThan(0);
    expect(diagnoses.length).toBe(events.length);

    if (process.env.EMIT_MATRIX_EXPORT === "1") {
      console.log("<<MATRIX>>" + JSON.stringify({ events, diagnoses }) + "<</MATRIX>>");
    }
  });
});
