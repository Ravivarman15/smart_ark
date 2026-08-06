// ──────────────────────────────────────────────────────────────────────────────
// START FREE TRIAL — the registration wizard.
//
// ┌── THE FLOW, AND WHY EACH STEP IS WHERE IT IS ──────────────────────────┐
// │ 1. Account    email + password → supabase.auth.signUp()                │
// │                Phase 0 made this INERT: a signup with no role metadata │
// │                creates NO profile, so the account has no membership,   │
// │                no organization claim and can read nothing.             │
// │ 2. Verify     the user clicks the emailed link and returns here        │
// │ 3. Organization  name, type, country, web address                      │
// │ 4. Provision  public-onboarding → provision_organization() (Phase 1D)  │
// │                                                                        │
// │ Verification sits BEFORE provisioning, not after, because that single  │
// │ ordering is what stops scripted mass-provisioning with throwaway       │
// │ addresses. Branding and plan selection deliberately come AFTER the     │
// │ organization exists — never block activation on a colour picker.       │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2, Mail, ArrowRight, AlertTriangle, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "../components/MarketingShell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSeo } from "../seo/useSeo";
import { ROUTE_SEO } from "../seo/seo";
import { marketingService } from "../services/marketing.service";
import { cn } from "@/lib/utils";

type Step = "account" | "verify" | "organization" | "provisioning" | "done";

const INSTITUTION_TYPES = [
  { value: "coaching", label: "Coaching / tuition institute" },
  { value: "k12", label: "K-12 school" },
  { value: "college", label: "College" },
  { value: "training", label: "Training centre" },
  { value: "other", label: "Other" },
];

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");

const STEP_ORDER: Step[] = ["account", "verify", "organization", "provisioning", "done"];

