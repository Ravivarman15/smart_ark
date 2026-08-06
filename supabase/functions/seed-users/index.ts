import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── PHASE 0: DISABLED BY DEFAULT ────────────────────────────────────────
    // This is a first-run bootstrap that resets ten REAL staff accounts to
    // hardcoded passwords. Those same passwords also sat in git-tracked root
    // scripts (removed in Phase 0), so they must be treated as compromised.
    //
    // A permanently-live endpoint that rewrites production credentials is not
    // acceptable in a product being sold to other organizations. It now
    // requires an explicit, deliberately-set environment variable, so the
    // default posture is "off" and re-enabling is a conscious operator act:
    //
    //     npx supabase secrets set SEED_USERS_ENABLED=true    # run it
    //     npx supabase secrets unset SEED_USERS_ENABLED       # turn it off again
    //
    // Phase 1 replaces this entirely with tenant provisioning, at which point
    // the function should be deleted.
    if (Deno.env.get("SEED_USERS_ENABLED") !== "true") {
      return json(410, {
        error:
          "seed-users is disabled. It resets live staff credentials to known " +
          "passwords. Set SEED_USERS_ENABLED=true to run it, then unset it.",
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Phase 0: signature-verified caller. The previous base64 decode trusted
    // the caller's own `sub`, so a forged token could have driven this
    // service-role function. See _shared/auth.ts.
    const gate = await requireRole(req, supabase, ["management"]);
    if (!gate.ok) return json(gate.status, { error: gate.error });

    // NOTE: these default passwords are intentionally known — they exist only
    // for first-run bootstrap. Every seeded account MUST reset its password on
    // first login (UI already enforces this via `force_password_reset` flag).
    const users = [
      { email: "management@ark.edu", password: "management123", name: "Augustine", role: "management", campus: null },
      { email: "akbar25cool@gmail.com", password: "Ark@2026", name: "Mr. Akbar", role: "coordinator", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "aswinjeni@gmail.com", password: "Ark@2026", name: "Ms. Jenifer", role: "admin", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "arunantony.sc@gmail.com", password: "Ark@2026", name: "Mr. Arun Anthony", role: "teacher", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "sivasankari3456@gmail.com", password: "Ark@2026", name: "Mrs. Sivasankari", role: "teacher", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "kisshorekaran2707@gmail.com", password: "Ark@2026", name: "Mr. Kishore", role: "teacher", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "sathicksafrin7@gmail.com", password: "Ark@2026", name: "Ms. Safrin", role: "teacher", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "rvijaya91@gmail.com", password: "Ark@2026", name: "Mr. Sathish", role: "teacher", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "christosuna2102@gmail.com", password: "Ark@2026", name: "Mr. Christopher", role: "teacher", campus: "c0000001-0000-0000-0000-000000000002" },
      { email: "archanagovindaraj0316@gmail.com", password: "Ark@2026", name: "Ms. Archana", role: "teacher", campus: "c0000001-0000-0000-0000-000000000002" },
    ];

    const results = [];
    for (const u of users) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { name: u.name, role: u.role },
      });

      if (error) {
        results.push({ email: u.email, error: error.message });
        continue;
      }

      // Update the auto-created profile with campus
      if (data.user && u.campus) {
        await supabase
          .from("profiles")
          .update({ campus_id: u.campus, subject: u.role === "teacher" ? "Mathematics" : null })
          .eq("user_id", data.user.id);
      }

      results.push({ email: u.email, success: true, id: data.user?.id });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
