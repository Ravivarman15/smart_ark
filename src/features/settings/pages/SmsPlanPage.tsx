// ──────────────────────────────────────────────────────────────────────────────
// MESSAGING USAGE  (route: /settings/sms-plan)
//
// Was built around a prepaid balance that no table backed, so it rendered
// zeros and a permanent "low balance" warning — 0 ≤ 100 is always true — over
// a database holding hundreds of real messages.
//
// Now shows the model that exists: what the plan entitles, what has actually
// been sent this month, what failed, and the last 25 messages. Every figure is
// counted in the database at render time.
// ──────────────────────────────────────────────────────────────────────────────

import { AlertTriangle, CheckCircle2, Clock, Mail, MessageCircle, Smartphone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "../components/SettingsCard";
import { useSmsPlan } from "../hooks/usePlanDetails";
import { cn } from "@/lib/utils";

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const CHANNEL_META: Record<string, { label: string; icon: typeof Mail }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  sms: { label: "SMS", icon: Smartphone },
  email: { label: "Email", icon: Mail },
};

const num = (n: number) => n.toLocaleString("en-IN");

const STATUS_TONE: Record<string, string> = {
  sent: "text-emerald-600 dark:text-emerald-400",
  delivered: "text-emerald-600 dark:text-emerald-400",
  read: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
  pending: "text-amber-600 dark:text-amber-400",
  queued: "text-amber-600 dark:text-amber-400",
};

const SmsPlanPage = () => {
  const { data, isLoading, error } = useSmsPlan();

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // A failed count is reported, not rendered as zero usage. Silently showing
  // "0 sent" when the query was blocked is what made the old page wrong.
  if (error || !data) {
    return (
      <div className="max-w-4xl rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-sm text-destructive">
          Messaging usage could not be loaded. This is a read error, not zero usage —
          nothing has been miscounted.
        </p>
      </div>
    );
  }

  const periodLabel = new Date(data.periodStart).toLocaleDateString(undefined, {
    month: "long", year: "numeric",
  });

  // Only warn when a real allowance is close to exhausted. No allowance means
  // unlimited, and unlimited can never be low.
  const nearLimit = data.channels.filter(
    (c) => c.allowance !== undefined && c.allowance > 0 && c.sentThisMonth / c.allowance >= 0.8,
  );
  const totalFailed = data.channels.reduce((s, c) => s + c.failedThisMonth, 0);

  return (
    <div className="space-y-4 max-w-4xl">
      {nearLimit.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[12px] text-amber-700 dark:text-amber-300">
            {nearLimit.map((c) => CHANNEL_META[c.channel]?.label ?? c.channel).join(" and ")}{" "}
            {nearLimit.length > 1 ? "are" : "is"} above 80% of the monthly allowance.
            Automations stop sending once it is exhausted.
          </p>
        </div>
      )}

      <SettingsCard
        title="Messaging usage"
        description={
          data.planName
            ? `${data.planName} allowance · ${periodLabel}`
            : `Usage for ${periodLabel}`
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {data.channels.map((c) => {
            const meta = CHANNEL_META[c.channel] ?? { label: c.channel, icon: MessageCircle };
            const Icon = meta.icon;
            const pct =
              c.allowance && c.allowance > 0
                ? Math.min(100, Math.round((c.sentThisMonth / c.allowance) * 100))
                : null;
            return (
              <div key={c.channel} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[11px] uppercase tracking-widest">{meta.label}</span>
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tabular-nums">
                    {num(c.sentThisMonth)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.allowance === undefined ? "sent" : `of ${num(c.allowance)}`}
                  </span>
                </div>

                {pct !== null && (
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${meta.label} allowance used`}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        pct >= 80 ? "bg-amber-500" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {pct === null && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {c.allowance === undefined ? "No monthly cap" : "Not included in this plan"}
                  </p>
                )}

                <dl className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
                  <div>
                    <dt className="inline">Lifetime </dt>
                    <dd className="inline font-medium text-foreground tabular-nums">
                      {num(c.sentLifetime)}
                    </dd>
                  </div>
                  {c.failedThisMonth > 0 && (
                    <div>
                      <dt className="inline">Failed </dt>
                      <dd className="inline font-medium text-destructive tabular-nums">
                        {num(c.failedThisMonth)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {num(data.queued)} waiting in the queue
          </span>
          <span className="inline-flex items-center gap-1.5">
            {totalFailed > 0 ? (
              <>
                <AlertTriangle className="w-3 h-3 text-destructive" />
                {num(totalFailed)} failed this month
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                No failures this month
              </>
            )}
          </span>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Recent messages"
        description={`Last ${data.history.length}`}
        contentClassName="p-0"
      >
        {data.history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No messages sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                The 25 most recent messages queued by this institution
              </caption>
              <thead className="border-b border-border/60 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th scope="col" className="text-left px-4 py-2 font-medium">When</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Channel</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Type</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">To</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {fmtDate(h.occurredAt)}
                    </td>
                    <td className="px-4 py-2">
                      {CHANNEL_META[h.channel]?.label ?? h.channel}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{h.label}</td>
                    <td className="px-4 py-2 truncate max-w-[12rem]">{h.recipient ?? "—"}</td>
                    <td className={cn("px-4 py-2 capitalize", STATUS_TONE[h.status] ?? "")}>
                      {h.status}
                      {h.error && (
                        <span className="block text-[10px] text-muted-foreground truncate max-w-[14rem]">
                          {h.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  );
};

export default SmsPlanPage;
