// ──────────────────────────────────────────────────────────────────────────────
// BACKUPS & DISASTER RECOVERY — /platform/backups
//
// ┌── WHAT THIS PAGE STILL WILL NOT DO ────────────────────────────────────┐
// │ There is no "Back up now" button, and there never will be from here.   │
// │ Backups and PITR are managed by Supabase at the project level and are  │
// │ not controllable from SQL. A button that appeared to take a backup and │
// │ did nothing would be worse than the honest absence it replaced.        │
// └────────────────────────────────────────────────────────────────────────┘
//
// ┌── WHAT IT DOES NOW ────────────────────────────────────────────────────┐
// │ The page used to state a standard — "a restore that has not been       │
// │ tested is not a backup", verify monthly, RPO 5 min, RTO 4 h — as       │
// │ prose. Prose does not know what month it is. The platform could be     │
// │ eleven months out of compliance with its own printed standard and the  │
// │ page would look identical.                                             │
// │                                                                        │
// │   1. The standard is a stored POLICY, editable, not a hardcoded claim. │
// │   2. Rehearsals are RECORDS, and the page computes whether one is due. │
// │   3. RTO is reported from what was MEASURED, not only what was hoped.  │
// │   4. Per-organization export is real, because a restore you cannot     │
// │      compare against a snapshot is not a verified restore.             │
// └────────────────────────────────────────────────────────────────────────┘
//
// Policy and the register live in `platform_settings`. A dozen rehearsal rows a
// year did not justify a table, and a table would have shipped as an unapplied
// migration — i.e. a register that did not work.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Download, FlaskConical, Loader2, ShieldAlert, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile, EmptyState, LoadingBlock } from "../components/PlatformShell";
import {
  useDrPolicy, useDrRehearsals, useSaveDrPolicy, useRecordDrRehearsal,
  useExportOrganization, useOrganizations,
} from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import {
  recoveryPosture, meetsRto, measuredRto, formatDuration,
  type PostureLevel,
} from "../modules/recoveryPosture";
import type { DrPolicy, OrganizationExport } from "../services/platform.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

const POSTURE_STYLE: Record<PostureLevel, { cls: string; icon: React.ElementType }> = {
  verified: { cls: "border-emerald-500/30 bg-emerald-500/5", icon: CheckCircle2 },
  due_soon: { cls: "border-amber-500/30 bg-amber-500/5", icon: Clock },
  overdue: { cls: "border-red-500/40 bg-red-500/5", icon: AlertTriangle },
  failing: { cls: "border-red-500/50 bg-red-500/10", icon: ShieldAlert },
};

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// ── Record a rehearsal ──────────────────────────────────────────────────────

const RehearsalDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const record = useRecordDrRehearsal();
  const { platformUser } = usePlatformAuth();

  const today = new Date().toISOString().slice(0, 10);
  const [performedAt, setPerformedAt] = useState(today);
  const [restoredTo, setRestoredTo] = useState("");
  const [outcome, setOutcome] = useState<"pass" | "fail">("pass");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setPerformedAt(new Date().toISOString().slice(0, 10));
      setRestoredTo("");
      setOutcome("pass");
      setMinutes("");
      setNotes("");
    }
  }, [open]);

  const submit = async () => {
    await record.mutateAsync({
      performedAt: new Date(performedAt).toISOString(),
      performedBy: platformUser?.email ?? "unknown",
      restoredTo: restoredTo.trim() || null,
      outcome,
      minutesToRestore: minutes.trim() === "" ? null : Number(minutes),
      notes: notes.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a restore rehearsal</DialogTitle>
          <DialogDescription>
            Record what actually happened, including a failure. A register that only holds
            successes is a register nobody can rely on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dr-when">Performed on</Label>
              <Input
                id="dr-when"
                type="date"
                value={performedAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as "pass" | "fail")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Restored successfully</SelectItem>
                  <SelectItem value="fail">Could not restore</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dr-target">Restored to (PITR timestamp)</Label>
              <Input
                id="dr-target"
                value={restoredTo}
                placeholder="2026-08-01 14:30 IST"
                onChange={(e) => setRestoredTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-mins">Minutes to restore</Label>
              <Input
                id="dr-mins"
                type="number"
                min={0}
                value={minutes}
                placeholder="e.g. 95"
                onChange={(e) => setMinutes(e.target.value)}
              />
              {/* The measured number is the only thing that turns a stated RTO
                  into a demonstrated one. Leaving it blank is allowed and
                  reported as unknown rather than assumed to be within target. */}
              <p className="text-[11px] text-muted-foreground">
                Leave blank if untimed — it will be reported as unmeasured, not as a pass.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dr-notes">What was checked</Label>
            <Textarea
              id="dr-notes"
              rows={3}
              value={notes}
              placeholder="Which organization's data was compared, what was verified, anything that surprised you."
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={record.isPending}>
            {record.isPending ? "Saving…" : "Record rehearsal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Export ──────────────────────────────────────────────────────────────────

const ExportPanel: React.FC = () => {
  const { data: orgs } = useOrganizations();
  const { can } = usePlatformAuth();
  const exportOrg = useExportOrganization();
  const confirm = useConfirm();

  const [orgId, setOrgId] = useState("");
  const [manifest, setManifest] = useState<OrganizationExport | null>(null);

  const allowed = can("organizations.purge");
  const org = (orgs ?? []).find((o) => o.id === orgId);

  const preview = async () => {
    setManifest(null);
    const r = await exportOrg.mutateAsync({ organizationId: orgId, dryRun: true });
    setManifest(r);
  };

  const run = async () => {
    if (!manifest) return;
    const ok = await confirm({
      title: `Export every record for ${org?.displayName ?? "this organization"}?`,
      description: `${manifest.totalRows.toLocaleString("en-IN")} rows across ${
        Object.keys(manifest.tables).length
      } tables will be downloaded to this device as a single JSON file. It contains personal data for students, parents and staff — handle it as you would the database itself.`,
      confirmText: "Download export",
      type: "warning",
    });
    if (!ok) return;

    const r = await exportOrg.mutateAsync({ organizationId: orgId, dryRun: false });
    // Built and revoked here rather than left on the page: an object URL to a
    // tenant's entire database should not outlive the click that made it.
    const blob = new Blob([JSON.stringify(r.data ?? {}, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${r.slug}-${r.generatedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${r.totalRows.toLocaleString("en-IN")} rows for ${r.slug}.`);
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-sm font-medium">Per-organization export</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every row belonging to one tenant, as JSON. Produced by the read-only twin of the purge —
        both derive their table list from the same rule, so an export can never omit a table the
        purge would still erase.
      </p>

      {!allowed ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Requires the <code>organizations.purge</code> capability. Exporting an entire tenant is
          the same disclosure as erasing one is a destruction, so it is held to the same bar.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label>Organization</Label>
              <Select
                value={orgId}
                onValueChange={(v) => {
                  setOrgId(v);
                  setManifest(null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select an organization" /></SelectTrigger>
                <SelectContent>
                  {(orgs ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={preview} disabled={!orgId || exportOrg.isPending}>
              {exportOrg.isPending && !manifest ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Preview contents
            </Button>
          </div>

          {manifest && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{manifest.totalRows.toLocaleString("en-IN")} rows</span>
                  <span className="text-muted-foreground">
                    {" "}across {Object.keys(manifest.tables).length} tables
                  </span>
                </div>
                <Button size="sm" onClick={run} disabled={exportOrg.isPending}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download JSON
                </Button>
              </div>
              <div className="mt-2 max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">Rows per table</caption>
                  <tbody className="divide-y divide-border/60">
                    {Object.entries(manifest.tables)
                      .sort((a, b) => b[1] - a[1])
                      .map(([t, n]) => (
                        <tr key={t}>
                          <td className="py-1 font-mono">{t}</td>
                          <td className="py-1 text-right tabular-nums">{n.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Policy ──────────────────────────────────────────────────────────────────

const PolicyEditor: React.FC<{ policy: DrPolicy }> = ({ policy }) => {
  const save = useSaveDrPolicy();
  const { can } = usePlatformAuth();
  const editable = can("settings.manage");
  const [draft, setDraft] = useState<DrPolicy>(policy);

  useEffect(() => setDraft(policy), [policy]);

  const changed = (Object.keys(policy) as (keyof DrPolicy)[]).some((k) => draft[k] !== policy[k]);

  const field = (key: keyof DrPolicy, label: string, suffix: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`dr-${key}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`dr-${key}`}
          type="number"
          min={0}
          disabled={!editable}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
          className="h-8 w-24"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Recovery policy</div>
          <p className="mt-1 text-sm text-muted-foreground">
            The targets this platform holds itself to. Stored, so the page can tell you when you
            are out of compliance with them instead of only stating them.
          </p>
        </div>
        {editable && changed && (
          <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save policy"}
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field("rpoMinutes", "RPO target", "minutes of data loss")}
        {field("rtoHours", "RTO target", "hours to restore")}
        {field("pitrRetentionDays", "PITR window", "days")}
        {field("rehearsalIntervalDays", "Rehearsal every", "days")}
        {field("exportRetentionDays", "Keep exports", "days")}
      </div>

      {!editable && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Read-only — editing requires the <code>settings.manage</code> capability.
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        The PITR window is what your Supabase plan actually provides. This field records it so the
        page can be checked against reality; changing it here does not change the project.
      </p>
    </div>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────

export const BackupsPage: React.FC = () => {
  const { data: policy, isLoading: policyLoading } = useDrPolicy();
  const { data: rehearsals, isLoading: rehearsalsLoading } = useDrRehearsals();
  const { can } = usePlatformAuth();
  const [recordOpen, setRecordOpen] = useState(false);

  const posture = useMemo(
    () => (policy ? recoveryPosture(policy, rehearsals ?? []) : null),
    [policy, rehearsals],
  );
  const measured = useMemo(() => measuredRto(rehearsals ?? []), [rehearsals]);

  if (policyLoading || rehearsalsLoading || !policy || !posture) {
    return (
      <div>
        <PageHeader title="Backups & Disaster Recovery" />
        <LoadingBlock />
      </div>
    );
  }

  const Icon = POSTURE_STYLE[posture.level].icon;

  return (
    <div>
      <PageHeader
        title="Backups & Disaster Recovery"
        description="Point-in-time recovery is managed by Supabase at the project level. What is managed here is the evidence that it works."
        actions={
          can("settings.manage") ? (
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" /> Record rehearsal
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-6">
        {/* ── Posture ─────────────────────────────────────────────────── */}
        <div className={cn("flex items-start gap-2 rounded-lg border p-4 text-sm", POSTURE_STYLE[posture.level].cls)}>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">
              {posture.level === "verified" && "Recovery verified"}
              {posture.level === "due_soon" && "Rehearsal due shortly"}
              {posture.level === "overdue" && "Recovery unverified"}
              {posture.level === "failing" && "Last rehearsal failed"}
            </div>
            <p className="mt-0.5 text-muted-foreground">{posture.headline}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="RPO target" value={`${policy.rpoMinutes} min`} hint="Maximum acceptable data loss" />
          <StatTile
            label="RTO target"
            value={`${policy.rtoHours} h`}
            // The stated target and the measured worst case are different
            // facts. Showing only the target lets an aspiration masquerade as
            // a capability.
            hint={
              measured
                ? `Worst measured: ${formatDuration(measured.worstMinutes)} over ${measured.measured} rehearsal${measured.measured === 1 ? "" : "s"}`
                : "Never measured"
            }
            tone={
              measured && measured.worstMinutes > policy.rtoHours * 60 ? "warning" : "default"
            }
          />
          <StatTile
            label="PITR window"
            value={`${policy.pitrRetentionDays} days`}
            hint="As provided by the Supabase plan"
          />
          <StatTile
            label="Rehearsals"
            value={(rehearsals ?? []).length}
            hint={posture.nextDue ? `Next due ${posture.nextDue}` : "None recorded"}
            tone={posture.level === "verified" ? "positive" : posture.level === "due_soon" ? "warning" : "critical"}
          />
        </div>

        <div className="rounded-lg border border-border p-4 text-sm">
          <div className="font-medium">Current posture</div>
          <p className="mt-1 text-muted-foreground">
            Backups and point-in-time recovery are managed by Supabase at the project level and are
            not controllable from SQL — so this page deliberately offers no "Back up now" button it
            could not honour. What it does own is the record that a restore has been attempted and
            worked, which is the part no infrastructure provider can supply for you.
          </p>
          <p className="mt-2 text-muted-foreground">
            <strong>A restore that has not been tested is not a backup.</strong>
          </p>
        </div>

        <PolicyEditor policy={policy} />

        {/* ── Register ────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">
            Restore rehearsal register
          </div>
          {(rehearsals ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No rehearsal has ever been recorded"
                description="Restore the project to a point in time on a scratch instance, compare it against an export taken beforehand, and record what happened here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Restore rehearsals</caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">By</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Restored to</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Duration</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(rehearsals ?? []).map((r) => {
                    const within = meetsRto(r, policy);
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5">{fmtDate(r.performedAt)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.performedBy}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {r.restoredTo ?? "—"}
                          {r.notes && <div className="mt-0.5 text-[11px]">{r.notes}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {r.minutesToRestore == null ? (
                            <span className="text-muted-foreground">Not timed</span>
                          ) : (
                            <span className={cn(within === false && "text-amber-600 dark:text-amber-400")}>
                              {formatDuration(r.minutesToRestore)}
                              {within === false && " · over RTO"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.outcome === "pass" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Restored
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                              <XCircle className="h-3 w-3" /> Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ExportPanel />

        <p className="text-[11px] text-muted-foreground">
          Rehearsal records are append-only from this screen — a register that can be edited after
          the fact is not evidence of anything.
        </p>
      </div>

      <RehearsalDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  );
};

export default BackupsPage;
