// ──────────────────────────────────────────────────────────────────────────────
// SIGN IN — one page, branded by whoever's front door you arrived at.
//
// ┌── WHY THIS IS NOT A HARDCODED LOGO ────────────────────────────────────┐
// │ This page used to import ark-logo.jpeg and print "ARK Learning Arena"  │
// │ over it. That was correct while ARK was the only tenant and is now     │
// │ actively wrong: every customer who signs up is shown a competitor's    │
// │ name on the screen where they type their password, and the platform's  │
// │ own domain advertises one customer's brand to every prospect.          │
// │                                                                        │
// │ So branding is resolved from the HOSTNAME, before authentication:      │
// │                                                                        │
// │   ark.smartark.ai          → ARK Learning Arena's logo and name        │
// │   abc-academi.smartark.ai  → ABC Academi's                             │
// │   smart-ark-main.vercel.app → Smart ARK (the platform)                 │
// │   anything unrecognised    → Smart ARK                                 │
// │                                                                        │
// │ public_branding_for_host() is SECURITY DEFINER, granted to `anon`, and │
// │ deliberately returns presentation fields only — no integrations, no    │
// │ secrets, no domain list. A gate in phase6.test.ts asserts that, because│
// │ this is the one RPC an unauthenticated stranger can call by design.    │
// └────────────────────────────────────────────────────────────────────────┘
//
// The authentication logic below is UNCHANGED — same login(), same redirect,
// same error handling. Everything new here is presentation.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, Mail, Eye, EyeOff, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { hexToHslTriple } from "@/core/theme/OrganizationThemeProvider";
import { cn } from "@/lib/utils";
// Token stylesheet, imported explicitly rather than relied on via the
// marketing bundle. It is scoped to .mk-root, so nothing here can reach a
// portal, and CSS imports dedupe — this costs no additional bytes.
import "@/features/marketing/styles/marketing.css";

interface Branding {
  organization_name?: string | null;
  portal_name?: string | null;
  logo_url?: string | null;
  logo_dark_url?: string | null;
  login_greeting?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  support_email?: string | null;
  help_url?: string | null;
  powered_by_hidden?: boolean | null;
}

/** The platform's own identity — the default, and the fallback for any error. */
const PLATFORM = {
  name: "Smart ARK",
  tagline: "Sign in to your institution",
  monogram: "SA",
} as const;

