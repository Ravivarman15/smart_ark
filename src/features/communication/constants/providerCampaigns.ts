// ──────────────────────────────────────────────────────────────────────────────
// PROVIDER CAMPAIGN LEDGER — does this campaign exist at AiSensy, and how do we
// know?
//
// ┌── THE ASSUMPTION THIS FILE DELETES ────────────────────────────────────┐
// │ providerTemplates.ts models a template's journey through Meta review:  │
// │ READY_FOR_SUBMISSION → SUBMITTED → APPROVED → ACTIVE. Until a template │
// │ reaches ACTIVE, resolveCampaign() returns `legacyCampaign` — and the   │
// │ whole design rests on one unstated assumption: that the legacy         │
// │ campaign WORKS.                                                        │
// │                                                                        │
// │ For `staff_credentials` it does not, and never did. Every staff        │
// │ account created since the flow was wired produced:                     │
// │                                                                        │
// │     HTTP 400: Campaign does not exist.                                 │
// │                                                                        │
// │ Six times, across BOTH tenants, most recently 2026-08-12. The template │
// │ registry called that state "PROVIDER_PENDING — sends today via the     │
// │ legacy provider campaign", which is a reassuring sentence about a      │
// │ campaign that does not exist. The lifecycle tracked approval of the    │
// │ NEW template and never once asked whether the fallback was real.       │
// └────────────────────────────────────────────────────────────────────────┘
//
// So existence is recorded here as EVIDENCE, not as intent. Every entry cites
// what proves it — a successful send, or the provider's own refusal — with a
// date and a count. An entry nobody can back says UNVERIFIED, which is a
// different claim from "works" and is allowed to send precisely so that the
// first successful attempt is what upgrades it.
//
// Evidence collected 2026-08-14 from message_queue + lead_whatsapp_logs across
// both live tenants (ark, abc-academi).
// ──────────────────────────────────────────────────────────────────────────────

/**
 * What we know about a campaign name at the provider.
 *
 * Deliberately NOT a boolean, for the same reason ProviderTemplateStatus isn't:
 * "we have never tried" and "we tried and it does not exist" are different
 * facts with opposite consequences, and collapsing them is what produced a
 * green automation pointing at a dead campaign.
 */
export type CampaignExistence =
  /** A real message was delivered through this campaign. */
  | "VERIFIED"
  /** AiSensy answered "Campaign does not exist." Posting again cannot work. */
  | "MISSING"
  /** Meta rejected the template. The NAME is burned — it cannot be resubmitted. */
  | "REJECTED"
  /** Never posted, or never posted successfully. May well work. */
  | "UNVERIFIED";

export interface CampaignRecord {
  /** The exact `campaignName` posted to AiSensy. */
  name: string;
  existence: CampaignExistence;
  /**
   * What proves it. A date and a source, never an opinion — this field is read
   * by an operator deciding whether to trust the state above it.
   */
  evidence: string;
  /**
   * Positional parameter count the Meta template declares.
   *
   * Checked against the body and against both `buildTemplateParams` mirrors by
   * providerCampaigns.test.ts. `attendance_present` failed live with
   * "Template params does not match the campaign" — an arity mismatch is a
   * silent 400, so the count is data the build can verify rather than a comment.
   */
  params: number;
  /**
   * True when the approved Meta body names one specific institution, so every
   * other tenant's recipients are told the wrong organization's name.
   *
   * Our local template body is irrelevant here: send-aisensy posts
   * { campaignName, templateParams } and Meta renders ITS OWN approved body.
   * A tenant-branded campaign cannot be fixed by editing anything in this repo.
   */
  tenantBranded?: boolean;
}

const rec = (
  name: string,
  existence: CampaignExistence,
  params: number,
  evidence: string,
  tenantBranded = false,
): CampaignRecord => ({ name, existence, params, evidence, tenantBranded });

/**
 * Every campaign name the application can post, keyed by name.
 *
 * The build gate asserts this covers the postable set exactly — a new template
 * whose campaign nobody created in AiSensy fails CI instead of failing in
 * production at the moment a school first uses the feature.
 */
