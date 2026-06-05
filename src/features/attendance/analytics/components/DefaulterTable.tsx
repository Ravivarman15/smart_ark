import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RiskBadge } from "./RiskBadge";
import type { DefaulterRow } from "../types/analytics.types";

interface Props {
  rows: DefaulterRow[];
  emptyLabel?: string;
}

export const DefaulterTable = ({ rows, emptyLabel = "No students below threshold." }: Props) => (
  <div className="glass-card p-0 overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Standard</TableHead>
          <TableHead>Batch</TableHead>
          <TableHead className="text-right">Attendance %</TableHead>
          <TableHead className="text-right">Days Missed</TableHead>
          <TableHead className="text-right">Consec. Absent</TableHead>
          <TableHead>Risk</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{emptyLabel}</TableCell></TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={r.studentId}>
              <TableCell>
                <span className="text-muted-foreground mr-1.5">{r.rollNumber ?? ""}</span>{r.studentName}
              </TableCell>
              <TableCell>{r.standardName ?? "—"}</TableCell>
              <TableCell>{r.batchName ?? "—"}</TableCell>
              <TableCell className={`text-right font-medium ${r.attendancePct < 75 ? "text-red-600" : "text-emerald-600"}`}>{r.attendancePct}%</TableCell>
              <TableCell className="text-right">{r.daysMissed}</TableCell>
              <TableCell className="text-right">{r.consecutiveAbsence || "—"}</TableCell>
              <TableCell><RiskBadge level={r.riskLevel} /></TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);
