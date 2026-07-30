import React from "react";
import { Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FacultyWorkload } from "../types/allocation.types";

// Faculty workload table (Phase 6) — allocated vs completed hours, punctuality
// and the projected earnings that come from the payroll salary configuration.

const h = (mins: number): string => `${(mins / 60).toFixed(1)}h`;
const inr = (n: number): string => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Free / Balanced / Overloaded, from the weekly allocated load. */
const classifyLoad = (weeklyMinutes: number): { label: string; tone: string } => {
  const hours = weeklyMinutes / 60;
  if (hours === 0) return { label: "Free", tone: "bg-slate-500/15 text-slate-500" };
  if (hours >= 26) return { label: "Overloaded", tone: "bg-rose-500/15 text-rose-500" };
  if (hours <= 8) return { label: "Underutilised", tone: "bg-amber-500/15 text-amber-600" };
  return { label: "Balanced", tone: "bg-emerald-500/15 text-emerald-600" };
};

interface Props {
  rows: FacultyWorkload[];
  isLoading?: boolean;
  title?: string;
}

export const FacultyWorkloadPanel: React.FC<Props> = ({ rows, isLoading, title }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{title ?? "Faculty workload"}</CardTitle>
    </CardHeader>
    <CardContent className="overflow-x-auto">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading workload…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No allocations in this period yet — assign classes to see workload and projected salary.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Faculty</TableHead>
              <TableHead>Load</TableHead>
              <TableHead className="text-right">Today</TableHead>
              <TableHead className="text-right">Week</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="text-right">Missed</TableHead>
              <TableHead className="text-right">Taken / Left</TableHead>
              <TableHead className="text-right">Started / Marked</TableHead>
              <TableHead className="text-right">Avg delay</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Expected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((w) => {
              const load = classifyLoad(w.weekMinutes);
              return (
                <TableRow key={w.teacherId}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {w.teacherName ?? w.teacherId}
                      {/* Pressing Start has to be visible HERE, not only on the
                          live board — this is the table management reads. */}
                      {w.inProgressCount > 0 && (
                        <Badge className="bg-emerald-500/15 text-emerald-600 gap-1">
                          <Radio className="h-3 w-3" /> LIVE
                        </Badge>
                      )}
                    </span>
                    {w.department && (
                      <span className="block text-xs text-muted-foreground">{w.department}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={load.tone}>{load.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{h(w.todayMinutes)}</TableCell>
                  <TableCell className="text-right">{h(w.weekMinutes)}</TableCell>
                  <TableCell className="text-right">{h(w.allocatedMinutes)}</TableCell>
                  <TableCell className="text-right">{h(w.completedMinutes)}</TableCell>
                  <TableCell className="text-right">{h(w.missedMinutes)}</TableCell>
                  <TableCell className="text-right">
                    {w.classesTaken} / {w.classesRemaining}
                  </TableCell>
                  <TableCell className="text-right">
                    {w.startedCount} / {w.attendanceSubmittedCount}
                    {w.neverStartedCount > 0 && (
                      <span className="block text-[10px] text-rose-500">
                        {w.neverStartedCount} never started
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {w.averageDelayMinutes > 0 ? (
                      <span className="text-amber-600">{w.averageDelayMinutes}m</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {w.hourlyRate > 0 ? (
                      <>
                        {inr(w.hourlyRate)}
                        <span className="block text-[10px] text-muted-foreground">
                          {w.rateSource}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">not set</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{inr(w.salaryEarned)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {inr(w.expectedSalary)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="pt-3 text-xs text-muted-foreground">
        <strong>Started / Marked</strong> counts the classes the teacher actually pressed Start on
        and the ones whose attendance is in — a class can be “completed” without either, so the
        two numbers are what tell you the timetable was really run.
      </p>
      <p className="pt-1 text-xs text-muted-foreground">
        Earned / Expected are <strong>projections</strong> from the hourly rate configured in
        Payroll (individual → role → derived from monthly ÷ working days ÷ daily hours). The
        payroll run remains the source of truth for what is actually paid.
      </p>
    </CardContent>
  </Card>
);

export default FacultyWorkloadPanel;
