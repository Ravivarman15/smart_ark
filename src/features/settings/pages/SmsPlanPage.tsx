import { AlertTriangle, MessageSquare, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "../components/SettingsCard";
import { UsageStatCard } from "../components/UsageStatCard";
import { useSmsPlan } from "../hooks/usePlanDetails";

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const SmsPlanPage = () => {
  const { data, isLoading } = useSmsPlan();

  if (isLoading || !data) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const lowBalance = data.balance <= data.lowBalanceThreshold;

  return (
    <div className="space-y-4 max-w-4xl">
      {lowBalance && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
          <p className="text-[12px] text-amber-700 dark:text-amber-300">
            Your SMS balance is low ({data.balance} ≤ threshold {data.lowBalanceThreshold}).
            Recharge before automations stall.
          </p>
        </div>
      )}

      <SettingsCard title="Balance & usage" description="Real-time SMS credit status.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <UsageStatCard
            label="Balance"
            used={data.balance}
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            hint="Recharge from your provider portal."
          />
          <UsageStatCard
            label="This month"
            used={data.monthlyUsage}
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            hint={`Last recharge: ${fmtDate(data.lastRechargeAt)}`}
          />
          <UsageStatCard
            label="Lifetime"
            used={data.lifetimeUsage}
            icon={<TrendingUp className="w-3.5 h-3.5" />}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Recent activity"
        description={`${data.history.length} transactions`}
        contentClassName="p-0"
      >
        {data.history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No SMS activity recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">When</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                  <th className="text-left px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(h.occurredAt)}</td>
                    <td className="px-4 py-2 capitalize">{h.type}</td>
                    <td className="px-4 py-2 text-right font-mono">{h.amount.toLocaleString()}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate">{h.note ?? ""}</td>
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
