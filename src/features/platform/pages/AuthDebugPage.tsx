// ──────────────────────────────────────────────────────────────────────────────
// AUTH DIAGNOSTICS — /platform/debug/auth
//
// DEVELOPMENT BUILDS ONLY. Three independent reasons this must never ship:
//   1. features/platform/routes.tsx only registers the route when
//      import.meta.env.DEV is true, so Vite's dead-code elimination drops both
//      the route and this module from a production bundle entirely.
//   2. The route additionally requires an active, MFA-enrolled platform user
//      holding `settings.manage` — the narrowest capability in the set.
//   3. The component itself refuses to render outside DEV, so importing it by
//      accident from somewhere else still yields nothing.
//
// It exists to answer one question quickly: "what does this session ACTUALLY
// carry?" Tenant bugs are hard to see precisely because the claim is invisible
// — RLS silently returns zero rows and the UI looks merely empty. Being able to
// read organization_id straight off the token turns a two-hour hunt into a
// glance.
//
// SAFETY: the raw access token is never rendered. It is a bearer credential —
// anyone reading it over a shoulder or in a screenshot holds the session until
// it expires. Only the DECODED, non-secret claim payload is shown.
//
// The decode below is for DISPLAY ONLY and is never used to make an
// authorization decision. Every real check happens server-side: RLS reads the
// signed claim via current_org_id(), and platform capability is resolved
// against platform_users. A browser-side decode is unsigned and untrustworthy.
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, LoadingBlock } from "../components/PlatformShell";