/** First letters of up to two words: "ABC Academi" → "AA". */
const monogramFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || PLATFORM.monogram;

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);

  // ── Branding ──────────────────────────────────────────────────────────────
  // `resolved` gates the reveal so the identity never flickers from one brand
  // to another. It is a fade of the block, not a spinner: the form stays usable
  // throughout, because nobody should wait on a logo to type a password.
  const [branding, setBranding] = useState<Branding | null>(null);
  const [resolved, setResolved] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        const { data } = await supabase.rpc("public_branding_for_host" as never, {
          _host: window.location.hostname,
        } as never);
        if (alive.current) setBranding((data as Branding | null) ?? null);
      } catch {
        // Never fall back to a tenant's brand. An unreachable lookup means we
        // do not know whose door this is, and the honest answer is the
        // platform's own name.
        if (alive.current) setBranding(null);
      } finally {
        if (alive.current) setResolved(true);
      }
    })();
    return () => { alive.current = false; };
  }, []);

  const isTenant = !!branding?.organization_name;
  const title = branding?.portal_name || branding?.organization_name || PLATFORM.name;
  const subtitle = branding?.login_greeting || (isTenant ? "Sign in to continue" : PLATFORM.tagline);
  const logo = branding?.logo_url || null;

  // Tenant colours are applied as scoped CSS variables on this page only.
  // hexToHslTriple returns null for anything that is not #rrggbb, so a bad
  // value in the database degrades to the default theme rather than painting
  // the page with an unparsed string.
  const brandStyle = useMemo(() => {
    const style: React.CSSProperties & Record<string, string> = {} as never;
    const primary = branding?.primary_color ? hexToHslTriple(branding.primary_color) : null;
    const accent = branding?.accent_color ? hexToHslTriple(branding.accent_color) : null;
    if (primary) style["--primary"] = primary;
    if (accent) style["--accent"] = accent;
    return style;
  }, [branding]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const success = await login(email, password);
      if (success) {
        // Navigation is handled by AuthRedirect at "/" based on actual role from profile
        navigate("/");
      } else {
        setError("Invalid credentials. Please try again.");
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const field =
    "w-full rounded-[--mk-radius-md] border border-border bg-background/60 py-3 text-foreground " +
    "placeholder:text-muted-foreground/50 transition-shadow " +
    "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent";

  return (
    <div
      className="mk-root relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-5"
      style={brandStyle}
    >
      {/* Ambient wash — the same treatment as the public site, so arriving from
          the marketing page does not feel like landing in a different product. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="mk-grid-bg mk-fade-bottom absolute inset-0 opacity-50" />
        <div
          className="absolute -top-40 left-1/2 h-[38rem] w-[52rem] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(50% 50% at 50% 50%, hsl(var(--accent) / 0.16) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] h-[28rem] w-[28rem]"
          style={{
            background:
              "radial-gradient(50% 50% at 50% 50%, hsl(var(--primary) / 0.14) 0%, transparent 70%)",
          }}
        />
      </div>

      <main className="relative z-10 w-full max-w-md">
        <div className="mk-hairline relative overflow-hidden rounded-[--mk-radius-xl] border border-border bg-card p-6 shadow-[--mk-shadow-xl] sm:p-8">
          {/* Identity. The box is sized identically in both states so the form
              below cannot shift when the brand resolves. */}
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "grid h-16 w-16 place-items-center overflow-hidden rounded-[--mk-radius-lg]",
                "transition-opacity duration-300",
                resolved ? "opacity-100" : "opacity-0",
                logo ? "bg-card ring-1 ring-border" : "bg-primary",
              )}
            >
              {logo ? (
                <img
                  src={logo}
                  alt=""
                  className="h-full w-full object-contain"
                  // A broken logo URL must not leave an empty square with a
                  // browser's default alt icon on the sign-in screen.
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span className="text-lg font-bold tracking-tight text-primary-foreground">
                  {isTenant ? monogramFor(title) : PLATFORM.monogram}
                </span>
              )}
            </div>

            <h1
              className={cn(
                "mt-4 text-pretty text-2xl font-semibold tracking-tight transition-opacity duration-300",
                resolved ? "opacity-100" : "opacity-0",
              )}
            >
              {title}
            </h1>
            <p
              className={cn(
                "mt-1 text-sm text-muted-foreground transition-opacity duration-300",
                resolved ? "opacity-100" : "opacity-0",
              )}
            >
              {subtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@institution.com"
                  className={cn(field, "pl-10 pr-4")}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={cn(field, "pl-10 pr-12")}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  // 44px square: this was a bare icon and sat well under the
                  // minimum touch target on a phone.
                  className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-[--mk-radius-sm] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              // role="alert" so the failure is announced; a silently reddened
              // line is invisible to a screen reader.
              <p role="alert" className="text-center text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "flex h-12 w-full items-center justify-center gap-2 rounded-[--mk-radius-md]",
                "bg-primary text-sm font-semibold text-primary-foreground shadow-[--mk-shadow-sm]",
                "transition-[box-shadow,transform] duration-[--mk-dur] ease-[--mk-ease]",
                "hover:shadow-[--mk-shadow-glow] active:scale-[0.985]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                "disabled:pointer-events-none disabled:opacity-60",
                "motion-reduce:transform-none motion-reduce:transition-none",
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Support route, when the tenant has published one. Someone locked
              out of a portal currently has nowhere to go from this screen. */}
          {(branding?.help_url || branding?.support_email) && (
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Trouble signing in?{" "}
              <a
                href={branding.help_url ?? `mailto:${branding.support_email}`}
                className="font-medium text-accent hover:underline"
              >
                Contact your administrator
              </a>
            </p>
          )}
        </div>

        {/* Below the card, deliberately. On the platform's own domain this is
            the second most important action on the page; inside a tenant's
            portal it would be an invitation to leave, so it is hidden there. */}
        {resolved && !isTenant && (
          <div className="mt-6 flex flex-col items-center gap-1">
            <span className="text-sm text-muted-foreground">New institution?</span>
            {/* h-11, not an inline link. WCAG 2.5.8 exempts links inside a
                sentence, but this is a primary action — it is the whole
                self-serve funnel — and it measured 20px tall on a phone. */}
            <Link
              to="/signup"
              className="inline-flex h-11 items-center gap-1.5 rounded-[--mk-radius-md] px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start a free trial
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {/* powered_by_hidden is only honoured for tenants whose plan actually
              includes white-label — the RPC ANDs it with the entitlement, so
              this cannot be turned off by editing a row. */}
          {isTenant && !branding?.powered_by_hidden
            ? "Secured by Smart ARK"
            : isTenant
            ? "Secure sign-in"
            : "Multi-tenant, isolated at the database"}
        </p>
      </main>
    </div>
  );
};

export default Login;
