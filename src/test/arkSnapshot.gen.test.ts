import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveEntitlements } from "@/features/platform/modules/entitlements";
import type { EntitlementLayers } from "@/features/platform/modules/entitlements";
import { MODULE_IDS, SUBMODULE_IDS } from "@/features/platform/modules/moduleRegistry";

// ──────────────────────────────────────────────────────────────────────────────
// ARK SNAPSHOT BRIDGE
//
// scripts/ark-module-snapshot.mjs needs ARK's live entitlement layers resolved
// by the REAL resolver. Reimplementing the six-layer precedence inside that
// script would be exactly the drift the single-resolver architecture exists to
// prevent — so the script shells out to vitest and reads the block printed
// here.
//
// Skips when no layers file has been captured, so a clone with no database
// access still runs a green suite. When the file IS present it asserts the
// resolver covered every catalog module, which is the property that would
// break if a module were added without metadata.
// ──────────────────────────────────────────────────────────────────────────────

// Defaults to the ARK capture; scripts/entitlement-probe.mjs points it at any
// other organization's captured layers so non-ARK tests resolve through this
// same bridge rather than growing a second implementation.
const LAYERS =
  process.env.ENTITLEMENT_LAYERS_FILE ??
  join(__dirname, "..", "..", "docs", "generated", "ARK_ENTITLEMENT_LAYERS.json");

describe.skipIf(!existsSync(LAYERS))("ARK module snapshot bridge", () => {
  it("resolves the captured production layers through the shipped resolver", () => {
    const layers = JSON.parse(readFileSync(LAYERS, "utf8")) as EntitlementLayers;
    // An evaluation clock, so a temporary override can be shown to lapse without
    // backdating a row in a live database to prove it.
    const now = process.env.ENTITLEMENT_NOW ? new Date(process.env.ENTITLEMENT_NOW) : undefined;
    const resolved = resolveEntitlements(layers, now);

    // Every catalog module AND submodule must resolve to something. A key
    // present in the catalog but missing here would be invisible to the
    // sidebar gate — and, for a submodule, would mean a Super Admin could
    // revoke it, see the write succeed, and have nothing change.
    //
    // Widened from modules alone when submodule entitlements shipped: the
    // resolver now answers for all 19 modules plus their 204 submodules.
    expect(Object.keys(resolved).sort()).toEqual(
      [...MODULE_IDS, ...SUBMODULE_IDS].sort(),
    );

    const out: Record<string, { enabled: boolean; source: string; explain: string }> = {};
    for (const [id, v] of Object.entries(resolved)) {
      out[id] = { enabled: v.enabled, source: v.source, explain: v.explain };
    }
    console.log(`<<SNAPSHOT>>${JSON.stringify(out)}<</SNAPSHOT>>`);
  });
});
