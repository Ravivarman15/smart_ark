// ──────────────────────────────────────────────────────────────────────────────
// lead-intake — public webhook for Meta Ads / landing-page leads.
//
// Runs the FULL automated intake pipeline server-side (service role, bypasses
// RLS) so automation fires without a browser:
//   create → duplicate check → score → auto-assign → activity → notify →
//   welcome WhatsApp (queued) → 15-min follow-up → open SLA window.
//
// Auth: optional shared secret. If LEAD_INTAKE_SECRET is set, callers must send
//   it via `x-intake-key` header or `?key=` query param. Meta's GET verification
//   handshake (hub.challenge) is echoed back.
//
// Accepts flexible field names so Meta lead-ad payloads and custom landing forms
// both map cleanly.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intake-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Field extraction (Meta lead-ad + landing form tolerant) ───────────────────
const pick = (o: Record<string, any>, keys: string[]): string | undefined => {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== "") return String(o[k]).trim();
  }
  return undefined;
};

/** Meta lead-ads send field_data: [{name, values:[...]}]. Flatten it. */
const flattenMeta = (body: Record<string, any>): Record<string, any> => {
  const fd = body.field_data ?? body.fields ?? body.entry?.[0]?.changes?.[0]?.value?.field_data;
  if (Array.isArray(fd)) {
    const out: Record<string, any> = { ...body };
    for (const f of fd) {
      if (f?.name) out[f.name] = Array.isArray(f.values) ? f.values[0] : f.value;
    }
    return out;
  }
  return body;
};

// ── Inline scoring (mirrors src/features/leads/utils/leadScore.ts) ────────────
const SOURCE_POINTS: Record<string, number> = {
  meta_ads: 20, landing: 18, referral: 16, walk_in: 14, call: 12, manual: 8,
};
const coursePoints = (c?: string) => {
  if (!c) return 4;
  const l = c.toLowerCase();
  if (l.includes("neet") || l.includes("jee")) return 20;
  if (l.includes("foundation")) return 14;
  if (l.includes("tuition")) return 10;
  return 8;
};
const categoryFor = (s: number) =>
  s >= 80 ? "priority" : s >= 60 ? "hot" : s >= 35 ? "warm" : "cold";