const SignupPage: React.FC = () => {
  useSeo(ROUTE_SEO["/signup"]);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [step, setStep] = useState<Step>("account");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [org, setOrg] = useState({
    legalName: "", slug: "", institutionType: "coaching", country: "IN",
    timezone: "Asia/Kolkata",
  });
  const [slugState, setSlugState] = useState<{ checking: boolean; available: boolean | null; reason: string | null }>(
    { checking: false, available: null, reason: null },
  );
  const [result, setResult] = useState<{ slug: string } | null>(null);

  const planCode = params.get("plan") ?? "trial";

  // Resume: a verified user returning from the email link lands mid-wizard
  // rather than at step 1. Without this the link feels like it did nothing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (cancelled || !user) return;

      const { data: membership } = await supabase
        .from("organization_users" as never)
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      // Already provisioned — nothing to do here, send them to the app.
      if (membership) { window.location.href = "/"; return; }

      setAccount((a) => ({ ...a, email: user.email ?? a.email }));
      setStep(user.email_confirmed_at ? "organization" : "verify");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void marketingService.trackEvent("page_view", "/signup");
  }, []);

  // ── Step 1: account ───────────────────────────────────────────────────
  const createAccount = async () => {
    setError(null);
    if (account.password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: account.email.trim().toLowerCase(),
        password: account.password,
        options: {
          // NO `role` in metadata — deliberately. Phase 0's handle_new_user()
          // creates a staff profile ONLY when an explicit staff role is
          // present, so this signup produces an account with no access at all
          // until provisioning attaches it to an organization.
          data: { name: account.name.trim() },
          emailRedirectTo: `${window.location.origin}/signup`,
        },
      });
      if (signUpErr) throw signUpErr;

      void marketingService.trackSignup({
        email: account.email, name: account.name, planCode, stage: "started",
      });
      setStep("verify");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Slug availability ─────────────────────────────────────────────────
  const checkSlug = useCallback(async (value: string) => {
    if (!value) { setSlugState({ checking: false, available: null, reason: null }); return; }
    setSlugState({ checking: true, available: null, reason: null });
    const res = await marketingService.checkSlug(value);
    setSlugState({ checking: false, available: res.available, reason: res.reason });
  }, []);

  useEffect(() => {
    if (!org.slug) return;
    // Debounced: a request per keystroke would hammer the function and
    // flicker the result.
    const t = setTimeout(() => void checkSlug(org.slug), 450);
    return () => clearTimeout(t);
  }, [org.slug, checkSlug]);

  // ── Step 3: provision ─────────────────────────────────────────────────
  const provision = async () => {
    setError(null);
    setBusy(true);
    setStep("provisioning");
    try {
      const res = await marketingService.provision({
        slug: org.slug,
        legalName: org.legalName,
        displayName: org.legalName,
        institutionType: org.institutionType,
        country: org.country,
        timezone: org.timezone,
        planCode,
      });
      setResult({ slug: res.slug });
      void marketingService.trackEvent("trial_start", "/signup");
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      setStep("organization");
    } finally {
      setBusy(false);
    }
  };

  // The session token was issued BEFORE the membership existed, so it carries
  // no organization claim. Signing out forces a fresh token on next login —
  // without this the new admin would land in the ERP and see zero rows.
  const enterApp = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <Section className="!py-14">
      <div className="mx-auto max-w-lg">
        {/* Progress */}
        <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
          {["Account", "Verify", "Organization", "Ready"].map((label, i) => {
            const active = i <= Math.min(stepIndex, 3);
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-medium",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-current={i === stepIndex ? "step" : undefined}
                >
                  {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn("hidden text-xs sm:block", active ? "" : "text-muted-foreground")}>
                  {label}
                </span>
                {i < 3 && <span className="h-px flex-1 bg-border" />}
              </li>
            );
          })}
        </ol>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>{error}</p>
          </div>
        )}

        {/* ── Account ─────────────────────────────────────────────────── */}
        {step === "account" && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h1 className="text-xl font-semibold tracking-tight">Start your free trial</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              14 days, no card required. Your organization is ready in under two minutes.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" autoComplete="name" value={account.name}
                  onChange={(e) => setAccount({ ...account, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" autoComplete="email" value={account.email}
                  onChange={(e) => setAccount({ ...account, email: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="new-password"
                  value={account.password}
                  onChange={(e) => setAccount({ ...account, password: e.target.value })} />
                <p className="mt-1 text-[11px] text-muted-foreground">At least 8 characters.</p>
              </div>
            </div>

            <Button
              className="mt-6 w-full"
              onClick={createAccount}
              disabled={busy || !account.name || !account.email || !account.password}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create account
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account? <a href="/login" className="text-primary hover:underline">Sign in</a>
            </p>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              By continuing you agree to our{" "}
              <Link to="/terms" className="underline">Terms</Link> and{" "}
              <Link to="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </div>
        )}

        {/* ── Verify ──────────────────────────────────────────────────── */}
        {step === "verify" && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a verification link to <strong>{account.email}</strong>. Click it,
              and you will come straight back here to name your organization.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Verification is required before we create your organization — it is how we
              keep the platform free of throwaway signups.
            </p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => window.location.reload()}>
              I have verified — continue
            </Button>
          </div>
        )}

        {/* ── Organization ────────────────────────────────────────────── */}
        {step === "organization" && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h1 className="text-xl font-semibold tracking-tight">Tell us about your institution</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This determines the academic structure we set up for you.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="legalName">Institution name</Label>
                <Input
                  id="legalName" value={org.legalName}
                  onChange={(e) => {
                    const legalName = e.target.value;
                    setOrg((o) => ({
                      ...o,
                      legalName,
                      // Only auto-fill while the user has not typed their own.
                      slug: o.slug && o.slug !== slugify(o.legalName) ? o.slug : slugify(legalName),
                    }));
                  }}
                  placeholder="Acme Academy"
                />
              </div>

              <div>
                <Label htmlFor="slug">Your web address</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="slug" value={org.slug}
                    onChange={(e) => setOrg({ ...org, slug: slugify(e.target.value) })}
                    aria-describedby="slug-help"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">.smartark.ai</span>
                </div>
                <p id="slug-help" className="mt-1 text-[11px]">
                  {slugState.checking ? (
                    <span className="text-muted-foreground">Checking availability…</span>
                  ) : slugState.available === true ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {org.slug}.smartark.ai is available
                    </span>
                  ) : slugState.reason ? (
                    <span className="text-destructive">{slugState.reason}</span>
                  ) : (
                    <span className="text-muted-foreground">Lowercase letters, digits and hyphens.</span>
                  )}
                </p>
              </div>

              <div>
                <Label>Institution type</Label>
                <Select
                  value={org.institutionType}
                  onValueChange={(v) => setOrg({ ...org, institutionType: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSTITUTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  K-12 starts with LKG–Class 12; coaching starts with Classes 8–12. You can
                  change these later.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Country</Label>
                  <Select value={org.country} onValueChange={(v) => setOrg({ ...org, country: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN">India</SelectItem>
                      <SelectItem value="AE">United Arab Emirates</SelectItem>
                      <SelectItem value="SG">Singapore</SelectItem>
                      <SelectItem value="GB">United Kingdom</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Select value={org.timezone} onValueChange={(v) => setOrg({ ...org, timezone: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                      <SelectItem value="Asia/Singapore">Asia/Singapore</SelectItem>
                      <SelectItem value="Europe/London">Europe/London</SelectItem>
                      <SelectItem value="America/New_York">America/New_York</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Button
              className="mt-6 w-full"
              onClick={provision}
              disabled={busy || !org.legalName || !org.slug || slugState.available !== true}
            >
              Create my organization <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* ── Provisioning ────────────────────────────────────────────── */}
        {step === "provisioning" && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Setting up your ERP</h1>
            <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm text-muted-foreground">
              {[
                "Creating your organization",
                "Setting up your first branch",
                "Opening the academic year",
                "Configuring roles and permissions",
                "Adding standards and subjects",
                "Preparing message templates",
              ].map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> {s}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted-foreground">
              All of it in one transaction — if any step fails, nothing is left half-built.
            </p>
          </div>
        )}

        {/* ── Done ────────────────────────────────────────────────────── */}
        {step === "done" && result && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <PartyPopper className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Your ERP is ready</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong>{result.slug}.smartark.ai</strong> is live, with your branch, academic
              year, roles and templates already in place.
            </p>
            <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-left text-sm">
              <p className="font-medium">First three things to do</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Import your students (bulk import handles duplicates)</li>
                <li>Add your staff and set their roles</li>
                <li>Mark attendance for one class</li>
              </ol>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Every WhatsApp and email automation is switched OFF by default — nothing
              reaches your parents until you decide it should.
            </p>
            <Button className="mt-6 w-full" onClick={enterApp}>
              Sign in to your ERP <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              You will be asked to sign in again so your session picks up your new organization.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
};

export default SignupPage;
