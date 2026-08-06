import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Power, RefreshCw } from "lucide-react";
import {
  PageHeader, StatTile, StatusPill, LoadingBlock, EmptyState, formatBytes,
} from "../components/PlatformShell";
import {
  useOrganizationDetail, useSetOrganizationStatus, useRefreshMetrics,
  useOrganizationFeatures, useSetFeature,
} from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { ImpersonationDialog } from "../components/ImpersonationDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";
import { useConfirm } from "@/components/ui/confirm-dialog";

const OrganizationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useOrganizationDetail(id);
  const { data: features } = useOrganizationFeatures(id);
  const { can } = usePlatformAuth();
  const setStatus = useSetOrganizationStatus();
  const setFeature = useSetFeature();
  const refresh = useRefreshMetrics();
  const confirm = useConfirm();
  const [impersonateOpen, setImpersonateOpen] = useState(false);

  if (isLoading) return <LoadingBlock />;
  if (!data) return <EmptyState title="Organization not found" />;

  const org = (data.organization ?? {}) as Record<string, unknown>;
  const sub = (data.subscription ?? null) as Record<string, unknown> | null;
  const metrics = (data.metrics_today ?? {}) as Record<string, unknown>;
  const members = (data.members ?? {}) as Record<string, number>;
  const branches = (data.branches ?? []) as Record<string, unknown>[];
  const audit = (data.recent_audit ?? []) as Record<string, unknown>[];
  const impersonations = (data.impersonations ?? []) as Record<string, unknown>[];
  const status = String(org.status ?? "");

  const changeStatus = async (next: string) => {
    const ok = await confirm({
      title: `Set organization to "${next}"?`,
      description:
        next === "suspended"
          ? "Users will keep their logins but the ERP becomes inaccessible. No data is deleted."
          : next === "cancelled"
          ? "This is a SOFT delete. Data is retained and every organization_id foreign key is ON DELETE RESTRICT, so nothing is destroyed."
          : "The organization returns to normal operation.",
      confirmText: "Confirm",
    });
    if (ok && id) setStatus.mutate({ id, status: next });
  };

  return (
    <div>
      <PageHeader
        title={String(org.display_name ?? "Organization")}
        description={`${org.slug} · ${org.institution_type ?? ""} · created ${String(org.created_at ?? "").slice(0, 10)}`}
        actions={
          <>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/platform/organizations"><ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => refresh.mutate(id)} disabled={refresh.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? "animate-spin" : ""}`} /> Metrics
            </Button>
            {can("impersonate") && (
              <Button size="sm" variant="outline" onClick={() => setImpersonateOpen(true)}>
                <ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> Impersonate
              </Button>
            )}
            {can("organizations.manage") && (
              <Button
                size="sm"
                variant={status === "suspended" ? "default" : "destructive"}
                onClick={() => changeStatus(status === "suspended" ? "active" : "suspended")}
              >
                <Power className="h-3.5 w-3.5 mr-1.5" />
                {status === "suspended" ? "Activate" : "Suspend"}
              </Button>
            )}
          </>
        }
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          {sub && <span className="text-xs text-muted-foreground">Plan: {String(sub.plan_code ?? "—")}</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Students" value={Number(metrics.students ?? 0).toLocaleString("en-IN")} />
          <StatTile label="Active" value={Number(metrics.active_students ?? 0).toLocaleString("en-IN")} />
          <StatTile label="Staff" value={Number(members.staff ?? metrics.staff ?? 0)} />
          <StatTile label="Parents" value={Number(members.parent ?? metrics.parents ?? 0)} />
          <StatTile label="Branches" value={branches.length} />
          <StatTile label="Storage" value={formatBytes(Number(metrics.storage_bytes ?? 0))} />
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="features">Feature flags</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
            <TabsTrigger value="access">Access history</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <div className="font-medium mb-2">Organization</div>
                {([
                  ["Slug", org.slug], ["Legal name", org.legal_name],
                  ["Country", org.country], ["Timezone", org.timezone],
                  ["Currency", org.currency], ["Locale", org.locale],
                  ["Provisioned", String(org.provisioned_at ?? "—").slice(0, 19).replace("T", " ")],
                ] as [string, unknown][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-right">{String(v ?? "—")}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <div className="font-medium mb-2">Subscription</div>
                {sub ? (
                  ([
                    ["Plan", sub.plan_code], ["Status", sub.status],
                    ["Trial ends", String(sub.trial_ends_at ?? "—").slice(0, 10)],
                    ["Period end", String(sub.current_period_end ?? "—")],
                    ["Seats limit", sub.seats_limit ?? "—"],
                    ["Students limit", sub.students_limit ?? "—"],
                  ] as [string, unknown][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-right">{String(v ?? "—")}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No subscription record.</p>
                )}
              </div>
            </div>

            {/* Membership is shown as COUNTS. Listing names and emails of a
                customer's staff on a platform screen is exactly the exposure
                impersonation exists to gate. */}
            <div className="mt-4 rounded-lg border border-border p-4">
              <div className="text-sm font-medium mb-2">Members</div>
              <div className="flex gap-6 text-sm">
                {["staff", "parent", "student"].map((k) => (
                  <div key={k}>
                    <div className="text-muted-foreground text-xs capitalize">{k}</div>
                    <div className="text-lg font-semibold tabular-nums">{members[k] ?? 0}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Counts only. Member identities are tenant data and are reachable
                solely through an audited impersonation session.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="features" className="mt-4">
            <div className="rounded-lg border border-border divide-y divide-border">
              {MODULE_CATALOG.map((m) => {
                const enabled = features?.[m.id] ?? false;
                return (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-[11px] text-muted-foreground">{m.id}</div>
                    </div>
                    <Switch
                      checked={enabled}
                      disabled={!can("feature_flags.manage") || setFeature.isPending}
                      onCheckedChange={(v) =>
                        id && setFeature.mutate({ orgId: id, key: m.id, enabled: v })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Overrides the plan default. `feature_key` is the RBAC ModuleId — one
              vocabulary shared by plans, overrides and the sidebar resolver.
            </p>
          </TabsContent>

          <TabsContent value="branches" className="mt-4">
            {branches.length === 0 ? (
              <EmptyState title="No branches recorded" />
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border">
                {branches.map((b) => (
                  <div key={String(b.id)} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm">{String(b.name)}</span>
                    {b.is_primary ? (
                      <span className="text-[11px] text-muted-foreground">Primary</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            {audit.length === 0 ? (
              <EmptyState title="No platform actions recorded for this organization" />
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                {audit.map((a, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{String(a.action)}</div>
                      {a.detail ? (
                        <div className="text-xs text-muted-foreground">{String(a.detail)}</div>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <div>{String(a.actor_email ?? "—")}</div>
                      <div>{String(a.created_at ?? "").slice(0, 19).replace("T", " ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="access" className="mt-4">
            {impersonations.length === 0 ? (
              <EmptyState
                title="No impersonation sessions"
                description="Every platform access to this tenant's data would appear here."
              />
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                {impersonations.map((g, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{String(g.reason)}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(g.started_at ?? "").slice(0, 19).replace("T", " ")} →{" "}
                        {g.ended_at
                          ? String(g.ended_at).slice(11, 19)
                          : `expires ${String(g.expires_at ?? "").slice(11, 19)}`}
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {g.ended_at ? "Ended" : "Active"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {id && (
        <ImpersonationDialog
          open={impersonateOpen}
          onOpenChange={setImpersonateOpen}
          organizationId={id}
          organizationName={String(org.display_name ?? "")}
        />
      )}
    </div>
  );
};

export default OrganizationDetailPage;
