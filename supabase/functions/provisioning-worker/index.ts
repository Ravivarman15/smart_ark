// ──────────────────────────────────────────────────────────────────────────────
// PROVISIONING WORKER
//
// Drains the provisioning queue. Invoked three ways, all of which land here:
//   • by public-onboarding right after signup (so the first job starts now,
//     not on the next cron tick — a 60-second wait would be visible)
//   • by cron every minute (retries, and jobs whose worker died)
//   • by a platform admin pressing Retry
//
// ┌── CONCURRENCY ─────────────────────────────────────────────────────────┐
// │ claim_provisioning_job() uses FOR UPDATE SKIP LOCKED, so N workers      │
// │ take N different jobs instead of all blocking on the first. That is    │
// │ what makes "100 organizations concurrently" a configuration question   │
// │ (how many invocations) rather than an architectural one.                │
// │                                                                        │
// │ Each worker takes a LEASE. If it dies mid-job the lease expires and    │
// │ another worker reclaims the job, resuming from the last completed step │
// │ rather than replaying from the start.                                  │
// └────────────────────────────────────────────────────────────────────────┘
//
// Two things happen HERE rather than in SQL, because Postgres cannot make HTTP
// calls: writing storage placeholders, and sending the welcome email.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

/** Edge functions have a hard wall-clock limit; stop well before it. */
const MAX_RUNTIME_MS = 50_000;
const LEASE_SECONDS = 120;
const STORAGE_FOLDERS = [
  "students", "staff", "certificates", "reports", "receipts", "uploads", "communication",
];

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Create the per-organization folder structure.
 *
 * Supabase Storage has no real directories — a folder is a prefix implied by an
 * object's name. So we write a tiny `.keep` object per prefix, which is what
 * makes the structure visible in the dashboard and makes the convention
 * self-documenting for anyone browsing later.
 */
async function createStorageFolders(db: Db, orgId: string): Promise<Record<string, unknown>> {
  const bucket = "student-documents";
  const created: string[] = [];
  const failed: string[] = [];

  for (const folder of STORAGE_FOLDERS) {
    const path = `${orgId}/${folder}/.keep`;
    const { error } = await db.storage
      .from(bucket)
      .upload(path, new Blob([""], { type: "text/plain" }), { upsert: true });
    if (error) failed.push(`${folder}: ${error.message}`);
    else created.push(folder);
  }
  return { bucket, created: created.length, failed };
}

async function sendWelcomeEmail(db: Db, orgId: string): Promise<Record<string, unknown>> {
  const { data: org } = await db
    .from("organizations").select("display_name, slug").eq("id", orgId).maybeSingle();
  if (!org) return { sent: false, reason: "organization not found" };

  // The first staff member of the organization is its admin.
  const { data: admin } = await db
    .from("profiles").select("name, email")
    .eq("organization_id", orgId).order("created_at").limit(1).maybeSingle();

  if (!admin?.email) return { sent: false, reason: "no admin email on file" };

  const { error } = await db.functions.invoke("send-email", {
    body: {
      templateId: "organization-ready",
      to: { email: admin.email, name: admin.name },
      params: {
        organizationName: org.display_name,
        loginUrl: `https://${org.slug}.smartark.ai`,
        adminName: admin.name ?? "there",
        docsUrl: "https://smartark.ai/docs",
      },
    },
  });

  // Best-effort. A failed welcome email is worth recording but must never mark
  // a fully-provisioned organization as failed.
  if (error) return { sent: false, reason: error.message };

  await db.from("organization_settings").upsert(
    { organization_id: orgId, key: "welcome_email",
      value: { sent: true, sent_at: new Date().toISOString() } },
    { onConflict: "organization_id,key" },
  );
  return { sent: true };
}

