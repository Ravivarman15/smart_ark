// ──────────────────────────────────────────────────────────────────────────────
// COMMUNICATION CENTER  (Phase D) — route: /management/communication
//
// The primary communication surface. Replaces "open the right Send page and do
// the ERP's job by hand" with "see what the automation did".
//
// ┌── REGISTRY-DRIVEN, NOT HARDCODED ──────────────────────────────────────┐
// │ Every automation card is derived from AUTOMATION_EVENTS. There is no   │
// │ per-event component, no switch, no array of cards to maintain. A       │
// │ developer adding an entry to the registry gets a working card here     │
// │ with no UI change — which is the auto-discovery requirement, and is    │
// │ enforced by a gate rather than left to discipline.                     │
// └────────────────────────────────────────────────────────────────────────┘
//
// Every figure comes from the existing services (analytics, queue, settings,
// resolvers). Nothing is fabricated: a metric with no source renders as a dash.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Send, Zap, Search,
  MessageSquare, Mail, Ban, Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { AUTOMATION_EVENTS, AUTOMATION_CATEGORIES } from "../constants/automationEvents";
import type { AutomationSetting } from "../types/communication.types";
import { PROVIDER_TEMPLATES_BY_KEY } from "../constants/providerTemplates";
import { automationResolverService } from "../services/automationResolvers";
import { useAutomationSettings, useUpsertAutomationSetting } from "../hooks/useAutomationSettings";
import { useCommsAnalytics } from "../hooks/useCommsAnalytics";
import { useOrgCommsVars } from "../hooks/useOrgCommsVars";

// ── Small presentational pieces ─────────────────────────────────────────────

const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad";
  hint?: string;
}> = ({ label, value, icon: Icon, tone = "default", hint }) => (
  <div className="rounded-lg border border-border/60 bg-card/60 p-4">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          tone === "good" && "text-emerald-500",
          tone === "warn" && "text-amber-500",
          tone === "bad" && "text-destructive",
          tone === "default" && "text-muted-foreground",
        )}
      />
    </div>
    <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
    {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
  </div>
);

/**
 * Provider readiness for one template.
 *
 * Deliberately distinguishes "we have a template" from "the provider has
 * approved it". Claiming a template is live when Meta has not approved it is
 * how an unapproved send gets a WhatsApp number flagged.
 */
const ProviderBadge: React.FC<{ templateKey: string }> = ({ templateKey }) => {
  const t = PROVIDER_TEMPLATES_BY_KEY[templateKey];
  if (!t) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
        Existing template
      </span>
    );
  }
  const tone =
    t.status === "ACTIVE"
      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
      : t.status === "APPROVED"
      ? "bg-blue-500/12 text-blue-600 dark:text-blue-400"
      : t.status === "REJECTED"
      ? "bg-destructive/12 text-destructive"
      : "bg-amber-500/12 text-amber-600 dark:text-amber-400";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone)}>
      {t.status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
};

const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageSquare,
  email: Mail,
  both: Send,
};

// ── Page ────────────────────────────────────────────────────────────────────

