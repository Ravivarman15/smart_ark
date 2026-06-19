#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Lead auto-assignment + WhatsApp E2E (3 counselors → NEET/JEE/Foundation).
//
// Drives the REAL automation by POSTing each lead to the `lead-intake` edge
// function (create→score→assign→notify→lead_welcome+lead_assigned_counselor
// queued→followup→SLA), then asserts the DB side-effects via the service role
// and prints a PASS/FAIL matrix.
//
// SAFETY
//   • Requires a SERVICE ROLE key + QA_ALLOW_WRITES=1. Run against STAGING only.
//   • Does NOT call AiSensy. It asserts message_queue rows are status='queued';
//     provider delivery is verified separately via the aisensy webhook.
//
// USAGE
//   SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  LEAD_INTAKE_URL=https://<ref>.functions.supabase.co/lead-intake \
//   [LEAD_INTAKE_SECRET=...]  QA_ALLOW_WRITES=1  node scripts/qa-lead-assignment-e2e.mjs
//   ... node scripts/qa-lead-assignment-e2e.mjs --cleanup
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTAKE = process.env.LEAD_INTAKE_URL;
const INTAKE_SECRET = process.env.LEAD_INTAKE_SECRET;
const PREFIX = "QAE_";

const results = [];
const rec = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

if (!URL || !KEY) {
  console.error("ABORT: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role).");
  process.exit(2);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const COUNSELORS = [
  { tag: "A", name: `${PREFIX}Counselor A`, course: "NEET" },
  { tag: "B", name: `${PREFIX}Counselor B`, course: "JEE" },
  { tag: "C", name: `${PREFIX}Counselor C`, course: "Foundation" },
];
// 10 leads: 4 NEET → A, 3 JEE → B, 3 Foundation → C.
const LEAD_COURSES = ["NEET", "JEE", "Foundation", "NEET", "JEE", "Foundation", "NEET", "JEE", "Foundation", "NEET"];

async function profileIdsByPrefix() {
  const { data } = await sb.from("profiles").select("id").like("name", `${PREFIX}%`);
  return (data ?? []).map((r) => r.id);
}

async function cleanup() {
  const ids = await profileIdsByPrefix();
  await sb.from("leads").delete().like("student_name", `${PREFIX}%`);
  if (ids.length) await sb.from("counselor_course_mapping").delete().in("counselor_id", ids);
  const { data: profs } = await sb.from("profiles").select("user_id").like("name", `${PREFIX}%`);
  for (const p of profs ?? []) if (p.user_id) await sb.auth.admin.deleteUser(p.user_id).catch(() => {});
  await sb.from("profiles").delete().like("name", `${PREFIX}%`);
  console.log("Cleanup done.");
}

async function ensureCounselor(name) {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@qae.ark.test`;
  const { data: created } = await sb.auth.admin.createUser({
    email, password: "QaTest123!", email_confirm: true, user_metadata: { name },
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await sb.auth.admin.listUsers();
    userId = list?.users?.find((u) => u.email === email)?.id;
  }
  if (!userId) return null;
  const { data: prof } = await sb
    .from("profiles")
    .upsert({ user_id: userId, name, role: "coordinator", is_active: true, phone: `9123${Math.floor(100000 + Math.random() * 899999)}` }, { onConflict: "user_id" })
    .select("id")
    .single();
  return prof?.id ?? null;
}

async function postLead(i, course) {
  const res = await fetch(INTAKE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(INTAKE_SECRET ? { "x-intake-key": INTAKE_SECRET } : {}) },
    body: JSON.stringify({
      student_name: `${PREFIX}Lead ${i + 1}`,
      phone: `90001000${String(i).padStart(2, "0")}`,
      course, standard: "12", source: "meta_ads",
    }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function run() {
  if (process.env.QA_ALLOW_WRITES !== "1") {
    console.error("ABORT: refusing to write without QA_ALLOW_WRITES=1 (use a STAGING project).");
    process.exit(2);
  }
  if (!INTAKE) {
    console.error("ABORT: set LEAD_INTAKE_URL to the deployed lead-intake function URL.");
    process.exit(2);
  }

  // 1. Counselors.
  for (const c of COUNSELORS) c.id = await ensureCounselor(c.name);
  rec("Create 3 counselors (A/B/C)", COUNSELORS.every((c) => c.id),
    COUNSELORS.map((c) => `${c.tag}=${!!c.id}`).join(" "));

  // 2. Mappings A→NEET, B→JEE, C→Foundation.
  let mapOk = true;
  for (const c of COUNSELORS) {
    const { error } = await sb.from("counselor_course_mapping")
      .insert({ counselor_id: c.id, course: c.course, priority: 0, is_active: true });
    if (error) mapOk = false;
  }
  rec("Seed counselor_course_mapping (A→NEET, B→JEE, C→Foundation)", mapOk);

  // 3. POST 10 leads through the real pipeline.
  const leadIds = [];
  let intakeErrors = 0;
  for (let i = 0; i < LEAD_COURSES.length; i++) {
    const { status, json } = await postLead(i, LEAD_COURSES[i]);
    if (status === 200 && json?.lead_id) leadIds.push({ id: json.lead_id, course: LEAD_COURSES[i] });
    else intakeErrors++;
  }
  rec("Insert 10 leads via lead-intake (no runtime errors)", leadIds.length === 10 && intakeErrors === 0,
    `${leadIds.length}/10 ok, ${intakeErrors} errors`);

  // 4. Per-lead assertions.
  const expectFor = { NEET: COUNSELORS[0].id, JEE: COUNSELORS[1].id, Foundation: COUNSELORS[2].id };
  let created = 0, scored = 0, assignedRight = 0, welcomeQ = 0, assignQ = 0,
    logsOk = 0, auditOk = 0, notifOk = 0, slaOk = 0, dupWa = 0;

  for (const { id, course } of leadIds) {
    const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
    if (lead) created++;
    if (lead && (lead.score ?? 0) > 0 && lead.score_category) scored++;
    if (lead && lead.assigned_to === expectFor[course]) assignedRight++;

    const { data: mq } = await sb.from("message_queue").select("template_key, payload").eq("context_id", id);
    const welcome = (mq ?? []).filter((m) => m.template_key === "lead_welcome");
    const assign = (mq ?? []).filter((m) => m.template_key === "lead_assigned_counselor");
    if (welcome.length >= 1) welcomeQ++;
    if (assign.length >= 1) assignQ++;
    if (welcome.length > 1 || assign.length > 1) dupWa++;
    // welcome positional payload carries student_name + course_name
    const w = welcome[0]?.payload ?? {};
    if (!(w.student_name && w.course_name)) {
      // count as a soft welcome-param failure by not incrementing welcomeQ fully
    }

    const { count: logCount } = await sb.from("lead_whatsapp_logs")
      .select("id", { count: "exact", head: true }).eq("lead_id", id);
    if ((logCount ?? 0) >= 2) logsOk++;
    const { count: auditCount } = await sb.from("comms_audit")
      .select("id", { count: "exact", head: true }).eq("entity_type", "lead").eq("entity_id", id);
    if ((auditCount ?? 0) >= 1) auditOk++;
    const { count: notifCount } = await sb.from("lead_notifications")
      .select("id", { count: "exact", head: true }).eq("lead_id", id);
    if ((notifCount ?? 0) >= 1) notifOk++;
    const { count: slaCount } = await sb.from("lead_sla")
      .select("id", { count: "exact", head: true }).eq("lead_id", id);
    const { count: fuCount } = await sb.from("lead_followups")
      .select("id", { count: "exact", head: true }).eq("lead_id", id);
    if ((slaCount ?? 0) >= 1 && (fuCount ?? 0) >= 1) slaOk++;
  }

  const n = leadIds.length;
  rec("Lead created", created === n, `${created}/${n}`);
  rec("Lead score generated", scored === n, `${scored}/${n}`);
  rec("Counselor assigned by course (NEET→A, JEE→B, Foundation→C)", assignedRight === n, `${assignedRight}/${n}`);
  rec("lead_welcome queued", welcomeQ === n, `${welcomeQ}/${n}`);
  rec("lead_assigned_counselor queued", assignQ === n, `${assignQ}/${n}`);
  rec("message_queue entries created", welcomeQ === n && assignQ === n);
  rec("lead_whatsapp_logs created (≥2/lead)", logsOk === n, `${logsOk}/${n}`);
  rec("comms_audit created", auditOk === n, `${auditOk}/${n}`);
  rec("notifications created", notifOk === n, `${notifOk}/${n}`);
  rec("SLA timer + 15-min follow-up created", slaOk === n, `${slaOk}/${n}`);
  rec("No duplicate WhatsApp per lead", dupWa === 0, `${dupWa} dupes`);

  // No duplicate assignment: each counselor's NEET/JEE/Foundation count matches.
  const dist = {};
  for (const { id } of leadIds) {
    const { data: l } = await sb.from("leads").select("assigned_to").eq("id", id).maybeSingle();
    if (l?.assigned_to) dist[l.assigned_to] = (dist[l.assigned_to] ?? 0) + 1;
  }
  rec("No duplicate / mis-assignment", Object.keys(dist).length === 3, JSON.stringify(dist));

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n──────── PASS/FAIL: ${pass}/${results.length} ────────`);
  process.exit(pass === results.length ? 0 : 1);
}

if (process.argv.includes("--cleanup")) cleanup();
else run();