/** Run one job to completion (or until the runtime budget is spent). */
async function runJob(db: Db, jobId: string, orgId: string, deadline: number) {
  const { data: steps } = await db
    .from("provisioning_steps")
    .select("step_key, seq, status")
    .eq("job_id", jobId)
    .in("status", ["pending", "failed"])
    .order("seq");

  let criticalFailure: string | null = null;

  for (const step of steps ?? []) {
    if (Date.now() > deadline) {
      // Out of budget. The job stays `running` with a live lease; the next
      // invocation resumes from here. Nothing is lost and nothing is redone.
      console.log(`[worker] budget exhausted, ${jobId} will resume`);
      return { resumed: true, criticalFailure: null };
    }

    await db.rpc("heartbeat_provisioning_job", { _job: jobId, _lease_seconds: LEASE_SECONDS });

    // Steps that need HTTP are executed here; the SQL handler records intent.
    if (step.step_key === "storage") {
      const { error: sqlErr } = await db.rpc("run_provisioning_step", {
        _job: jobId, _step_key: "storage",
      });
      if (!sqlErr) {
        const result = await createStorageFolders(db, orgId);
        await db.from("provisioning_steps")
          .update({ result }).eq("job_id", jobId).eq("step_key", "storage");
      }
      continue;
    }

    if (step.step_key === "notify") {
      await db.rpc("run_provisioning_step", { _job: jobId, _step_key: "notify" });
      const result = await sendWelcomeEmail(db, orgId);
      await db.from("provisioning_steps")
        .update({ result }).eq("job_id", jobId).eq("step_key", "notify");
      continue;
    }

    const { error } = await db.rpc("run_provisioning_step", {
      _job: jobId, _step_key: step.step_key,
    });

    // run_provisioning_step only RAISES for critical steps; non-critical
    // failures are recorded and returned normally.
    if (error) {
      criticalFailure = `${step.step_key}: ${error.message}`;
      console.error(`[worker] critical step failed`, criticalFailure);
      break;
    }
  }

  return { resumed: false, criticalFailure };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  const deadline = started + MAX_RUNTIME_MS;

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));

    // ── Authorization ─────────────────────────────────────────────────────
    // Two callers are legitimate: the cron scheduler (shared secret) and a
    // platform admin. Anyone else gets nothing — an open drain endpoint would
    // let a stranger burn the queue's retry budget.
    const cronKey = req.headers.get("x-cron-key");
    const isCron = cronKey && cronKey === Deno.env.get("CRON_SECRET");

    // public-onboarding kicks the worker immediately after signup so the first
    // job does not wait for the next cron tick. It presents the same secret.
    const isInternal = body?.internal === true && isCron;

    if (!isCron && !isInternal) {
      const caller = await resolveCaller(req, db);
      if (!caller) return jsonResponse(401, { error: "Unauthorized" });
      const { data: pu } = await db
        .from("platform_users").select("id, is_active")
        .eq("user_id", caller.userId).maybeSingle();
      if (!pu?.is_active) return jsonResponse(403, { error: "Platform access required" });
    }

    const workerId = `edge-${crypto.randomUUID().slice(0, 8)}`;
    const maxJobs = Math.min(Number(body?.maxJobs) || 5, 20);
    const processed: Record<string, unknown>[] = [];

    for (let i = 0; i < maxJobs; i++) {
      if (Date.now() > deadline) break;

      const { data: claimed, error: claimErr } = await db.rpc("claim_provisioning_job", {
        _worker: workerId, _lease_seconds: LEASE_SECONDS,
      });
      if (claimErr) {
        console.error("[worker] claim failed", claimErr);
        break;
      }
      const job = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!job?.job_id) break;   // queue empty

      const { resumed, criticalFailure } = await runJob(
        db, job.job_id, job.organization_id, deadline,
      );

      if (!resumed) {
        await db.rpc("complete_provisioning_job", {
          _job: job.job_id, _error: criticalFailure,
        });
      }

      processed.push({
        jobId: job.job_id,
        organizationId: job.organization_id,
        attempt: job.attempt,
        outcome: resumed ? "resumed" : criticalFailure ? "failed" : "completed",
      });
    }

    return jsonResponse(200, {
      ok: true,
      worker: workerId,
      processed: processed.length,
      jobs: processed,
      elapsedMs: Date.now() - started,
    });
  } catch (e) {
    console.error("[provisioning-worker]", e);
    return jsonResponse(500, { error: (e as Error).message });
  }
});
