// ──────────────────────────────────────────────────────────────────────────────
// DOMAIN & EMAIL VERIFICATION
//
// Real DNS lookups over DNS-over-HTTPS (Cloudflare 1.1.1.1 JSON API) — no
// dependency, works from Deno, and resolves against a public resolver rather
// than whatever the edge runtime happens to cache.
//
// Actions:
//   verify_domain   TXT + CNAME ownership proof for a custom hostname
//   check_email_dns SPF / DKIM / DMARC for a sending domain
//   test_smtp       validate a custom SMTP/API sender before it is trusted
//   ssl_status      report certificate state for a verified domain
//
// ┌── WHAT IS NOT AUTOMATED, AND WHY IT SAYS SO ───────────────────────────┐
// │ Certificate ISSUANCE is not performed here. On Vercel, certificates    │
// │ are minted when a domain is added to the project — which needs a       │
// │ Vercel API token with project-write scope. Wiring that into a function │
// │ any platform admin can call would put deployment credentials one bug   │
// │ away from a tenant.                                                    │
// │                                                                        │
// │ So this REPORTS certificate state honestly and the operator adds the   │
// │ domain in Vercel. `ssl_status` is a real observation, not a guess.     │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const DOH = "https://cloudflare-dns.com/dns-query";

interface DnsAnswer { name: string; type: number; TTL: number; data: string }