const CommunicationCenterPage: React.FC = () => {
  const { data: settings, isLoading: settingsLoading } = useAutomationSettings();
  const upsert = useUpsertAutomationSetting();
  const { data: analytics, isLoading: analyticsLoading } = useCommsAnalytics({});
  const orgVars = useOrgCommsVars();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");

  const settingByKey = useMemo(() => {
    const m: Record<string, AutomationSetting | undefined> = {};
    for (const s of settings ?? []) m[s.eventKey] = s;
    return m;
  }, [settings]);

  /**
   * The automation list — derived, never hardcoded.
   *
   * `automatableEvents()` is the resolver registry's own key list, so an event
   * gaining a resolver is reflected here automatically too.
   */
  const automatable = useMemo(() => new Set(automationResolverService.automatableEvents()), []);

  const events = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return AUTOMATION_EVENTS.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!needle) return true;
      return (
        e.label.toLowerCase().includes(needle) ||
        e.key.toLowerCase().includes(needle) ||
        e.defaultTemplate.toLowerCase().includes(needle)
      );
    });
  }, [q, category]);

  const enabledCount = (settings ?? []).filter((s) => s.enabled).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-display font-semibold">Communication Center</h1>
        <p className="text-xs text-muted-foreground">
          {orgVars.org_name
            ? `Automated messaging for ${orgVars.org_name}`
            : "Automated messaging"}
        </p>
      </header>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {analyticsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Sent"
            value={analytics?.sent ?? "—"}
            icon={Send}
            hint="Accepted by the provider"
          />
          <Stat
            label="Delivered"
            value={analytics?.delivered ?? "—"}
            icon={CheckCircle2}
            tone="good"
          />
          <Stat
            label="Failed"
            value={analytics?.failed ?? "—"}
            icon={AlertTriangle}
            tone={(analytics?.failed ?? 0) > 0 ? "bad" : "default"}
          />
          <Stat
            label="Queued"
            value={analytics?.queued ?? "—"}
            icon={Clock}
            tone={(analytics?.queued ?? 0) > 0 ? "warn" : "default"}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Automations on"
          value={settingsLoading ? "—" : `${enabledCount} / ${AUTOMATION_EVENTS.length}`}
          icon={Zap}
        />
        <Stat
          label="Fully automatic"
          value={automatable.size}
          icon={Sparkles}
          hint="Resolve recipients and variables with no input"
        />
        <Stat
          label="Registered events"
          value={AUTOMATION_EVENTS.length}
          icon={Activity}
          hint="From the canonical registry"
        />
      </div>

      <Tabs defaultValue="automation">
        <TabsList>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* ── Automation ─────────────────────────────────────────────────── */}
        <TabsContent value="automation" className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search events or templates"
                className="pl-9"
                aria-label="Search automation events"
              />
            </div>
            {/* Categories derived from the registry too — a new category needs
                no code change here. */}
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {["all", ...AUTOMATION_CATEGORIES].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "h-9 shrink-0 whitespace-nowrap rounded-md border px-3 text-[13px] transition-colors",
                    category === c
                      ? "border-accent/40 bg-accent/12 font-medium text-accent"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          </div>

          {settingsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : events.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No events match “{q}”.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => {
                const setting = settingByKey[e.key];
                const enabled = setting?.enabled ?? e.defaultEnabled ?? false;
                const ChannelIcon = CHANNEL_ICON[setting?.channel ?? e.defaultChannel] ?? Send;
                const isAuto = automatable.has(e.key);
                return (
                  <li
                    key={e.key}
                    className="rounded-lg border border-border/60 bg-card/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{e.label}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {e.category}
                          </span>
                          {isAuto ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <Sparkles className="h-2.5 w-2.5" /> Fully automatic
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              Trigger-supplied
                            </span>
                          )}
                          <ProviderBadge templateKey={e.defaultTemplate} />
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                          {e.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <ChannelIcon className="h-3 w-3" />
                            {setting?.channel ?? e.defaultChannel}
                          </span>
                          <span>Template: <code>{e.defaultTemplate}</code></span>
                          <span>{e.kind === "scheduled" ? "Scheduled" : "On event"}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Switch
                          checked={enabled}
                          disabled={upsert.isPending}
                          aria-label={`${e.label} automation`}
                          onCheckedChange={(v) =>
                            // Spread the EXISTING setting so a toggle never
                            // silently resets a quiet-hours window or a
                            // channel the organization deliberately changed.
                            // Registry values are only the fallback for an
                            // event that has no row yet.
                            upsert.mutate({
                              ...(setting ?? {}),
                              eventKey: e.key,
                              enabled: v,
                              channel: setting?.channel ?? e.defaultChannel,
                              timing: setting?.timing ?? e.defaultTiming,
                              templateKey: setting?.templateKey ?? e.defaultTemplate,
                              priority: setting?.priority ?? 5,
                            })
                          }
                        />
                        <span
                          className={cn(
                            "text-[10px] font-medium",
                            enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                          )}
                        >
                          {enabled ? "ON" : "OFF"}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        {/* ── Templates ──────────────────────────────────────────────────── */}
        <TabsContent value="templates" className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Communication templates and their provider approval status
              </caption>
              <thead className="border-b border-border/60 bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Template</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Event</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Channel</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Campaign</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Provider status</th>
                </tr>
              </thead>
              <tbody>
                {AUTOMATION_EVENTS.map((e) => {
                  const pt = PROVIDER_TEMPLATES_BY_KEY[e.defaultTemplate];
                  return (
                    <tr key={e.key} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2 font-medium">
                        <code className="text-xs">{e.defaultTemplate}</code>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        <code className="text-xs">{e.key}</code>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{e.defaultChannel}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {/* The campaign actually posted today. Pre-cutover this
                            is the LEGACY one, and saying so is the point. */}
                        {pt ? (pt.status === "ACTIVE" ? pt.campaign : pt.legacyCampaign) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <ProviderBadge templateKey={e.defaultTemplate} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Ban className="mt-0.5 h-3 w-3 shrink-0" />
            A template is only sent under its organization-neutral campaign once its
            status is <strong>active</strong> — meaning the provider approved it and a
            test send was verified. Every other status still posts the legacy campaign,
            which carries the original institution's branding.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CommunicationCenterPage;
