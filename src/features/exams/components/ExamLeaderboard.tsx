import { useMemo, useState } from "react";
import { Crown, Loader2, Medal, Search, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useMcqLeaderboard } from "../hooks";
import type { LeaderboardRow } from "../types/mcqExam.types";

interface Props {
  examId: string;
  live?: boolean;
}

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// ExamLeaderboard — topper podium + ranked table for the MCQ exam.
//
// Polls the leaderboard (15 s) when `live` is true; otherwise serves a single
// snapshot. Rank / percentile come pre-computed from the centralised scoring
// layer (see `recomputeRanks`).
// ─────────────────────────────────────────────────────────────────────────────
export const ExamLeaderboard = ({ examId, live = false }: Props) => {
  const { data: rows = [], isLoading, error } = useMcqLeaderboard(examId, live);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        search ? r.studentName.toLowerCase().includes(search.toLowerCase()) : true,
      ),
    [rows, search],
  );
  const top3 = useMemo(() => rows.slice(0, 3), [rows]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-300/60 bg-rose-50/40 text-rose-700 p-4">
        Failed to load leaderboard.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        Loading leaderboard…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/50 p-8 text-center">
        <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No completed attempts yet — the leaderboard will appear once students
          submit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Podium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {top3.map((row) => (
          <TopperCard key={row.rank} row={row} />
        ))}
      </div>

      {/* Filter */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student…"
          className="pl-8"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-medium w-14">Rank</th>
              <th className="px-3 py-2.5 font-medium">Student</th>
              <th className="px-3 py-2.5 font-medium">Score</th>
              <th className="px-3 py-2.5 font-medium">%</th>
              <th className="px-3 py-2.5 font-medium">Accuracy</th>
              <th className="px-3 py-2.5 font-medium">Percentile</th>
              <th className="px-3 py-2.5 font-medium">Time</th>
              <th className="px-3 py-2.5 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.map((r) => (
              <tr key={r.rank + r.studentName} className="hover:bg-muted/20">
                <td className="px-3 py-2.5">
                  <RankChip rank={r.rank} />
                </td>
                <td className="px-3 py-2.5 font-medium text-foreground">
                  {r.studentName}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {r.score} / {r.maxScore}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {r.percentage.toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {r.accuracy.toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {r.percentile.toFixed(1)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {fmtTime(r.timeSpentSeconds)}
                </td>
                <td className="px-3 py-2.5">
                  {r.isPass ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Pass
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                      Fail
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TopperCard = ({ row }: { row: LeaderboardRow }) => {
  const podium = {
    1: {
      ring: "ring-amber-300",
      bg: "from-amber-50 to-amber-100/40",
      text: "text-amber-900",
      icon: <Crown className="w-5 h-5 text-amber-500" />,
    },
    2: {
      ring: "ring-slate-300",
      bg: "from-slate-50 to-slate-100/40",
      text: "text-slate-900",
      icon: <Medal className="w-5 h-5 text-slate-500" />,
    },
    3: {
      ring: "ring-orange-300",
      bg: "from-orange-50 to-orange-100/40",
      text: "text-orange-900",
      icon: <Medal className="w-5 h-5 text-orange-500" />,
    },
  }[row.rank] ?? {
    ring: "ring-border/60",
    bg: "from-card to-card/50",
    text: "text-foreground",
    icon: <Trophy className="w-5 h-5 text-muted-foreground" />,
  };

  return (
    <div
      className={`rounded-xl border border-border/60 bg-gradient-to-br p-4 ring-1 ${podium.ring} ${podium.bg}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold ${podium.text}`}>
          Rank #{row.rank}
        </span>
        {podium.icon}
      </div>
      <p className={`text-base font-display font-semibold ${podium.text}`}>
        {row.studentName}
      </p>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span>{row.percentage.toFixed(1)}%</span>
        <span>·</span>
        <span>
          {row.score}/{row.maxScore}
        </span>
        <span>·</span>
        <span>{row.accuracy.toFixed(0)}% accuracy</span>
      </div>
    </div>
  );
};

const RankChip = ({ rank }: { rank: number }) => {
  if (rank === 1)
    return (
      <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-amber-100 text-amber-900 font-bold text-xs">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-slate-100 text-slate-800 font-bold text-xs">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-orange-100 text-orange-800 font-bold text-xs">
        3
      </span>
    );
  return (
    <span className="text-sm text-muted-foreground tabular-nums">{rank}</span>
  );
};
