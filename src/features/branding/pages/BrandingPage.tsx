// ──────────────────────────────────────────────────────────────────────────────
// WHITE-LABEL SETTINGS
//
// Where an organization makes the ERP feel like theirs: identity, theme,
// marketplace, custom domain, and — the part that matters most operationally —
// whether they send on Smart ARK's credentials or their own.
//
// ┌── THE DEFAULT THIS PAGE MAKES VISIBLE ─────────────────────────────────┐
// │ Every organization sends on the PLATFORM's WhatsApp and email account  │
// │ until it deliberately connects its own. This page states that plainly  │
// │ rather than showing an empty "not configured" state that reads like    │
// │ something is broken — because nothing is. It works out of the box.     │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Palette, Globe, Mail, MessageSquare, Store, CheckCircle2, AlertTriangle,
  Loader2, Lock, Copy, RefreshCw, Server,
} from "lucide-react";
import { toast } from "sonner";
import { brandingService, type BrandingBundle } from "../services/branding.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-fA-F]{6}$/;

const BrandingPage: React.FC = () => {
  const qc = useQueryClient();

  const { data: bundle, isLoading } = useQuery({
    queryKey: ["branding", "bundle"],
    queryFn: () => brandingService.bundle(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading branding…
      </div>
    );
  }
  if (!bundle) {
    return <div className="p-10 text-sm text-muted-foreground">Branding is unavailable.</div>;
  }

  const canWhiteLabel = bundle.entitlements?.white_label ?? false;
  const canCustomDomain = bundle.entitlements?.custom_domain ?? false;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Branding &amp; White Label</h1>
        <p className="text-sm text-muted-foreground">{bundle.organization.name}</p>
      </div>

      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="theme">Theme</TabsTrigger>
          <TabsTrigger value="senders">Email &amp; WhatsApp</TabsTrigger>
          <TabsTrigger value="domain">Domain</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="mt-4">
          <IdentityTab bundle={bundle} canWhiteLabel={canWhiteLabel} />
        </TabsContent>
        <TabsContent value="theme" className="mt-4">
          <ThemeTab />
        </TabsContent>
        <TabsContent value="senders" className="mt-4">
          <SendersTab bundle={bundle} />
        </TabsContent>
        <TabsContent value="domain" className="mt-4">
          <DomainTab bundle={bundle} canCustomDomain={canCustomDomain} />
        </TabsContent>
        <TabsContent value="marketplace" className="mt-4">
          <MarketplaceTab onInstalled={() => qc.invalidateQueries({ queryKey: ["branding"] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ── Identity ────────────────────────────────────────────────────────────────

const IdentityTab: React.FC<{ bundle: BrandingBundle; canWhiteLabel: boolean }> = ({
  bundle, canWhiteLabel,
}) => {
  const qc = useQueryClient();
  const b = (bundle.branding ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState({
    app_name: String(b.app_name ?? ""),
    portal_name: String(b.portal_name ?? ""),
    support_email: String(b.support_email ?? ""),
    support_phone: String(b.support_phone ?? ""),
    website_url: String(b.website_url ?? ""),
    login_greeting: String(b.login_greeting ?? ""),
    custom_footer: String(b.custom_footer ?? ""),
    custom_copyright: String(b.custom_copyright ?? ""),
    default_language: String(b.default_language ?? "en"),
    powered_by_hidden: Boolean(b.powered_by_hidden),
  });

  const save = useMutation({
    mutationFn: () => brandingService.saveBranding(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branding"] });
      qc.invalidateQueries({ queryKey: ["organization-branding"] });
      toast.success("Branding saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-lg border border-border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="app_name">Application name</Label>
          <Input id="app_name" value={form.app_name}
            onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
          <p className="mt-1 text-[11px] text-muted-foreground">Shown in the browser tab.</p>
        </div>
        <div>
          <Label htmlFor="portal_name">Portal name</Label>
          <Input id="portal_name" value={form.portal_name}
            onChange={(e) => setForm({ ...form, portal_name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="support_email">Support email</Label>
          <Input id="support_email" type="email" value={form.support_email}
            onChange={(e) => setForm({ ...form, support_email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="support_phone">Support phone</Label>
          <Input id="support_phone" value={form.support_phone}
            onChange={(e) => setForm({ ...form, support_phone: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="website_url">Website</Label>
          <Input id="website_url" value={form.website_url}
            onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
        </div>
        <div>
          <Label>Default language</Label>
          <Select value={form.default_language}
            onValueChange={(v) => setForm({ ...form, default_language: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ta">தமிழ் — Tamil</SelectItem>
              <SelectItem value="hi">हिन्दी — Hindi</SelectItem>
              <SelectItem value="kn">ಕನ್ನಡ — Kannada</SelectItem>
              <SelectItem value="ml">മലയാളം — Malayalam</SelectItem>
              <SelectItem value="te">తెలుగు — Telugu</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Applies to message templates. Interface translation is not yet available.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="login_greeting">Login screen greeting</Label>
          <Input id="login_greeting" value={form.login_greeting}
            placeholder="Welcome back to Acme Academy"
            onChange={(e) => setForm({ ...form, login_greeting: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="custom_footer">Footer text</Label>
          <Input id="custom_footer" value={form.custom_footer}
            onChange={(e) => setForm({ ...form, custom_footer: e.target.value })} />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            Hide “Powered by Smart ARK”
            {!canWhiteLabel && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {canWhiteLabel
              ? "Removes our attribution from every portal your users see."
              : "Available on Growth and above. Upgrade to remove our attribution."}
          </p>
        </div>
        <Switch
          checked={form.powered_by_hidden && canWhiteLabel}
          disabled={!canWhiteLabel}
          onCheckedChange={(v) => setForm({ ...form, powered_by_hidden: v })}
        />
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save
      </Button>
    </div>
  );
};

// ── Theme ───────────────────────────────────────────────────────────────────

const ThemeTab: React.FC = () => {
  const qc = useQueryClient();
  const { data: themes } = useQuery({
    queryKey: ["branding", "themes"],
    queryFn: () => brandingService.themes(),
  });

  const [draft, setDraft] = useState({ primary: "#2563eb", secondary: "#0ea5e9", accent: "#06b6d4" });
  const [name, setName] = useState("");

  const saveTheme = useMutation({
    mutationFn: () => brandingService.saveTheme(name || "Custom", draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branding"] });
      toast.success("Theme saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: (id: string) => brandingService.activateTheme(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branding"] });
      qc.invalidateQueries({ queryKey: ["organization-branding"] });
      toast.success("Theme applied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid = Object.values(draft).some((c) => !HEX.test(c));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Saved themes</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(themes ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => activate.mutate(t.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                t.isActive ? "border-primary" : "border-border",
              )}
            >
              <span className="flex gap-1">
                {["primary", "secondary", "accent"].map((k) => (
                  <span key={k} className="h-6 w-6 rounded"
                    style={{ background: String(t.tokens[k] ?? "#e5e7eb") }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t.isActive ? "Active" : t.source}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Build a theme</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          {(["primary", "secondary", "accent"] as const).map((k) => (
            <div key={k}>
              <Label htmlFor={k} className="capitalize">{k}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color" value={draft[k]} aria-label={`${k} colour`}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border"
                />
                <Input id={k} value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              </div>
            </div>
          ))}
          <div>
            <Label htmlFor="theme-name">Name</Label>
            <Input id="theme-name" value={name} placeholder="Acme Blue"
              onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {/* Live preview using the same tokens the runtime engine writes, so
            what you see here is what the ERP will actually render. */}
        <div className="mt-4 rounded-lg border border-border p-4"
             style={{ ["--preview" as string]: draft.primary }}>
          <div className="text-xs text-muted-foreground">Preview</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: draft.primary }}>Primary button</span>
            <span className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: draft.secondary }}>Secondary</span>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                  style={{ background: draft.accent }}>Badge</span>
          </div>
        </div>

        {invalid && (
          <p className="mt-2 text-xs text-destructive">
            Colours must be six-digit hex, like #2563eb.
          </p>
        )}

        <Button className="mt-4" onClick={() => saveTheme.mutate()}
          disabled={invalid || saveTheme.isPending}>
          Save theme
        </Button>
      </div>
    </div>
  );
};

// ── Senders ─────────────────────────────────────────────────────────────────

const SendersTab: React.FC<{ bundle: BrandingBundle }> = ({ bundle }) => {
  const qc = useQueryClient();
  const email = bundle.integrations?.email;
  const whatsapp = bundle.integrations?.whatsapp;

  const [provider, setProvider] = useState("brevo");
  const [apiKey, setApiKey] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [checkDomain, setCheckDomain] = useState("");

  const testEmail = useMutation({
    mutationFn: () => brandingService.testEmailProvider({
      provider, apiKey,
      config: { sender_email: senderEmail, sender_name: senderName },
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["branding"] });
      if (r.ok) toast.success("Connected", { description: r.detail });
      else toast.error("Not connected", { description: r.detail, duration: 8000 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dnsCheck = useMutation({
    mutationFn: () => brandingService.checkEmailDns(checkDomain),
    onError: (e: Error) => toast.error(e.message),
  });

  const usePlatform = useMutation({
    mutationFn: (channel: "email" | "whatsapp") => brandingService.usePlatformSender(channel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branding"] });
      toast.success("Switched back to Smart ARK's sender");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const Status: React.FC<{ mode?: string; label: string; icon: React.ComponentType<{ className?: string }> }> =
    ({ mode, label, icon: Icon }) => (
      <div className="flex items-start gap-3 rounded-lg border border-border p-4">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          {mode === "custom" ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Sending from your own account
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Using Smart ARK&apos;s account — <strong>nothing to configure</strong>. Messages
              send from our verified sender until you connect your own.
            </p>
          )}
        </div>
        {mode === "custom" && (
          <Button size="sm" variant="ghost"
            onClick={() => usePlatform.mutate(label.toLowerCase().includes("whats") ? "whatsapp" : "email")}>
            Use ours
          </Button>
        )}
      </div>
    );

  return (
    <div className="space-y-4">
      <Status mode={email?.mode} label="Email" icon={Mail} />
      <Status mode={whatsapp?.mode} label="WhatsApp" icon={MessageSquare} />

      <div className="rounded-lg border border-border p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Server className="h-4 w-4" /> Connect your own email provider
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. Messages will come from your domain instead of ours. Your credentials
          are stored encrypted and are never readable from the browser — not even by you.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brevo">Brevo</SelectItem>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
                <SelectItem value="smtp">Custom SMTP</SelectItem>
                <SelectItem value="google">Google Workspace</SelectItem>
                <SelectItem value="microsoft">Microsoft 365</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="api-key">
              {["smtp", "google", "microsoft"].includes(provider) ? "Password" : "API key"}
            </Label>
            <Input id="api-key" type="password" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sender-email">Sender address</Label>
            <Input id="sender-email" type="email" value={senderEmail}
              placeholder="no-reply@yourschool.com"
              onChange={(e) => setSenderEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sender-name">Sender name</Label>
            <Input id="sender-name" value={senderName}
              onChange={(e) => setSenderName(e.target.value)} />
          </div>
        </div>

        <Button className="mt-4" onClick={() => testEmail.mutate()}
          disabled={testEmail.isPending || !apiKey || !senderEmail}>
          {testEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Test &amp; connect
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          We verify the credentials before switching. Until they verify, your messages keep
          sending from Smart ARK — a half-configured sender never silently swallows mail.
        </p>
      </div>

      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Check your email DNS</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          SPF, DKIM and DMARC decide whether your mail reaches the inbox or the spam folder.
        </p>
        <div className="mt-3 flex gap-2">
          <Input value={checkDomain} placeholder="yourschool.com"
            onChange={(e) => setCheckDomain(e.target.value)} />
          <Button variant="outline" onClick={() => dnsCheck.mutate()}
            disabled={!checkDomain || dnsCheck.isPending}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", dnsCheck.isPending && "animate-spin")} />
            Check
          </Button>
        </div>

        {dnsCheck.data && (
          <div className="mt-4 space-y-2 text-sm">
            {(["spf", "dkim", "dmarc"] as const).map((k) => {
              const r = dnsCheck.data![k];
              return (
                <div key={k} className="flex items-start gap-2">
                  {r.present
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                  <span>
                    <strong className="uppercase">{k}</strong>{" "}
                    {r.present ? "configured" : "missing"}
                    {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                  </span>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-muted-foreground">
              Deliverability: <strong>{dnsCheck.data.deliverability}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Domain ──────────────────────────────────────────────────────────────────

const DomainTab: React.FC<{ bundle: BrandingBundle; canCustomDomain: boolean }> = ({
  bundle, canCustomDomain,
}) => {
  const qc = useQueryClient();
  const [host, setHost] = useState("");
  const [portal, setPortal] = useState("main");
  const [records, setRecords] = useState<{ type: string; name: string; value: string }[] | null>(null);

  const request = useMutation({
    mutationFn: () => brandingService.requestDomain(host, portal),
    onSuccess: (r) => {
      setRecords(r.records);
      qc.invalidateQueries({ queryKey: ["branding"] });
      toast.success("Domain added — now create these DNS records");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: (id: string) => brandingService.verifyDomain(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["branding"] });
      if (r.status === "verified") toast.success("Domain verified", { description: r.note });
      else toast.info("Not verified yet", { description: r.note, duration: 8000 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canCustomDomain) {
    return (
      <div className="rounded-lg border border-border p-6 text-center">
        <Globe className="mx-auto h-7 w-7 text-muted-foreground" />
        <h2 className="mt-3 font-medium">Custom domains are a Professional feature</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Your organization is currently reachable at{" "}
          <strong>{bundle.organization.slug}.smartark.ai</strong>, which works fully.
          Upgrade to use your own hostname.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Your domains</h2>
        <div className="mt-3 divide-y divide-border">
          {(bundle.domains ?? []).map((d) => (
            <div key={d.host} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{d.host}</div>
                <div className="text-[11px] text-muted-foreground">
                  {d.kind} · {d.portal ?? "main"} · SSL {d.ssl_status}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn(
                  "text-xs",
                  d.status === "verified" ? "text-emerald-600 dark:text-emerald-400"
                  : d.status === "failed" ? "text-destructive" : "text-muted-foreground",
                )}>
                  {d.status}
                </span>
                {d.kind === "custom" && d.status !== "verified" && (
                  <Button size="sm" variant="outline" onClick={() => verify.mutate(d.id)}>
                    Verify
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Add a custom domain</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr,1fr,auto] sm:items-end">
          <div>
            <Label htmlFor="host">Hostname</Label>
            <Input id="host" value={host} placeholder="erp.yourschool.com"
              onChange={(e) => setHost(e.target.value.toLowerCase())} />
          </div>
          <div>
            <Label>Portal</Label>
            <Select value={portal} onValueChange={setPortal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["main", "admin", "management", "teacher", "parent", "student"].map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => request.mutate()} disabled={!host || request.isPending}>
            Add
          </Button>
        </div>

        {records && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">Create these DNS records</p>
            <div className="mt-2 space-y-2">
              {records.map((r, i) => (
                <div key={i} className="rounded border border-border bg-background p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">{r.type}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        void navigator.clipboard.writeText(r.value);
                        toast.success("Copied");
                      }}
                      aria-label={`Copy ${r.type} value`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 break-all font-mono text-muted-foreground">
                    {r.name} → {r.value}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              DNS usually propagates in 5–30 minutes. Press Verify once the records are live.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Marketplace ─────────────────────────────────────────────────────────────

const MarketplaceTab: React.FC<{ onInstalled: () => void }> = ({ onInstalled }) => {
  const { data: items, isLoading } = useQuery({
    queryKey: ["branding", "marketplace"],
    queryFn: () => brandingService.marketplace(),
    staleTime: 5 * 60_000,
  });

  const install = useMutation({
    mutationFn: (id: string) => brandingService.install(id),
    onSuccess: (r) => {
      onInstalled();
      toast.success("Installed", { description: `${r.applied} item(s) applied` });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(items ?? []).map((i) => (
          <div key={i.id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{i.name}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {i.kind.replace("_", " ")}
                </div>
              </div>
              {i.tier !== "free" && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize">
                  {i.tier}
                </span>
              )}
            </div>
            {i.description && (
              <p className="mt-1.5 text-xs text-muted-foreground">{i.description}</p>
            )}
            {i.tokens && (
              <div className="mt-3 flex gap-1">
                {["primary", "secondary", "accent"].map((k) =>
                  i.tokens?.[k] ? (
                    <span key={k} className="h-5 w-5 rounded"
                      style={{ background: String(i.tokens[k]) }} />
                  ) : null,
                )}
              </div>
            )}
            <Button size="sm" variant="outline" className="mt-3 w-full"
              onClick={() => install.mutate(i.id)}
              disabled={install.isPending || i.installed}>
              {i.installed ? "Installed" : "Install"}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <Store className="mr-1 inline h-3 w-3" />
        Every item is published and maintained by Smart ARK. Installing copies it into your
        organization, so later edits are yours and are never overwritten by an update.
      </p>
    </div>
  );
};

export default BrandingPage;
