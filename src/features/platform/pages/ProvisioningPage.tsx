import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, RotateCcw, Undo2, CheckCircle2, XCircle, Loader2, Clock, PlayCircle,
} from "lucide-react";
import {
  PageHeader, StatTile, StatusPill, LoadingBlock, EmptyState,
} from "../components/PlatformShell";
import { platformKeys } from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { platformService } from "../services/platform.service";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface QueueJob {
  id: string;
  organization_id: string;
  organization: string;
  slug: string;
  status: string;
  trigger: string;
  attempt: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  total_steps: number;
  done_steps: number;
}

const STEP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  completed: CheckCircle2,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
  skipped: Clock,
};

const ProvisioningPage: React.FC = () => {
  const qc = useQueryClient();
  const { can } = usePlatformAuth();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: queue, isLoading } = useQuery({
    queryKey: [...platformKeys.all, "provisioning-queue"],
    // The RPC returns loosely-typed jsonb; narrow it here rather than in the
    // service, which has no reason to know this page's view model.
    queryFn: async () => {
      const q = await platformService.provisioningQueue();
      return (q ?? null) as unknown as {
        counts: Record<string, number> | null;
        median_duration_ms: number | null;
        jobs: QueueJob[] | null;
      } | null;
    },
    // Jobs finish in seconds — a stale board here is actively misleading.
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  const { data: steps } = useQuery({
    queryKey: [...platformKeys.all, "provisioning-steps", expanded ?? ""],
    queryFn: async () => {
      const job = queue?.jobs?.find((j) => j.id === expanded);
      if (!job) return null;
      return (await platformService.provisioningProgress(job.organization_id)) as unknown as {
        steps: Record<string, unknown>[];
      };
    },
    enabled: !!expanded,
    refetchInterval: 5_000,
  });

  const runWorker = useMutation({
    mutationFn: () => platformService.runProvisioningWorker(10),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: platformKeys.all });
      toast.success(`Worker processed ${r.processed} job(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retry = useMutation({
    mutationFn: (jobId: string) => platformService.retryProvisioningJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.all });
      toast.success("Job requeued — completed steps are preserved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollback = useMutation({
    mutationFn: (jobId: string) => platformService.rollbackProvisioningJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.all });
      toast.success("Provisioning artefacts removed");
    },
    // The refusal message names exactly why (live students/staff), which is
    // far more useful than "rollback failed".
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const counts = queue?.counts ?? {};
  const jobs = queue?.jobs ?? [];

  const doRollback = async (job: QueueJob) => {
    const ok = await confirm({
      title: `Roll back provisioning for ${job.organization}?`,
      description:
        "Removes templates, presets, settings and feature flags created by provisioning. " +
        "It refuses outright if the organization already has students or staff — by then " +
        "it is a live tenant, not a failed provision.",
      confirmText: "Roll back",
    });
    if (ok) rollback.mutate(job.id);
  };

  return (
    <div>
      <PageHeader
        title="Organization Provisioning"
        description={
          queue?.median_duration_ms
            ? `Median completion ${(queue.median_duration_ms / 1000).toFixed(1)}s`
            : "Queue-based, resumable, idempotent"
        }
        actions={
          can("organizations.manage") ? (
            <Button size="sm" onClick={() => runWorker.mutate()} disabled={runWorker.isPending}>
              <PlayCircle className={cn("mr-1.5 h-3.5 w-3.5", runWorker.isPending && "animate-pulse")} />
              Run worker now
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6 p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Queued" value={counts.queued ?? 0} />
            <StatTile label="Running" value={counts.running ?? 0}
              tone={(counts.running ?? 0) > 0 ? "warning" : "default"} />
            <StatTile label="Completed" value={counts.completed ?? 0} tone="positive" />
            <StatTile label="Failed" value={counts.failed ?? 0}
              tone={(counts.failed ?? 0) > 0 ? "critical" : "default"} />
            <StatTile label="Rolled back" value={counts.rolled_back ?? 0} />
          </div>

          {jobs.length === 0 ? (
            <EmptyState
              title="No provisioning jobs"
              description="Jobs appear here when an organization is created, whether by signup or from the control plane."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Organization</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Progress</th>
                    <th className="px-4 py-2.5 text-left font-medium">Trigger</th>
                    <th className="px-4 py-2.5 text-right font-medium">Attempt</th>
                    <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.map((j) => {
                    const pct = j.total_steps ? Math.round((j.done_steps / j.total_steps) * 100) : 0;
                    return (
                      <React.Fragment key={j.id}>
                        <tr
                          className="cursor-pointer hover:bg-accent/40"
                          onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              to={`/platform/organization/${j.organization_id}`}
                              className="font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {j.organization}
                            </Link>
                            <div className="text-[11px] text-muted-foreground">{j.slug}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusPill
                              status={
                                j.status === "completed" ? "active"
                                : j.status === "running" ? "trialing"
                                : j.status === "failed" ? "suspended"
                                : j.status === "queued" ? "past_due"
                                : j.status
                              }
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    j.status === "failed" ? "bg-red-500" : "bg-primary",
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {j.done_steps}/{j.total_steps}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">
                            {j.trigger}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                            {j.attempt}/{j.max_attempts}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                            {j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)}s` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {can("organizations.manage") && ["failed", "cancelled"].includes(j.status) && (
                              <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="outline" onClick={() => retry.mutate(j.id)}>
                                  <RotateCcw className="mr-1 h-3 w-3" /> Retry
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => doRollback(j)}>
                                  <Undo2 className="mr-1 h-3 w-3" /> Roll back
                                </Button>
                              </span>
                            )}
                          </td>
                        </tr>

                        {expanded === j.id && (
                          <tr className="bg-muted/30">
                            <td colSpan={7} className="px-4 py-3">
                              {j.error && (
                                <p className="mb-3 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs">
                                  {j.error}
                                </p>
                              )}
                              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                {((steps?.steps ?? []) as Record<string, unknown>[]).map((s) => {
                                  const status = String(s.status);
                                  const Icon = STEP_ICON[status] ?? Clock;
                                  return (
                                    <div key={String(s.key)} className="flex items-start gap-2 text-xs">
                                      <Icon
                                        className={cn(
                                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                                          status === "completed" && "text-emerald-500",
                                          status === "failed" && "text-red-500",
                                          status === "running" && "animate-spin text-blue-500",
                                          status === "pending" && "text-muted-foreground/50",
                                        )}
                                      />
                                      <span className="min-w-0">
                                        <span className={cn(status === "pending" && "text-muted-foreground")}>
                                          {String(s.label)}
                                        </span>
                                        {s.critical ? (
                                          <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                                            critical
                                          </span>
                                        ) : null}
                                        {s.error ? (
                                          <span className="block text-[10px] text-red-500">
                                            {String(s.error)}
                                          </span>
                                        ) : null}
                                        {s.duration_ms ? (
                                          <span className="block text-[10px] text-muted-foreground">
                                            {String(s.duration_ms)}ms
                                          </span>
                                        ) : null}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-lg border border-border p-4 text-sm">
            <div className="font-medium">How the queue behaves</div>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>
                <strong>Resume, not replay.</strong> Retry re-runs only failed steps; completed
                ones are preserved.
              </li>
              <li>
                <strong>Critical vs. optional.</strong> A failed critical step stops the job; an
                optional one is recorded and the job continues.
              </li>
              <li>
                <strong>Dead workers recover.</strong> Jobs are leased — an expired lease is
                reclaimed by the next worker.
              </li>
              <li>
                <strong>Rollback is guarded.</strong> It refuses once the organization has real
                students or staff.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProvisioningPage;
