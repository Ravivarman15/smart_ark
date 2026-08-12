import { describe, it, expect } from "vitest";
import { BUILTIN_TEMPLATES } from "@/features/communication/utils/whatsappTemplates";
import { AUTOMATION_EVENTS } from "@/features/communication/constants/automationEvents";
import { LEAD_TEMPLATES } from "@/features/leads/utils/leadWhatsappTemplates";

// ──────────────────────────────────────────────────────────────────────────────
// TEMPLATE EXPORT BRIDGE
//
// The comms-scheduler edge function runs in Deno and cannot import from src/.
// It still needs the canonical template bodies, because a message_queue row
// without a rendered `__body` is permanently failed by send-aisensy as
// "empty body" — which is exactly how the old scheduler managed to enqueue
// nothing for a year without anyone noticing.
//
// Rather than copy the bodies into the Deno file (drift, guaranteed), this
// prints them and scripts/sync-comms-templates.mjs writes
// supabase/functions/_shared/commsTemplates.json. commsTemplateMirror.test.ts
// then fails the build if that file stops matching this source.
// ──────────────────────────────────────────────────────────────────────────────

export interface ExportedTemplates {
  templates: Record<string, { key: string; title: string; body: string; variables: string[] }>;
  eventTemplateKeys: Record<string, string>;
}

export function exportTemplates(): ExportedTemplates {
  const templates: ExportedTemplates["templates"] = {};
  for (const t of BUILTIN_TEMPLATES) {
    templates[t.key] = { key: t.key, title: t.title, body: t.body, variables: t.variables };
  }
  // The two demo events default to Lead CRM templates, which live in their own
  // registry. They are READ here and never modified — Lead CRM is off limits —
  // but without them the scheduler resolves demo_reminder to "no template",
  // which is the state it was already silently in.
  for (const t of Object.values(LEAD_TEMPLATES)) {
    if (!templates[t.key]) {
      templates[t.key] = { key: t.key, title: t.key, body: t.body, variables: t.variables };
    }
  }
  const eventTemplateKeys: Record<string, string> = {};
  for (const e of AUTOMATION_EVENTS) eventTemplateKeys[e.key] = e.defaultTemplate;
  return { templates, eventTemplateKeys };
}

describe("comms template export bridge", () => {
  it("emits every builtin template and every event mapping", () => {
    const out = exportTemplates();
    expect(Object.keys(out.templates).length).toBeGreaterThanOrEqual(BUILTIN_TEMPLATES.length);
    expect(Object.keys(out.eventTemplateKeys).length).toBe(AUTOMATION_EVENTS.length);
    // Only the sync script wants the payload on stdout. Printing it on every
    // suite run buries the actual test output under ~40KB of JSON.
    if (process.env.EMIT_TEMPLATE_EXPORT === "1") {
      console.log(`<<TEMPLATES>>${JSON.stringify(out)}<</TEMPLATES>>`);
    }
  });
});
