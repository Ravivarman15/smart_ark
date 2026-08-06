// ──────────────────────────────────────────────────────────────────────────────
// ONBOARDING CHECKLIST
//
// The first-run panel a new organization sees. It also renders live
// provisioning progress while background steps are still running, so a
// customer who signs in seconds after registering sees "setting up your
// templates" rather than an unexplained gap where a feature should be.
//
// ┌── THE CHECKLIST IS DERIVED, NOT SELF-REPORTED ─────────────────────────┐
// │ refresh_onboarding_checklist() ticks items by looking at what actually │
// │ exists — are there students, has attendance been marked, is a fee      │
// │ structure configured. A checklist the user ticks themselves measures   │
// │ optimism; this measures the account.                                   │
// │                                                                        │
// │ That also makes it useful to customer success: "students: false after  │
// │ 5 days" is a real signal, whereas an untouched self-report is not.     │
// └────────────────────────────────────────────────────────────────────────┘
//
// ADDITIVE: this is a component a host page renders. It registers no route and
// touches no existing module, so the ERP is unchanged unless someone mounts it.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Loader2, X, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/core/tenant/OrganizationProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  order: number;
  href?: string;
}

interface ProvisioningProgress {
  status: string;
  total: number;
  completed: number;
  failed: number;
  steps: { key: string; label: string; status: string }[] | null;
}

const onboardingKey = (org: string | null) => ["onboarding-checklist", org ?? "none"] as const;
const provisioningKey = (org: string | null) => ["provisioning-progress", org ?? "none"] as const;

export const OnboardingChecklist: React.FC<{ className?: string }> = ({ className }) => {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();

  const { data: checklist, isLoading } = useQuery({
    queryKey: onboardingKey(organizationId),
    queryFn: async () => {
      // Recomputes from live data on every load — cheap (a handful of EXISTS
      // probes) and always accurate, which a cached value would not be.
      const { data, error } = await supabase.rpc("refresh_onboarding_checklist" as never);
      if (error) return null;
      const payload = data as unknown as { items: Record<string, ChecklistItem>; completed: number };
      return payload ?? null;
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const { data: provisioning } = useQuery({
    queryKey: provisioningKey(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("provisioning_progress" as never);
      if (error) return null;
      return data as unknown as ProvisioningProgress | null;
    },
    enabled: !!organizationId,
    // Poll only while a job is actually in flight; a completed job needs no
    // polling and this panel is on a dashboard people leave open all day.
    refetchInterval: (q) => {
      const d = q.state.data as ProvisioningProgress | null | undefined;
      return d && ["queued", "running"].includes(d.status) ? 3_000 : false;
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("organization_onboarding" as never)
        .update({ dismissed_at: new Date().toISOString() } as never)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKey(organizationId) }),
  });

  const items = useMemo<ChecklistItem[]>(() => {
    if (!checklist?.items) return [];
    return Object.entries(checklist.items)
      .map(([key, v]) => ({ ...v, key }))
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }, [checklist]);

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  if (isLoading || !organizationId) return null;
  // Nothing left to nag about.
  if (total > 0 && done === total) return null;
  if (items.length === 0) return null;

  const provisioningActive =
    provisioning && ["queued", "running"].includes(provisioning.status);

  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Finish setting up
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {done} of {total} done — each one takes a couple of minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => dismiss.mutate()}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss setup checklist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Live provisioning — only while background steps are still running. */}
      {provisioningActive && (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Setting up your workspace
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {provisioning!.completed} of {provisioning!.total} steps done. Your ERP is
            already usable — templates, dashboards and report presets are being added
            in the background.
          </p>
        </div>
      )}

      {provisioning?.status === "failed" && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          Some optional setup steps did not complete. Everything essential is in place
          and our team has been notified — nothing is blocked.
        </div>
      )}

      <ul className="mt-4 space-y-1">
        {items.map((item) => {
          const content = (
            <>
              {item.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn("flex-1", item.done && "text-muted-foreground line-through")}>
                {item.label}
              </span>
              {!item.done && item.href && (
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </>
          );

          return (
            <li key={item.key}>
              {item.href && !item.done ? (
                <Link
                  to={item.href}
                  className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  {content}
                </Link>
              ) : (
                <span className="flex items-start gap-2.5 px-2 py-1.5 text-sm">{content}</span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Items tick themselves as you complete them — this is read from your account,
        not something you mark off.
      </p>
    </div>
  );
};

/** Compact variant for a sidebar or header slot. */
export const OnboardingProgressBadge: React.FC = () => {
  const { organizationId } = useOrganization();
  const { data } = useQuery({
    queryKey: onboardingKey(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("refresh_onboarding_checklist" as never);
      if (error) return null;
      return data as unknown as { items: Record<string, ChecklistItem>; completed: number };
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  if (!data?.items) return null;
  const total = Object.keys(data.items).length;
  const done = data.completed ?? 0;
  if (done >= total) return null;

  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/">
        Setup {done}/{total}
      </Link>
    </Button>
  );
};
