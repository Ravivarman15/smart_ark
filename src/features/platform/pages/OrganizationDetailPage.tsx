import React, { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, ShieldAlert, RefreshCw, PauseCircle, PlayCircle, Archive, Ban, Trash2,
} from "lucide-react";
import {
  PageHeader, StatTile, StatusPill, LoadingBlock, EmptyState, formatBytes,
} from "../components/PlatformShell";
import {
  useOrganizationDetail, useRefreshMetrics, useProtections,
  useUpdateOrganizationProfile, useRequestDelete, useDeleteRequests, useReviewDelete,
} from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { ImpersonationDialog } from "../components/ImpersonationDialog";
import { LifecycleDialog, type LifecycleAction } from "../components/LifecycleDialog";
import { PurgeOrganizationDialog } from "../components/PurgeOrganizationDialog";
import { ModuleEntitlementsPanel } from "../components/ModuleEntitlementsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/** Platform-owned fields. Deliberately none of the tenant's business data. */
const PROFILE_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "display_name", label: "Display name" },
  { key: "legal_name", label: "Legal name" },
  { key: "contact_name", label: "Primary contact" },
  { key: "contact_email", label: "Contact email", placeholder: "billing@school.edu" },
  { key: "contact_phone", label: "Contact phone" },
  { key: "website", label: "Website", placeholder: "https://…" },
  { key: "country", label: "Country" },
  { key: "state", label: "State / region" },
  { key: "support_email", label: "Support email" },
];

/**
 * Usage against a plan limit.
 *
 * A null limit means "unlimited"; a null USAGE means the metric has not been
 * computed. Those are different facts and the second one prints an em dash
 * rather than a zero — a fabricated 0% would read as "this customer is not
 * using the product", which is a conclusion nobody should draw from a metrics
 * job that has not run.
 */
const UsageBar: React.FC<{ label: string; used: number | null; limit: number | null; format?: (n: number) => string }> = ({
  label, used, limit, format = (n) => n.toLocaleString("en-IN"),
}) => {
  if (used == null) {
    return (
      <div className="rounded-lg border border-border p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-sm">—</div>
        <div className="text-[11px] text-muted-foreground">Data unavailable</div>
      </div>
    );
  }
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const tone = pct == null ? "bg-muted-foreground/30"
    : pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm tabular-nums">
        {format(used)}{limit ? ` / ${format(limit)}` : ""}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${pct ?? 4}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {pct == null ? "No plan limit" : `${pct}% of limit`}
      </div>
    </div>
  );
};

const OrganizationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useOrganizationDetail(id);
  const { data: protections } = useProtections();
  const { data: deleteRequests } = useDeleteRequests();
  const { can } = usePlatformAuth();
  const refresh = useRefreshMetrics();
  const saveProfile = useUpdateOrganizationProfile();
  const requestDelete = useRequestDelete();
  const reviewDelete = useReviewDelete();

  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleAction | null>(null);
  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [purgeOpen, setPurgeOpen] = useState(false);

  const org = (data?.organization ?? {}) as Record<string, unknown>;
  const sub = (data?.subscription ?? null) as Record<string, unknown> | null;
  const metrics = (data?.metrics_today ?? {}) as Record<string, unknown>;
  const members = (data?.members ?? {}) as Record<string, number>;
  const branches = (data?.branches ?? []) as Record<string, unknown>[];
  const audit = (data?.recent_audit ?? []) as Record<string, unknown>[];
  const impersonations = (data?.impersonations ?? []) as Record<string, unknown>[];

  const status = String(org.status ?? "");
  const slug = String(org.slug ?? "");
  const isProtected = Boolean(id && protections?.has(id));
  const openRequest = useMemo(
    () => (deleteRequests ?? []).find((r) => r.organizationId === id && r.status === "pending_review"),
    [deleteRequests, id],
  );
  // An approved request is what unlocks the irreversible step. Kept separate
  // from `openRequest` so the pending and approved states can be shown
  // differently — they mean very different things.
  const approvedRequest = useMemo(
    () => (deleteRequests ?? []).find((r) => r.organizationId === id && r.status === "approved"),
    [deleteRequests, id],
  );

  const numeric = (v: unknown): number | null =>
    v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

  if (isLoading) return <LoadingBlock />;
  if (!data) return <EmptyState title="Organization not found" />;

  const isLive = ["active", "trialing", "past_due"].includes(status);

  const startEdit = () =>
    setProfile(
      Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, String(org[f.key] ?? "")])),
    );

  const commitProfile = () => {
    if (!id || !profile) return;
    saveProfile.mutate(
      {
        organizationId: id,
        patch: profile,
        // Optimistic concurrency: the server refuses if the row moved while
        // this form was open, rather than overwriting a colleague's edit.
        expectedUpdatedAt: String(org.updated_at ?? "") || null,
      },
      { onSuccess: () => setProfile(null) },
    );
  };

  return (
    <div>
      <PageHeader
        title={String(org.display_name ?? "Organization")}
        description={`${slug} · ${org.institution_type ?? ""} · created ${String(org.created_at ?? "").slice(0, 10)}`}
        actions={
          <>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/platform/organizations"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => refresh.mutate(id)} disabled={refresh.isPending}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} /> Metrics
            </Button>
            {can("impersonate") && (
              <Button size="sm" variant="outline" onClick={() => setImpersonateOpen(true)}>
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Impersonate
              </Button>
            )}
            {isLive
              ? can("organizations.hold") && (
                  <Button size="sm" variant="outline" onClick={() => setLifecycle("hold")}>
                    <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Hold
                  </Button>
                )
              : can("organizations.manage") && (
                  <Button size="sm" onClick={() => setLifecycle("active")}>
                    <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Restore
                  </Button>
                )}
          </>
        }
      />

      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={status} />
          {isProtected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-3 w-3" /> Protected
            </span>
          )}
          {sub && <span className="text-xs text-muted-foreground">Plan: {String(sub.plan_code ?? "—")}</span>}
          {org.status_reason ? (
            <span className="text-xs text-muted-foreground">· {String(org.status_reason)}</span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Students" value={Number(metrics.students ?? 0).toLocaleString("en-IN")} />
          <StatTile label="Active" value={Number(metrics.active_students ?? 0).toLocaleString("en-IN")} />
          <StatTile label="Staff" value={Number(members.staff ?? metrics.staff ?? 0)} />
          <StatTile label="Parents" value={Number(members.parent ?? metrics.parents ?? 0)} />
          <StatTile label="Branches" value={branches.length} />
          <StatTile label="Storage" value={formatBytes(Number(metrics.storage_bytes ?? 0))} />
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="audit">Activity</TabsTrigger>
            <TabsTrigger value="access">Access history</TabsTrigger>
            <TabsTrigger value="danger">Danger zone</TabsTrigger>
          </TabsList>

          {/* ── Overview ─────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Platform information</span>
                  {can("organizations.manage") && !profile && (
                    <Button size="sm" variant="outline" onClick={startEdit}>Edit</Button>
                  )}
                </div>

                {profile ? (
                  <div className="space-y-2.5">
                    {PROFILE_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
                        <Input
                          id={f.key}
                          value={profile[f.key] ?? ""}
                          placeholder={f.placeholder}
                          onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                        />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label htmlFor="support_notes" className="text-xs">Internal notes</Label>
                      <Textarea
                        id="support_notes" rows={3}
                        value={profile.support_notes ?? String(org.support_notes ?? "")}
                        onChange={(e) => setProfile({ ...profile, support_notes: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={commitProfile} disabled={saveProfile.isPending}>
                        {saveProfile.isPending ? "Saving…" : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setProfile(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {PROFILE_FIELDS.map((f) => (
                      <div key={f.key} className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="text-right">{String(org[f.key] ?? "—")}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-3 text-[11px] text-muted-foreground">
                  Platform metadata only. Nothing on this form writes to a tenant business
                  table — the underlying function names every writable column explicitly.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-2 text-sm font-medium">Subscription</div>
                  {sub ? (
                    <div className="space-y-2 text-sm">
                      {([
                        ["Plan", sub.plan_code], ["Status", sub.status],
                        ["Trial ends", String(sub.trial_ends_at ?? "—").slice(0, 10)],
                        ["Period end", String(sub.current_period_end ?? "—")],
                      ] as [string, unknown][]).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="text-right">{String(v ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No subscription record.</p>
                  )}
                </div>

                {/* Membership is shown as COUNTS. Listing names and emails of a
                    customer's staff on a platform screen is exactly the exposure
                    impersonation exists to gate. */}
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-2 text-sm font-medium">Members</div>
                  <div className="flex gap-6 text-sm">
                    {["staff", "parent", "student"].map((k) => (
                      <div key={k}>
                        <div className="text-xs capitalize text-muted-foreground">{k}</div>
                        <div className="text-lg font-semibold tabular-nums">{members[k] ?? 0}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Counts only. Member identities are tenant data and are reachable solely
                    through an audited impersonation session.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Modules ──────────────────────────────────────────────────── */}
          <TabsContent value="modules" className="mt-4">
            {id && <ModuleEntitlementsPanel organizationId={id} />}
          </TabsContent>

          {/* ── Usage ────────────────────────────────────────────────────── */}
          <TabsContent value="usage" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <UsageBar label="Students" used={numeric(metrics.students)} limit={numeric(sub?.students_limit)} />
              <UsageBar label="Staff seats" used={numeric(members.staff ?? metrics.staff)} limit={numeric(sub?.seats_limit)} />
              <UsageBar label="Branches" used={branches.length} limit={null} />
              <UsageBar
                label="Storage"
                used={numeric(metrics.storage_bytes)}
                limit={sub?.storage_mb_limit ? Number(sub.storage_mb_limit) * 1024 * 1024 : null}
                format={formatBytes}
              />
              <UsageBar label="Messages (today)" used={numeric(metrics.messages_sent)} limit={null} />
              <UsageBar label="Fees collected (today)" used={numeric(metrics.fees_collected)} limit={null} />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              From the nightly metrics rollup. A dash means the metric has not been computed
              for this organization — it is not a zero, and should not be read as one.
            </p>
          </TabsContent>

          <TabsContent value="branches" className="mt-4">
            {branches.length === 0 ? (
              <EmptyState title="No branches recorded" />
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {branches.map((b) => (
                  <div key={String(b.id)} className="flex items-center justify-between px-4 py-2.5">
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
              <div className="divide-y divide-border rounded-lg border border-border text-sm">
                {audit.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <div>
                      <div className="font-medium">{String(a.action)}</div>
                      {a.detail ? (
                        <div className="text-xs text-muted-foreground">{String(a.detail)}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
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
              <div className="divide-y divide-border rounded-lg border border-border text-sm">
                {impersonations.map((g, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <div>
                      <div className="font-medium">{String(g.reason)}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(g.started_at ?? "").slice(0, 19).replace("T", " ")} →{" "}
                        {g.ended_at
                          ? String(g.ended_at).slice(11, 19)
                          : `expires ${String(g.expires_at ?? "").slice(11, 19)}`}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {g.ended_at ? "Ended" : "Active"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Danger zone ──────────────────────────────────────────────── */}
          <TabsContent value="danger" className="mt-4 space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="text-sm font-medium">Lifecycle</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Every state below is reversible and none of them removes a record. The
                organization's students, fees, payroll, exams and attendance are untouched
                by a status change.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {can("organizations.hold") && (
                  <Button size="sm" variant="outline" onClick={() => setLifecycle("hold")} disabled={status === "hold"}>
                    <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Hold
                  </Button>
                )}
                {can("organizations.manage") && (
                  <Button size="sm" variant="outline" onClick={() => setLifecycle("suspended")} disabled={status === "suspended"}>
                    <Ban className="mr-1.5 h-3.5 w-3.5" /> Suspend
                  </Button>
                )}
                {can("organizations.archive") && (
                  <Button size="sm" variant="outline" onClick={() => setLifecycle("archived")} disabled={status === "archived"}>
                    <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                  </Button>
                )}
                {can("organizations.manage") && !isLive && (
                  <Button size="sm" onClick={() => setLifecycle("active")}>
                    <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Restore
                  </Button>
                )}
              </div>
            </div>

            {/* ── Deletion ──────────────────────────────────────────────────
                The honest version. See PART 5 of the Phase 9A migration: every
                organization_id FK is ON DELETE RESTRICT, so a hard delete is not
                merely dangerous — it is impossible, and a button promising one
                would be a lie the operator only discovers after clicking it. */}
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4">
              <div className="text-sm font-medium text-red-600 dark:text-red-400">
                Permanent deletion
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Erasure is real and irreversible: the organization's rows are deleted across
                every tenant table and its files are removed from storage. There is no restore
                behind it. It stays a two-person operation — one platform user opens the
                request, a different one approves it after a seven-day cooling-off, and only an
                owner can run the erasure itself.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">Archive first — and consider stopping there.</span>{" "}
                Archiving closes access, retains everything and is reversible, which is what
                most deletion requests actually want. An organization must be archived or
                cancelled before it can be erased.
              </p>

              {approvedRequest ? (
                <div className="mt-3 rounded-lg border border-red-500/40 bg-background p-3 text-sm">
                  <div className="font-medium text-red-600 dark:text-red-400">
                    Approved for erasure
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Requested {approvedRequest.requestedAt.slice(0, 10)} by{" "}
                    {approvedRequest.requestedEmail ?? "unknown"} · approved{" "}
                    {approvedRequest.reviewedAt?.slice(0, 10) ?? "—"}
                  </div>
                  <div className="mt-1.5 text-xs">{approvedRequest.reason}</div>

                  {can("organizations.purge") ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="mt-3"
                        disabled={isProtected || !["archived", "cancelled"].includes(status)}
                        onClick={() => setPurgeOpen(true)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Erase permanently
                      </Button>
                      {!["archived", "cancelled"].includes(status) && (
                        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                          Archive this organization first. Erasing a live tenant would pull the
                          database out from under anyone signed in.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Approved, but erasure requires a platform owner. Your account cannot run it.
                    </p>
                  )}
                </div>
              ) : openRequest ? (
                <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm">
                  <div className="font-medium">Delete request open</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Requested {openRequest.requestedAt.slice(0, 10)} by{" "}
                    {openRequest.requestedEmail ?? "unknown"} · reviewable from{" "}
                    {openRequest.eligibleAt.slice(0, 10)}
                  </div>
                  <div className="mt-1.5 text-xs">{openRequest.reason}</div>
                  {can("organizations.review_delete") && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm" variant="destructive"
                        disabled={reviewDelete.isPending || new Date(openRequest.eligibleAt) > new Date()}
                        onClick={() => reviewDelete.mutate({ requestId: openRequest.id, decision: "approved" })}
                      >
                        Approve for manual erasure
                      </Button>
                      <Button
                        size="sm" variant="outline" disabled={reviewDelete.isPending}
                        onClick={() => reviewDelete.mutate({ requestId: openRequest.id, decision: "cancelled" })}
                      >
                        Cancel request
                      </Button>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    A request cannot be approved by the person who opened it, and not before
                    the cooling-off period ends.
                  </p>
                </div>
              ) : (
                can("organizations.delete_request") && (
                  <Button
                    size="sm" variant="destructive" className="mt-3"
                    disabled={isProtected}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Request deletion
                  </Button>
                )
              )}
              {isProtected && !openRequest && (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                  This organization is protected. Deletion cannot be requested while its
                  protection row exists.
                </p>
              )}
            </div>
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

      {id && approvedRequest && (
        <PurgeOrganizationDialog
          open={purgeOpen}
          onOpenChange={setPurgeOpen}
          organizationId={id}
          organizationSlug={slug}
          organizationName={String(org.display_name ?? "")}
          requestId={approvedRequest.id}
          // The organization no longer exists; staying on its detail page would
          // show a screen of empty fields.
          onPurged={() => navigate("/platform/organizations")}
        />
      )}

      {id && lifecycle && (
        <LifecycleDialog
          open
          onOpenChange={(v) => !v && setLifecycle(null)}
          action={lifecycle}
          organizationId={id}
          organizationName={String(org.display_name ?? "")}
          organizationSlug={slug}
          currentStatus={status}
          currentReason={org.status_reason ? String(org.status_reason) : null}
          isProtected={isProtected}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request organization deletion</DialogTitle>
            <DialogDescription>
              This opens a request for review. It deletes nothing, now or on approval —
              erasure remains a manual operation performed outside this console.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="del-reason">Reason (required)</Label>
              <Textarea
                id="del-reason" rows={3} value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Customer exercised right to erasure under DPDP Act; ticket SUP-1182."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="del-confirm">
                Type the slug <code className="rounded bg-muted px-1">{slug}</code> to confirm
              </Label>
              <Input
                id="del-confirm" autoComplete="off" value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
              {/* Verified server-side too. This input is the prompt to think;
                  the edge function is the actual control. */}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={
                requestDelete.isPending || deleteConfirm !== slug || deleteReason.trim().length < 10
              }
              onClick={() =>
                id &&
                requestDelete.mutate(
                  { organizationId: id, reason: deleteReason.trim(), confirmSlug: deleteConfirm },
                  { onSuccess: () => { setDeleteOpen(false); setDeleteReason(""); setDeleteConfirm(""); } },
                )
              }
            >
              Open request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationDetailPage;
