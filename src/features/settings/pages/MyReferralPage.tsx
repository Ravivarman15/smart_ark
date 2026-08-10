import { Copy, Gift, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "../components/SettingsCard";
import { UsageStatCard } from "../components/UsageStatCard";
import { useReferralData } from "../hooks/useReferralData";

const buildShareUrl = (code: string) => {
  if (typeof window === "undefined") return `?ref=${code}`;
  return `${window.location.origin}/?ref=${code}`;
};

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

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(n);

const statusColor: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  credited: "bg-emerald-500/15 text-emerald-700",
  reversed: "bg-destructive/15 text-destructive",
};

const MyReferralPage = () => {
  const { summary, events } = useReferralData();

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error(`Could not copy ${what}`);
    }
  };

  const share = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join ARK", url });
        return;
      } catch {
        /* user cancelled — fall through */
      }
    }
    await copy(url, "Invite link");
  };

  if (summary.isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!summary.data) {
    return (
      <div className="max-w-3xl">
        <SettingsCard title="My Referral">
          <p className="text-sm text-muted-foreground">
            Referrals will be available after the workspace activates referral tracking.
          </p>
        </SettingsCard>
      </div>
    );
  }

  const code = summary.data.referralCode;
  const url = buildShareUrl(code);

  return (
    <div className="space-y-4 max-w-3xl">
      <SettingsCard
        title="Your referral code"
        description="Share this code with peers; you earn a reward when they sign up."
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex w-10 h-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Gift className="w-5 h-5" />
            </span>
            <div>
              <p className="text-lg font-mono font-bold tracking-wider text-foreground">
                {code}
              </p>
              <p className="text-[11px] text-muted-foreground break-all">{url}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(code, "Code")}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy code
            </Button>
            <Button size="sm" onClick={() => share(url)}>
              <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share link
            </Button>
          </div>
        </div>
      </SettingsCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UsageStatCard
          label="Total referrals"
          used={summary.data.totalReferrals}
          icon={<Users className="w-3.5 h-3.5" />}
        />
        <UsageStatCard
          label="Rewards earned"
          used={summary.data.totalRewards}
          unit="₹"
          icon={<Gift className="w-3.5 h-3.5" />}
        />
      </div>

      <SettingsCard
        title="Recent activity"
        description={`${events.data?.length ?? 0} entries`}
        contentClassName="p-0"
      >
        {events.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : !events.data || events.data.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No referral activity yet. Share your code above to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Reward</th>
                  <th className="text-left px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((e) => (
                  <tr key={e.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(e.createdAt)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                          statusColor[e.status]
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{fmtINR(e.rewardAmount)}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate">{e.notes ?? ""}</td>
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

export default MyReferralPage;