export const CAMPAIGN_LEDGER: Record<string, CampaignRecord> = Object.fromEntries(
  [
    // ── Attendance ──────────────────────────────────────────────────────────
    rec("ark_attendance_absent", "VERIFIED", 5,
      "13 delivered via message_queue, most recent 2026-08-13.", true),
    rec("smartark_attendance_absent", "VERIFIED", 6,
      "Delivered for abc-academi 2026-08-13 — the organization-neutral template " +
      "proven on a tenant that is not ARK, which is the whole point of it."),
    rec("ark_attendance_corrected", "UNVERIFIED", 3,
      "No correction has ever been sent, so the campaign has never been exercised.", true),
    rec("smartark_attendance_corrected", "UNVERIFIED", 4,
      "Approved alongside smartark_attendance_absent but not yet exercised by a real correction."),
    // NOT "MISSING": AiSensy answered "Template params does not match the
    // campaign" on 2026-07-14, which it can only do for a campaign that
    // resolves. The campaign is real; our arity was wrong. It has no spec in
    // either templateParams mirror, so buildTemplateParams fell back to posting
    // the whole rendered body as a single {{1}} — the exact degradation the
    // arity gate now forbids for anything in the send path.
    //
    // Left UNVERIFIED with an unknown parameter count rather than guessed at:
    // nothing dispatches attendance_present (see KNOWN_UNTRIGGERED), so writing
    // a spec would mean inventing an arity for a template nobody can inspect.
    rec("attendance_present", "UNVERIFIED", 1,
      "HTTP 400 \"Template params does not match the campaign\" on 2026-07-14 — the " +
      "campaign exists but its true parameter count is unknown to this repository, " +
      "and no automation dispatches it."),

    // ── Fees ────────────────────────────────────────────────────────────────
    rec("fee_receipt", "VERIFIED", 6,
      "237 delivered, most recent 2026-08-13. The highest-volume live campaign.", true),
    rec("smartark_fee_receipt", "VERIFIED", 7,
      "11 delivered across BOTH tenants, most recent 2026-08-13."),
    rec("fee_due", "UNVERIFIED", 1,
      "25 rows failed before reaching the provider — every one \"no destination phone\", " +
      "so the campaign itself has never been tested."),

    // ── Credentials ─────────────────────────────────────────────────────────
    rec("staff_credentials", "MISSING", 5,
      "HTTP 400 \"Campaign does not exist.\" — 6 occurrences across both tenants, " +
      "2026-07-31 through 2026-08-12. Not one staff credential has EVER been " +
      "delivered over WhatsApp. The Brevo welcome email is the only channel that " +
      "has ever worked for this flow."),
    rec("parent_credentials", "UNVERIFIED", 5,
      "Never posted. The one row ever enqueued (2026-08-13) is still sitting in " +
      "message_queue because nothing drains the queue — see the send-aisensy cron."),
    rec("smartark_staff_credentials1", "REJECTED", 6,
      "Rejected by Meta 2026-08-13. Carries a plaintext password, which Meta routes " +
      "to the Authentication category, where free-form Role/Email/Portal fields are " +
      "not permitted. The name is burned — resubmission is impossible."),
    rec("smartark_student_credentials1", "REJECTED", 6,
      "Rejected by Meta 2026-08-13 alongside the staff template, same cause."),

    // ── Lead CRM / Enquiry ──────────────────────────────────────────────────
    // The four VERIFIED ones work and are the reason the funnel appears healthy.
    // They are all tenant-branded: their positional params carry no org_name, so
    // Meta renders ARK's sign-off for every tenant that uses them.
    rec("lead_welcome", "VERIFIED", 2,
      "17 delivered, most recent 2026-07-29. ARK only — abc-academi has never sent a lead message.", true),
    rec("lead_assigned_counselor", "VERIFIED", 4,
      "14 delivered, most recent 2026-07-17.", true),
    rec("lead_demo_scheduled_v2", "VERIFIED", 5,
      "3 delivered 2026-06-30, plus 1 rejected for an invalid recipient number — " +
      "which is itself proof the campaign resolves.", true),
    rec("demo_scheduled", "VERIFIED", 5,
      "1 delivered 2026-06-22. Superseded by lead_demo_scheduled_v2 and no longer " +
      "the default template for the demo_scheduled event.", true),
    rec("lead_followup_reminder", "UNVERIFIED", 3,
      "Never posted — no follow-up reminder has fired.", true),
    rec("sla_breach_alert", "UNVERIFIED", 3,
      "Never posted. sla-checker has run per-tenant since 2026-08-13 but has not " +
      "yet found a breach with a reachable counselor.", true),
    rec("lead_admission_completed_v2", "UNVERIFIED", 3,
      "Never posted — the admission_completed event has no dispatch site, so this " +
      "template has never fired for any tenant.", true),
    rec("lead_demo_reminder_v2", "UNVERIFIED", 4,
      "Never posted — demo_reminder is scheduled through comms-scheduler, whose cron " +
      "is not enabled.", true),
    rec("inquiry_followup", "MISSING", 1,
      "HTTP 400 \"Campaign does not exist.\" on 2026-06-26. Still listed as a wired " +
      "module in the deployment registry."),
    // ── Internal staff nudges with no Meta template ─────────────────────────
    // Both were found by the declaration gate, not by reading: they are lead
    // templates, so `providerName` defaults to the key and the app will happily
    // post to a campaign of that name. Neither has a positional spec, so each
    // would post its whole rendered body as a single {{1}}.
    //
    // Recorded at 1 parameter because that is genuinely what the code sends —
    // not because a one-parameter Meta template is known to exist. If either is
    // ever created at AiSensy it must be a single-parameter template, or the
    // send fails the way attendance_present did.
    rec("lead_unassigned_alert", "UNVERIFIED", 1,
      "Dispatched live by leadIntake.service.ts when auto-assignment finds no " +
      "counselor, but has never produced a message_queue row — so it has never " +
      "reached the provider and its campaign has never been exercised."),
    rec("lead_low_performance", "UNVERIFIED", 1,
      "Defined in LEAD_TEMPLATES but dispatched from nowhere in src/ or " +
      "supabase/functions/. It is a template with no trigger, kept only because " +
      "removing it is a separate decision from this one."),

    // ── The organization-neutral lead family (Phase F) ───────────────────────
    // Not yet created in AiSensy. UNVERIFIED rather than MISSING: nothing has
    // been posted to them, and they are gated behind their READY_FOR_SUBMISSION
    // status in providerTemplates.ts, so nothing will be until a human submits
    // them and flips the status.
    rec("smartark_lead_enquiry_received", "UNVERIFIED", 3, "Awaiting creation + Meta approval."),
    rec("smartark_lead_assigned", "UNVERIFIED", 5, "Awaiting creation + Meta approval."),
    rec("smartark_lead_followup_due", "UNVERIFIED", 4, "Awaiting creation + Meta approval."),
    rec("smartark_lead_sla_breach", "UNVERIFIED", 4, "Awaiting creation + Meta approval."),
    rec("smartark_lead_demo_scheduled", "UNVERIFIED", 6, "Awaiting creation + Meta approval."),
    rec("smartark_lead_demo_reminder", "UNVERIFIED", 5, "Awaiting creation + Meta approval."),
    rec("smartark_lead_admission_confirmed", "UNVERIFIED", 4, "Awaiting creation + Meta approval."),

    // ── Public website forms ────────────────────────────────────────────────
    rec("smartark_platform_lead_alert", "UNVERIFIED", 4,
      "Declared by supabase/functions/_shared/publicForms.ts; not yet approved."),
    rec("smartark_public_form_ack", "UNVERIFIED", 3,
      "Declared by supabase/functions/_shared/publicForms.ts; not yet approved."),
  ].map((r) => [r.name, r]),
);

