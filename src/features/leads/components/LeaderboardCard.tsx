import { Trophy, Medal, Award, Zap, Target, GraduationCap, Timer } from "lucide-react";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { categoryLeader } from "../utils/leaderboard";

const rankIcon = (rank: number) => {
  if (rank === 1) return <Trophy className="h-4 w-4 text-amber-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Award className="h-4 w-4 text-orange-500" />;
  return <span className="w-4 text-center text-xs text-muted-foreground">{rank}</span>;
};

const fmtMin = (m: number | null) => (m === null ? "—" : `${Math.round(m)}m`);

const HeroStat = ({
  icon: Icon,
  label,
  name,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  name?: string;
  value?: string;
}) => (
  <div className="glass-card flex items-center gap-3 p-3">
    <Icon className="h-5 w-5 text-primary" />
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{name ?? "—"}</p>
      {value && <p className="text-xs text-muted-foreground">{value}</p>}
    </div>
  </div>
);

export const LeaderboardCard = () => {
  const { data, isLoading } = useLeaderboard();
  const rows = data?.rows ?? [];
  const top5 = rows.slice(0, 5);
  const stats = data?.responseStats;

  const best = categoryLeader(rows, "overall");
  const mostAdmissions = categoryLeader(rows, "admissions");
  const highestConv = categoryLeader(rows, "conversion");
  const fastest = categoryLeader(rows, "fastest");

  return (
    <div className="space-y-4">
      {/* Category heroes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroStat icon={Trophy} label="Best Counselor (Month)" name={best?.name} value={best ? `Score ${best.score}` : undefined} />
        <HeroStat icon={GraduationCap} label="Most Admissions" name={mostAdmissions?.name} value={mostAdmissions ? `${mostAdmissions.admissions} admissions` : undefined} />
        <HeroStat icon={Target} label="Highest Conversion" name={highestConv?.name} value={highestConv ? `${highestConv.conversionRate}%` : undefined} />
        <HeroStat icon={Zap} label="Fastest Response" name={fastest?.name} value={fastest ? fmtMin(fastest.avgResponseMinutes) : undefined} />
      </div>

      {/* Response engine */}
      {stats && stats.count > 0 && (
        <div className="glass-card flex flex-wrap items-center gap-4 p-3 text-sm">
          <span className="flex items-center gap-1.5 font-semibold"><Timer className="h-4 w-4 text-primary" /> Response time</span>
          <span className="text-muted-foreground">Avg <b className="text-foreground">{fmtMin(stats.average)}</b></span>
          <span className="text-muted-foreground">Median <b className="text-foreground">{fmtMin(stats.median)}</b></span>
          <span className="text-muted-foreground">Fastest <b className="text-emerald-600">{fmtMin(stats.fastest)}</b></span>
          <span className="text-muted-foreground">Slowest <b className="text-red-600">{fmtMin(stats.slowest)}</b></span>
          <span className="text-muted-foreground">({stats.count} responded)</span>
        </div>
      )}

      {/* Top 5 table */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Counselor</th>
              <th className="px-3 py-2 font-medium">Leads</th>
              <th className="px-3 py-2 font-medium">Admissions</th>
              <th className="px-3 py-2 font-medium">Conv.</th>
              <th className="px-3 py-2 font-medium">Avg Resp.</th>
              <th className="px-3 py-2 font-medium">Demos</th>
              <th className="px-3 py-2 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {top5.map((r) => (
              <tr key={r.counselorId} className="border-b border-border/30">
                <td className="px-3 py-2">{rankIcon(r.rank)}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.leadsHandled}</td>
                <td className="px-3 py-2">{r.admissions}</td>
                <td className="px-3 py-2">{r.conversionRate}%</td>
                <td className="px-3 py-2">{fmtMin(r.avgResponseMinutes)}</td>
                <td className="px-3 py-2">{r.demoCompletion}%</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{r.score}</td>
              </tr>
            ))}
            {top5.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {isLoading ? "Loading leaderboard…" : "No counselor activity this month yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