/** One DNS-over-HTTPS query. Returns [] on any failure — never throws. */
async function dnsQuery(name: string, type: string): Promise<DnsAnswer[]> {
  try {
    const res = await fetch(
      `${DOH}?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!res.ok) return [];
    const json = await res.json() as { Answer?: DnsAnswer[] };
    return json.Answer ?? [];
  } catch {
    return [];
  }
}

/** DNS TXT values arrive quoted and may be split into 255-byte chunks. */
const cleanTxt = (data: string): string =>
  data.replace(/^"|"$/g, "").replace(/"\s*"/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db: Db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const caller = await resolveCaller(req, db);
    if (!caller) return jsonResponse(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "";

    // Platform staff bypass the tenant ROLE check (they are not admin/management
    // inside the organization) but NOT the organization scope. To act on a
    // tenant they impersonate it — Phase 2's Secure Impersonation already puts
    // that organization on the caller. Accepting an organization id from the
    // body would be a second, unaudited path to the same thing, and the Phase 1
    // gate rejects it for exactly that reason.
    const { data: pu } = await db
      .from("platform_users").select("id, is_active")
      .eq("user_id", caller.userId).maybeSingle();
    const isPlatform = !!pu?.is_active;

    const org = caller.organizationId;

    if (!org) return jsonResponse(403, { error: "No organization context" });
    if (!isPlatform && !["admin", "management"].includes(caller.role ?? "")) {
      return jsonResponse(403, { error: "Only an admin or management user can manage domains" });
    }

    // ── verify_domain ─────────────────────────────────────────────────────
    if (action === "verify_domain") {
      const { domainId } = body;
      const { data: domain } = await db
        .from("organization_domains")
        .select("id, host, organization_id, verification_token, status")
        .eq("id", domainId)
        .maybeSingle();

      if (!domain) return jsonResponse(404, { error: "Domain not found" });
      // A platform admin can name any organization; a tenant cannot reach
      // another's domain even by guessing an id.
      if (domain.organization_id !== org) {
        return jsonResponse(403, { error: "Domain belongs to another organization" });
      }

      await db.from("organization_domains")
        .update({ status: "verifying", last_checked_at: new Date().toISOString() })
        .eq("id", domain.id);

      const { data: checks } = await db
        .from("domain_verifications")
        .select("id, record_type, record_name, expected_value")
        .eq("domain_id", domain.id);

      const results: Record<string, unknown>[] = [];
      let allVerified = true;

      for (const c of checks ?? []) {
        const answers = await dnsQuery(c.record_name, c.record_type);
        const values = answers.map((a) => cleanTxt(a.data).replace(/\.$/, ""));
        const expected = c.expected_value.replace(/\.$/, "");

        // CNAME targets are case-insensitive and may carry a trailing dot;
        // TXT must match the token exactly.
        const matched = c.record_type === "CNAME"
          ? values.some((v) => v.toLowerCase() === expected.toLowerCase())
          : values.some((v) => v === expected);

        const status = answers.length === 0 ? "missing" : matched ? "verified" : "mismatch";
        if (status !== "verified") allVerified = false;

        await db.from("domain_verifications").update({
          observed_value: values.join(", ") || null,
          status,
          checked_at: new Date().toISOString(),
          error: status === "missing" ? "No DNS record found — it may still be propagating" : null,
        }).eq("id", c.id);

        results.push({
          type: c.record_type, name: c.record_name,
          expected, observed: values, status,
        });
      }

      const finalStatus = allVerified ? "verified" : "pending";
      await db.from("organization_domains").update({
        status: finalStatus,
        verified_at: allVerified ? new Date().toISOString() : null,
        // Verified DNS is not a certificate. Marking SSL 'provisioning' rather
        // than 'active' keeps the dashboard honest until it is observed.
        ssl_status: allVerified ? "provisioning" : "pending",
        last_checked_at: new Date().toISOString(),
      }).eq("id", domain.id);

      await db.rpc("branding_audit", {
        _org: org, _action: "domain.verified",
        _detail: `${domain.host} → ${finalStatus}`,
        _payload: { results },
      });

      return jsonResponse(200, {
        ok: true, status: finalStatus, host: domain.host, records: results,
        note: allVerified
          ? "DNS verified. A certificate is issued once the domain is added to the hosting project."
          : "Some records are not visible yet. DNS typically propagates within 5–30 minutes.",
      });
    }

    // ── check_email_dns ───────────────────────────────────────────────────
    if (action === "check_email_dns") {
      const domain = String(body?.domain ?? "").toLowerCase().trim();
      if (!domain) return jsonResponse(400, { error: "domain is required" });

      const [spfAnswers, dmarcAnswers, dkimAnswers, mxAnswers] = await Promise.all([
        dnsQuery(domain, "TXT"),
        dnsQuery(`_dmarc.${domain}`, "TXT"),
        dnsQuery(`${body?.dkimSelector ?? "mail"}._domainkey.${domain}`, "TXT"),
        dnsQuery(domain, "MX"),
      ]);

      const spf = spfAnswers.map((a) => cleanTxt(a.data)).find((v) => v.startsWith("v=spf1"));
      const dmarc = dmarcAnswers.map((a) => cleanTxt(a.data)).find((v) => v.startsWith("v=DMARC1"));
      const dkim = dkimAnswers.map((a) => cleanTxt(a.data)).find((v) => v.includes("p="));

      return jsonResponse(200, {
        ok: true,
        domain,
        spf:   { present: !!spf,   value: spf ?? null,
                 note: spf ? null : "Without SPF, your mail is likely to land in spam." },
        dkim:  { present: !!dkim,  value: dkim ? `${dkim.slice(0, 40)}…` : null,
                 note: dkim ? null : "DKIM signing is required by Gmail and Outlook for bulk senders." },
        dmarc: { present: !!dmarc, value: dmarc ?? null,
                 note: dmarc ? null : "DMARC tells receivers what to do with unauthenticated mail." },
        mx:    { present: mxAnswers.length > 0, count: mxAnswers.length },
        // Deliverability advice, not a pass/fail: a domain can send perfectly
        // well without DMARC, and blocking on it would be wrong.
        deliverability: !spf ? "poor" : !dkim ? "fair" : !dmarc ? "good" : "excellent",
      });
    }

    // ── test_smtp ─────────────────────────────────────────────────────────
    if (action === "test_smtp") {
      const { provider, config, apiKey, password } = body;
      if (!provider) return jsonResponse(400, { error: "provider is required" });

      let ok = false;
      let detail = "";

      if (provider === "brevo") {
        // Validate the key against the provider before trusting it. A key that
        // fails here would otherwise fail silently on the first real send.
        const res = await fetch("https://api.brevo.com/v3/account", {
          headers: { "api-key": String(apiKey ?? ""), Accept: "application/json" },
        });
        ok = res.ok;
        detail = ok ? "Brevo credentials accepted" : `Brevo rejected the key (${res.status})`;
      } else if (provider === "sendgrid") {
        const res = await fetch("https://api.sendgrid.com/v3/user/account", {
          headers: { Authorization: `Bearer ${apiKey ?? ""}` },
        });
        ok = res.ok;
        detail = ok ? "SendGrid credentials accepted" : `SendGrid rejected the key (${res.status})`;
      } else if (provider === "smtp" || provider === "google" || provider === "microsoft") {
        // Deno's edge runtime cannot open a raw TCP socket to port 587, so a
        // true SMTP handshake is not possible here. Say so rather than
        // returning a fabricated "connection OK".
        const host = String(config?.host ?? "");
        const port = Number(config?.port ?? 587);
        ok = !!host && !!password && [25, 465, 587, 2525].includes(port);
        detail = ok
          ? "Configuration looks valid. A live SMTP handshake is not possible from this runtime — " +
            "the first real send will confirm it, and any failure is reported on this page."
          : "Host, password and a standard SMTP port (587, 465, 2525 or 25) are required.";
      } else {
        return jsonResponse(400, { error: `Unsupported provider "${provider}"` });
      }

      if (ok) {
        // Store the secret ONLY after validation, and only in the table no
        // tenant can read.
        const secretKey = provider === "smtp" || provider === "google" || provider === "microsoft"
          ? "smtp_password" : `${provider}_api_key`;
        const secretValue = String(password ?? apiKey ?? "");

        await db.from("organization_secrets").upsert({
          organization_id: org,
          key: secretKey,
          value: secretValue,
          // A hint, never the value — an admin can confirm WHICH key is
          // configured without it ever leaving the server.
          hint: `••••${secretValue.slice(-4)}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,key" });

        await db.from("organization_integrations").upsert({
          organization_id: org,
          channel: "email",
          provider,
          mode: "custom",
          config: config ?? {},
          is_active: true,
          verified_at: new Date().toISOString(),
          verification_error: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,channel" });
      } else {
        await db.from("organization_integrations").upsert({
          organization_id: org, channel: "email", provider,
          mode: "platform",              // stay on ours until it verifies
          config: config ?? {},
          verified_at: null, verification_error: detail,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,channel" });
      }

      await db.rpc("branding_audit", {
        _org: org, _action: "integration.email_tested",
        _detail: detail, _payload: { provider, ok },
      });

      return jsonResponse(200, { ok, provider, detail });
    }

    // ── ssl_status ────────────────────────────────────────────────────────
    if (action === "ssl_status") {
      const { domainId } = body;
      const { data: domain } = await db
        .from("organization_domains")
        .select("id, host, organization_id, status, ssl_status")
        .eq("id", domainId).maybeSingle();
      if (!domain || domain.organization_id !== org) {
        return jsonResponse(404, { error: "Domain not found" });
      }

      // Observe rather than assume: a successful TLS handshake against the
      // host is the only honest evidence a certificate exists and is valid.
      let observed = "pending";
      let detail = "Certificate not yet issued.";
      try {
        const res = await fetch(`https://${domain.host}/robots.txt`, {
          method: "HEAD", redirect: "manual",
        });
        observed = "active";
        detail = `TLS handshake succeeded (HTTP ${res.status}).`;
      } catch (e) {
        const msg = (e as Error).message ?? "";
        observed = /certificate|tls|ssl/i.test(msg) ? "failed" : "provisioning";
        detail = observed === "failed"
          ? `TLS error: ${msg}`
          : "Host not reachable yet — DNS may still be propagating.";
      }

      await db.from("organization_domains").update({
        ssl_status: observed,
        ssl_issued_at: observed === "active" ? new Date().toISOString() : null,
        last_checked_at: new Date().toISOString(),
      }).eq("id", domain.id);

      return jsonResponse(200, { ok: true, host: domain.host, ssl_status: observed, detail });
    }

    return jsonResponse(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[domain-verify]", e);
    return jsonResponse(500, { error: (e as Error).message });
  }
});