// Queue a WhatsApp + mirror to lead_whatsapp_logs + comms_audit. `vars` carries
// the NAMED positional values (student_name/course_name/counselor_name/…) so the
// send-aisensy drainer's buildTemplateParams can order them for the Meta template.
async function enqueueWa(
  supabase: any,
  opts: {
    leadId: string; template: string; phone: string; recipientName: string;
    recipientKind: string; body: string; vars: Record<string, unknown>;
  },
) {
  const nowIso = new Date().toISOString();
  await supabase.from("message_queue").insert({
    channel: "whatsapp", provider: "aisensy", template: opts.template, template_key: opts.template,
    language: "en", recipient_kind: opts.recipientKind, recipient_name: opts.recipientName,
    recipient_phone: opts.phone,
    payload: { ...opts.vars, __body: opts.body },
    context_type: "lead", context_id: opts.leadId, status: "queued", scheduled_at: nowIso,
  });
  await supabase.from("lead_whatsapp_logs").insert({
    lead_id: opts.leadId, template_key: opts.template, template_name: opts.template,
    student_name: opts.vars["student_name"] ?? null, course_name: opts.vars["course_name"] ?? null,
    recipient_phone: opts.phone, recipient_name: opts.recipientName, recipient_kind: opts.recipientKind,
    message_body: opts.body, status: "queued", queued_at: nowIso,
  });
  await supabase.from("comms_audit").insert({
    entity_type: "lead", entity_id: opts.leadId, action: "queue",
    payload: { template: opts.template, recipient_kind: opts.recipientKind, message_body: opts.body, source: "lead-intake" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const secret = Deno.env.get("LEAD_INTAKE_SECRET");

  // Meta verification handshake.
  if (req.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge");
    if (challenge) return new Response(challenge, { status: 200, headers: corsHeaders });
    return json({ ok: true });
  }

  if (secret) {
    const provided = req.headers.get("x-intake-key") ?? url.searchParams.get("key");
    if (provided !== secret) return json({ error: "Unauthorized" }, 401);
  }

  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, any>;
    const body = flattenMeta(raw);

    const studentName =
      pick(body, ["student_name", "studentName", "full_name", "name", "child_name"]) ?? "";
    const phone = pick(body, ["phone", "phone_number", "mobile", "contact", "whatsapp"]);
    if (!studentName || !phone) {
      return json({ error: "student name and phone are required" }, 422);
    }
    const parentName = pick(body, ["parent_name", "parentName", "guardian", "parent"]);
    const email = pick(body, ["email", "email_address"]);
    const course = pick(body, ["course", "program", "interested_course", "course_interested"]);
    const standard = pick(body, ["standard", "class", "grade", "std"]);
    const campus = pick(body, ["campus", "branch", "center", "centre"]);
    const message = pick(body, ["message", "notes", "comments", "query"]);
    const source = pick(body, ["source", "lead_source"]) ?? "meta_ads";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 0. WHICH TENANT? ────────────────────────────────────────────────────
    // This function runs as SERVICE ROLE, so `current_org_id()` — the default
    // for leads.organization_id — is NULL. That default resolved to the only
    // organization while there was only one; since a second was created it
    // returns NULL and every insert here failed the NOT NULL constraint.
    //
    // The tenant therefore has to be named explicitly. A SLUG, resolved here,
    // never an organization_id from the request body: a Meta Ads webhook is
    // an unauthenticated caller, and one that could pick an organization_id
    // could post leads into any tenant's pipeline.
    const orgSlug = pick(body, ["org_slug", "orgSlug", "organization", "tenant"]);
    if (!orgSlug) {
      return json({ error: "org_slug is required — which institution is this enquiry for?" }, 422);
    }
    const { data: org } = await supabase
      .from("organizations")
      .select("id, display_name, status")
      .ilike("slug", orgSlug)
      .is("deleted_at", null)
      .maybeSingle();
    if (!org) return json({ error: "Unknown organization" }, 404);
    if (org.status === "suspended") {
      return json({ error: "This organization is not accepting enquiries" }, 403);
    }
    const organizationId = org.id as string;
    const orgName = (org.display_name as string) ?? "";

    // 1. Duplicate check — SCOPED TO THIS TENANT.
    //    Unscoped, a service-role query sees every organization's leads, so an
    //    ABC Academi enquiry from a phone number ARK already had would be
    //    flagged `is_duplicate` and linked via `duplicate_of` to a row in
    //    another tenant — a cross-tenant reference written into ABC's data.
    const { data: dup } = await supabase
      .from("leads")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`phone.eq.${phone}${email ? `,email.ilike.${email}` : ""}`)
      .limit(1)
      .maybeSingle();

    // 2. Score.
    const breakdown = {
      source: SOURCE_POINTS[source] ?? 8,
      course: coursePoints(course),
      standard: standard ? 6 : 0,
      engagement: (parentName ? 8 : 0) + 6 + (email ? 4 : 0),
    };
    const score = Math.min(
      100,
      Object.values(breakdown).reduce((a, b) => a + b, 0)
    );
    const category = categoryFor(score);

    // 3. Insert lead.
    const slaDue = new Date(Date.now() + 15 * 60_000).toISOString();
    const { data: lead, error: insErr } = await supabase
      .from("leads")
      .insert({
        // Explicit, resolved from the slug above. The column default
        // (`current_org_id()`) is NULL under service role and would fail the
        // NOT NULL constraint.
        organization_id: organizationId,
        student_name: studentName,
        parent_name: parentName ?? null,
        phone,
        email: email ?? null,
        source,
        course: course ?? null,
        standard: standard ?? null,
        campus: campus ?? null,
        status: "new",
        score,
        score_category: category,
        is_duplicate: !!dup,
        duplicate_of: dup?.id ?? null,
        assignment_state: "unassigned",
        notes: message ?? null,
        metadata: { raw },
        sla_due_at: slaDue,
        last_activity_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insErr || !lead) return json({ error: insErr?.message ?? "insert failed" }, 500);

    await supabase.from("lead_score_history").insert({
      lead_id: lead.id, score, category, factors: breakdown,
    });
    await supabase.from("lead_activities").insert({
      lead_id: lead.id, type: "created", detail: `Lead captured from ${source}`,
    });

    // 4. Auto-assign — course-matching active counselor with fewest open leads.
    //
    //    SCOPED TO THIS TENANT. Unscoped, a service-role query returns every
    //    organization's counselor mappings, so an ABC Academi enquiry could be
    //    auto-assigned to an ARK counselor — who would then be notified on
    //    WhatsApp about a child who is not their student, and the lead would
    //    appear on the wrong institution's dashboard.
    const { data: mappings } = await supabase
      .from("counselor_course_mapping")
      .select("counselor_id, course, priority")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("deleted_at", null);

    let assignedTo: string | null = null;
    const matched = (mappings || []).filter(
      (m: any) => !m.course || (course && m.course.toLowerCase() === course.toLowerCase())
    );
    if (matched.length) {
      const specific = matched.filter((m: any) => m.course);
      const pool = specific.length ? specific : matched;
      const maxP = Math.max(...pool.map((m: any) => m.priority ?? 0));
      const ids = [...new Set(pool.filter((m: any) => (m.priority ?? 0) === maxP).map((m: any) => m.counselor_id))];
      let best: { id: string; n: number } | null = null;
      for (const id of ids as string[]) {
        // Workload is counted within THIS organization only. Counting a
        // counselor's leads across tenants would balance ABC's queue against
        // ARK's volume and starve the new tenant's counselors.
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("assigned_to", id)
          .is("deleted_at", null)
          .neq("status", "closed");
        if (!best || (count ?? 0) < best.n) best = { id, n: count ?? 0 };
      }
      assignedTo = best?.id ?? null;
    }

    let counselorName = "our team";
    let counselorPhone: string | null = null;
    if (assignedTo) {
      await supabase
        .from("leads")
        .update({ assigned_to: assignedTo, assigned_at: new Date().toISOString(), assignment_state: "assigned" })
        .eq("id", lead.id);
      await supabase.from("lead_activities").insert({
        lead_id: lead.id, type: "assigned", detail: "Auto-assigned to counselor", new_value: assignedTo,
      });
      // Staff numbers live in profiles.mobile (the Create/Edit Staff form writes
      // there); `phone` is a legacy column kept for older rows. Prefer mobile.
      // Belt and braces: confirm the chosen counselor really belongs to this
      // organization before writing the assignment. If the mapping table ever
      // gains a stray row, this refuses rather than notifying a stranger.
      const { data: c } = await supabase
        .from("profiles")
        .select("name, mobile, phone")
        .eq("id", assignedTo)
        .eq("organization_id", organizationId)
        .maybeSingle();
      counselorName = c?.name ?? counselorName;
      counselorPhone = c?.mobile ?? c?.phone ?? null;
      await supabase.from("lead_notifications").insert({
        recipient_id: assignedTo, lead_id: lead.id, type: "new_lead",
        title: "New lead assigned", message: `${studentName}${course ? ` — ${course}` : ""} (${phone})`,
      });
      // WhatsApp the counselor — lead_assigned_counselor (positional template).
      if (counselorPhone) {
        await enqueueWa(supabase, {
          leadId: lead.id, template: "lead_assigned_counselor", phone: counselorPhone,
          recipientName: counselorName, recipientKind: "counselor",
          body:
            `Hi ${counselorName}\n\nNew Lead Assigned\n\nStudent:\n${studentName}\n\n` +
            `Course:\n${course ?? "—"}\n\nMobile:\n${phone}\n\nPlease contact within 15 minutes.\n\n${orgName}`,
          vars: {
            counselor_name: counselorName, student_name: studentName,
            course_name: course ?? "—", mobile_number: phone,
          },
        });
      }
    } else {
      // Unassigned → alert management/admin.
      const { data: mgmt } = await supabase
        // Scoped: an unassigned ABC enquiry must alert ABC's management, not
        // every admin on the platform.
        .from("profiles").select("id")
        .eq("organization_id", organizationId)
        .in("role", ["management", "admin"]).eq("is_active", true);
      const ids = (mgmt || []).map((p: any) => p.id);
      if (ids.length)
        await supabase.from("lead_notifications").insert(
          ids.map((rid: string) => ({
            recipient_id: rid, lead_id: lead.id, type: "unassigned",
            title: "Unassigned lead needs a counselor", message: `${studentName}${course ? ` — ${course}` : ""}`,
          }))
        );
      await supabase.from("notifications").insert({
        type: "alert", message: `Unassigned lead: ${studentName}`, reference_id: lead.id,
      });
    }

    // 5. Welcome WhatsApp to the lead (queued → drained by send-aisensy).
    //    Single Meta Utility Template: {{1}} student_name, {{2}} course_name.
    const courseName = course ?? "your course of interest";
    await enqueueWa(supabase, {
      leadId: lead.id, template: "lead_welcome", phone,
      recipientName: parentName ?? studentName, recipientKind: "lead",
      // The institution the enquiry was actually made to — resolved above, not
      // hardcoded. This message goes to a prospective parent on WhatsApp, so a
      // wrong name here reaches a stranger under a number they trust.
      body:
        `Hi ${studentName}\n\nThank you for your interest${orgName ? ` in ${orgName}` : ""}.\n\n` +
        `We have successfully received your enquiry for ${courseName}.`,
      vars: { student_name: studentName, course_name: courseName },
    });

    // 6. 15-minute follow-up timer.
    await supabase.from("lead_followups").insert({
      lead_id: lead.id, assigned_to: assignedTo, level: 0, channel: "call", due_at: slaDue, status: "pending",
    });

    // 7. Open NEW-stage SLA window.
    await supabase.from("lead_sla").insert({ lead_id: lead.id, stage: "new", due_at: slaDue });

    // Nudge the queue drainer (best-effort).
    try {
      await supabase.functions.invoke("send-aisensy", { body: { limit: 20 } });
    } catch (_e) { /* the cron will drain it anyway */ }

    return json({
      success: true,
      lead_id: lead.id,
      score,
      category,
      assigned: !!assignedTo,
      duplicate: !!dup,
    });
  } catch (error: unknown) {
    return json({ error: (error as Error).message }, 500);
  }
});
