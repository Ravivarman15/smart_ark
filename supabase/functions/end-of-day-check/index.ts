import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Phase 0: the JWT is now signature-verified rather than base64-decoded.
    // The old comment justified the decode with "the platform already
    // validated it" — true today, but that guarantee lives in config.toml,
    // not here, and one `verify_jwt = false` would silently turn this into
    // "trust whatever sub the caller sent". See _shared/auth.ts.
    //
    // resolveCaller() also folds in the profile lookup this function did
    // separately, so the verification costs no extra round trip overall.
    const caller = await resolveCaller(req, supabase);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const today = new Date().toISOString().split("T")[0];
    const profile = caller.profileId ? { id: caller.profileId, role: caller.role } : null;

    if (!profile || profile.role !== "admin") {
      return new Response(
        JSON.stringify({ canLogout: true, blockers: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const blockers: string[] = [];

    // 1. Check checklist completion
    const { data: checklist } = await supabase
      .from("admin_checklist")
      .select("completed")
      .eq("admin_id", profile.id)
      .eq("date", today);

    const totalItems = checklist?.length || 0;
    const completedItems = checklist?.filter((c) => c.completed).length || 0;
    if (totalItems > 0 && completedItems < totalItems) {
      blockers.push(`Checklist: ${completedItems}/${totalItems} complete`);
    }

    // 2. Check marks verification pending
    const { count: unverifiedCount } = await supabase
      .from("test_results")
      .select("*", { count: "exact", head: true })
      .is("verified_at", null);
    if (unverifiedCount && unverifiedCount > 0) {
      blockers.push(`${unverifiedCount} marks pending verification`);
    }

    // 3. Check retest allocation pending
    const { count: pendingRetests } = await supabase
      .from("retests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    if (pendingRetests && pendingRetests > 0) {
      blockers.push(`${pendingRetests} retests pending allocation`);
    }

    // 4. Check absentee > 3 days
    const { count: unresolvedViolations } = await supabase
      .from("violations")
      .select("*", { count: "exact", head: true })
      .eq("type", "attendance_gap")
      .eq("resolved", false)
      .eq("date", today);
    if (unresolvedViolations && unresolvedViolations > 0) {
      blockers.push(`${unresolvedViolations} absentee follow-ups pending`);
    }

    return new Response(
      JSON.stringify({ canLogout: blockers.length === 0, blockers }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
