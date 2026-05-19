import { CheckCircle2, GraduationCap, HardDrive, MessageSquare, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "../components/SettingsCard";
import { UsageStatCard } from "../components/UsageStatCard";
import { usePlanDetails } from "../hooks/usePlanDetails";

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
};

const statusColor: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  trial: "bg-amber-500/15 text-amber-600",
  expired: "bg-destructive/15 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

const MyPlanPage = () => {
  const { data, isLoading } = usePlanDetails();

  if (isLoading || !data) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <SettingsCard title="Subscription" description="Your current plan and entitlements.">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-2xl font-display font-semibold text-foreground">
              {data.planName}
            </p>
            <p className="text-xs text-muted-foreground">
              {fmtDate(data.startsAt)} → {fmtDate(data.expiresAt)}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${
              statusColor[data.status]
            }`}
          >
            {data.status}
          </span>
        </div>
        {data.features.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-4">
            {data.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Usage" description="Live counts pulled from the workspace.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <UsageStatCard
            label="Staff"
            used={data.staffUsed}
            limit={data.staffLimit}
            icon={<Users className="w-3.5 h-3.5" />}
          />
          <UsageStatCard
            label="Students"
            used={data.studentUsed}
            limit={data.studentLimit}
            icon={<GraduationCap className="w-3.5 h-3.5" />}
          />
          <UsageStatCard
            label="Storage"
            used={data.storageUsedMb}
            limit={data.storageLimitMb}
            unit="MB"
            icon={<HardDrive className="w-3.5 h-3.5" />}
            hint="Storage usage will appear when audit job runs."
          />
          <UsageStatCard
            label="SMS"
            used={data.smsUsed}
            limit={data.smsLimit}
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            hint="See SMS Plan for detailed usage."
          />
        </div>
      </SettingsCard>
    </div>
  );
};

export default MyPlanPage;