/** Campaigns that can never deliver, whatever the automation switch says. */
export const DEAD_EXISTENCE: readonly CampaignExistence[] = ["MISSING", "REJECTED"];

export interface CampaignVerdict {
  /** False only when posting is known to be futile. */
  sendable: boolean;
  existence: CampaignExistence;
  /** Present exactly when `sendable` is false. One sentence, operator-facing. */
  blockedReason?: string;
  tenantBranded: boolean;
}

/**
 * Can we post to this campaign?
 *
 * UNVERIFIED is SENDABLE, deliberately. A campaign nobody has exercised is not
 * a campaign known to be broken, and refusing it would mean no new template
 * could ever earn its first piece of evidence. Only the provider's own refusal
 * — "Campaign does not exist", or a Meta rejection — closes the door.
 *
 * An unregistered name is also sendable: this ledger governs what we KNOW, and
 * a gap in it must not silence a working flow. The build gate is what keeps the
 * gaps from appearing.
 */
export function campaignVerdict(name: string | null | undefined): CampaignVerdict {
  const r = name ? CAMPAIGN_LEDGER[name] : undefined;
  if (!r) {
    return { sendable: true, existence: "UNVERIFIED", tenantBranded: false };
  }
  if (r.existence === "MISSING") {
    return {
      sendable: false,
      existence: r.existence,
      tenantBranded: !!r.tenantBranded,
      blockedReason:
        `The WhatsApp campaign "${r.name}" does not exist at the provider. ` +
        `${r.evidence} Create and approve it in AiSensy, or the message cannot be sent ` +
        `on any channel but email.`,
    };
  }
  if (r.existence === "REJECTED") {
    return {
      sendable: false,
      existence: r.existence,
      tenantBranded: !!r.tenantBranded,
      blockedReason:
        `The WhatsApp template "${r.name}" was rejected by Meta and its name cannot ` +
        `be reused. ${r.evidence}`,
    };
  }
  return { sendable: true, existence: r.existence, tenantBranded: !!r.tenantBranded };
}

/** Campaigns proven to send one tenant's institution name to every tenant. */
export function brandedCampaigns(): CampaignRecord[] {
  return Object.values(CAMPAIGN_LEDGER).filter((r) => r.tenantBranded);
}

/** Campaigns the provider has refused. The list an operator has to act on. */
export function deadCampaigns(): CampaignRecord[] {
  return Object.values(CAMPAIGN_LEDGER).filter((r) =>
    DEAD_EXISTENCE.includes(r.existence),
  );
}