/** Decode a JWT payload for display. NOT verification — see file header. */
function decodeClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(
      // Base64 is bytes; a non-ASCII claim (an organization name with an
      // accent) would otherwise decode to mojibake.
      decodeURIComponent(
        json.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
      ),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const fmt = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const fmtTime = (epochSeconds?: number): string =>
  epochSeconds ? new Date(epochSeconds * 1000).toLocaleString() : "—";

/** One label/value line. `missing` marks a field that has no source at all. */
const Row: React.FC<{ label: string; value: React.ReactNode; missing?: boolean; note?: string }> = ({
  label, value, missing, note,
}) => (
  <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
    <span className="w-56 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
    <span className={`break-all font-mono text-sm ${missing ? "text-amber-600 dark:text-amber-500" : ""}`}>
      {value}
    </span>
    {note && <span className="text-xs text-muted-foreground sm:ml-auto">{note}</span>}
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-lg border border-border bg-card p-4">
    <h2 className="mb-2 text-sm font-semibold tracking-tight">{title}</h2>
    {children}
  </section>
);

const AuthDebugPage: React.FC = () => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["platform", "debug", "auth"],
    // Never cached to disk and always re-read: a stale answer here is worse
    // than none, because the whole point is to see the CURRENT token.
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const session = sess.session;
      const claims = session?.access_token ? decodeClaims(session.access_token) : null;
      const appMeta = (claims?.app_metadata ?? {}) as Record<string, unknown>;
      const orgId = appMeta.organization_id as string | undefined;

      // Everything below is read through RLS as the CURRENT user on purpose.
      // A service-role read would show data this session cannot actually see,
      // which would make the page lie in exactly the situation it is for.
      const [org, profile, sub, branch, year, flags] = await Promise.all([
        orgId
          ? supabase.from("organizations" as never)
              .select("id, slug, display_name, legal_name, status, timezone, currency, locale")
              .eq("id", orgId).maybeSingle()
          : Promise.resolve({ data: null }),
        session?.user?.id
          ? supabase.from("profiles" as never)
              .select("id, name, role, is_active").eq("user_id", session.user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        orgId
          ? supabase.from("organization_subscriptions" as never)
              .select("plan_code, status, current_period_end, trial_ends_at, grace_until, seats_limit, students_limit")
              .eq("organization_id", orgId).maybeSingle()
          : Promise.resolve({ data: null }),
        orgId
          ? supabase.from("organization_branches" as never)
              .select("name, code, is_primary").eq("organization_id", orgId)
              .eq("is_primary", true).maybeSingle()
          : Promise.resolve({ data: null }),
        orgId
          ? supabase.from("academic_years" as never)
              .select("name, start_date, end_date, is_default")
              .eq("organization_id", orgId).eq("is_default", true).maybeSingle()
          : Promise.resolve({ data: null }),
        orgId
          ? supabase.from("feature_flag_assignments" as never)
              .select("feature_key, enabled").eq("organization_id", orgId)
          : Promise.resolve({ data: [] }),
      ]);

      return {
        session, claims, appMeta,
        org: org.data as Record<string, unknown> | null,
        profile: profile.data as Record<string, unknown> | null,
        sub: sub.data as Record<string, unknown> | null,
        branch: branch.data as Record<string, unknown> | null,
        year: year.data as Record<string, unknown> | null,
        flags: (flags.data ?? []) as { feature_key: string; enabled: boolean }[],
      };
    },
  });

  if (isLoading) return <LoadingBlock />;
  if (!data) return null;

  const { session, claims, appMeta, org, profile, sub, branch, year, flags } = data;
  const exp = claims?.exp as number | undefined;
  const secondsLeft = exp ? Math.round(exp - Date.now() / 1000) : null;

  return (
    <div>
      <PageHeader
        title="Auth diagnostics"
        description="Development build only. What this session actually carries."
      />

      <div className="space-y-4 p-6">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          Never rendered in a production build — the route is compiled out. The raw
          access token is deliberately not shown; it is a bearer credential.
          <button onClick={() => void refetch()} className="ml-2 underline" disabled={isFetching}>
            {isFetching ? "refreshing…" : "refresh"}
          </button>
        </div>

        <Card title="Identity">
          <Row label="User ID" value={fmt(session?.user?.id)} />
          <Row label="Email" value={fmt(session?.user?.email)} />
          <Row label="Email confirmed" value={fmt(session?.user?.email_confirmed_at)} />
          <Row label="Profile name" value={fmt(profile?.name)} />
          <Row label="Profile active" value={fmt(profile?.is_active)} />
        </Card>

        <Card title="Tenant">
          <Row
            label="organization_id (claim)"
            value={fmt(appMeta.organization_id)}
            missing={!appMeta.organization_id}
            note={appMeta.organization_id ? "from the signed JWT" : "hook disabled, or no membership"}
          />
          <Row label="Tenant ID" value={fmt(appMeta.organization_id)} note="same value — one tenant key" />
          <Row label="Organization name" value={fmt(org?.display_name)} />
          <Row label="Organization slug" value={fmt(org?.slug)} />
          <Row label="Organization status" value={fmt(org?.status)} />
          <Row label="principal_kind (claim)" value={fmt(appMeta.principal_kind)} />
        </Card>

        <Card title="Roles">
          <Row label="platform_role (claim)" value={fmt(appMeta.platform_role)}
               note="present only when MFA-enrolled" />
          <Row label="role (claim)" value={fmt(claims?.role)}
               note="Postgres role from GoTrue — not an app role" />
          <Row label="App role (profiles.role)" value={fmt(profile?.role)}
               note="read live from the DB, NOT the token" />
          <Row
            label="organization_role"
            value="does not exist"
            missing
            note="by design — see below"
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            There is no <code>organization_role</code> claim and no such column:{" "}
            <code>organization_users</code> holds only <code>principal_kind</code>{" "}
            (staff/parent/student). The app-level role lives in{" "}
            <code>profiles.role</code> and is read server-side by{" "}
            <code>get_user_role(auth.uid())</code> inside RLS.
            <br />
            That separation is deliberate and worth keeping: a JWT is valid for up
            to an hour, so a role baked into the token would keep working after the
            user is demoted. Reading the role from the table means a permission
            change takes effect on the next query, not the next token refresh.
          </p>
        </Card>

        <Card title="Session">
          <Row label="Issued at" value={fmtTime(claims?.iat as number)} />
          <Row label="Expires at" value={fmtTime(exp)} />
          <Row
            label="Time remaining"
            value={secondsLeft === null ? "—" : `${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s`}
            missing={secondsLeft !== null && secondsLeft < 0}
          />
          <Row label="Auto-refreshes at" value={secondsLeft === null ? "—" : fmtTime((exp ?? 0) - 60)}
               note="supabase-js refreshes shortly before expiry" />
          <Row label="Refresh token present" value={session?.refresh_token ? "yes" : "no"} />
          <Row label="Issuer" value={fmt(claims?.iss)} />
        </Card>

        <Card title="Subscription">
          <Row label="Plan" value={fmt(sub?.plan_code)} missing={!sub} />
          <Row label="Status" value={fmt(sub?.status)} />
          <Row label="Period ends" value={fmt(sub?.current_period_end)} />
          <Row label="Trial ends" value={fmt(sub?.trial_ends_at)} />
          <Row label="Grace until" value={fmt(sub?.grace_until)} />
          <Row label="Seat limit" value={fmt(sub?.seats_limit)} />
          <Row label="Student limit" value={fmt(sub?.students_limit)} />
        </Card>

        <Card title="Context">
          <Row label="Primary branch" value={fmt(branch?.name)} missing={!branch} />
          <Row label="Branch code" value={fmt(branch?.code)} />
          <Row label="Default academic year" value={fmt(year?.name)} missing={!year} />
          <Row label="Year range" value={year ? `${fmt(year.start_date)} → ${fmt(year.end_date)}` : "—"} />
          <Row label="Timezone" value={fmt(org?.timezone)} />
          <Row label="Currency" value={fmt(org?.currency)} />
          <Row label="Locale" value={fmt(org?.locale)} />
        </Card>

        <Card title={`Feature flags (${flags.length})`}>
          {flags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No per-organization overrides. Defaults apply.
            </p>
          ) : (
            flags.map((f) => (
              <Row key={f.feature_key} label={f.feature_key} value={f.enabled ? "enabled" : "disabled"} />
            ))
          )}
        </Card>

        <Card title="Full JWT claims">
          <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
            {claims ? JSON.stringify(claims, null, 2) : "no session"}
          </pre>
        </Card>
      </div>
    </div>
  );
};

// Belt and braces: even if something imports this outside a dev build, it
// renders nothing rather than exposing claims.
export default (import.meta.env.DEV ? AuthDebugPage : () => null) as React.FC;
