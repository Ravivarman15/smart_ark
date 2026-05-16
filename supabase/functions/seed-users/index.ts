import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // verify_jwt=true already enforces a signed-in caller, but any authenticated
  // user can hit this endpoint. This is a one-time bootstrap function that
  // creates admin/teacher accounts — gate it to the management role so a
  // logged-in teacher cannot reset everyone's passwords to the defaults below.
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    let callerUserId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      callerUserId = payload.sub || null;
    } catch { /* invalid token shape */ }
    if (!callerUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", callerUserId)
      .maybeSingle();
    if (!callerProfile || callerProfile.role !== "management") {
      return new Response(JSON.stringify({ error: "Forbidden — management role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
