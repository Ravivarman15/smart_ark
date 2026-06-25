import { Pencil, FileText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollStatusBadge } from "./PayrollStatusBadge";
import { AnomalyBadges } from "./AnomalyBadges";
import { formatINR } from "../utils/payrollCalc";
import type { ApprovalGridRow } from "../types/payroll.types";

// The enterprise approval data grid. Every spec column is present; the table
// scrolls horizontally on small screens. Money cells are right-aligned; the
// month-over-month difference is colour-coded.

const Num = ({ v }: { v: number }) => (
  <TableCell className="text-right tabular-nums">{formatINR(v)}</TableCell>
);

const initials = (name?: string) =>
  (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const ApprovalDataGrid = ({
  rows,
  locked,
  onEdit,
  onSlip,
}: {
  rows: ApprovalGridRow[];
  locked: boolean;
  onEdit: (row: ApprovalGridRow) => void;
  onSlip: (row: ApprovalGridRow) => void;
}) => (
  <div className="overflow-x-auto rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 z-10 bg-background">Employee</TableHead>
          <TableHead>Dept / Designation</TableHead>
          <TableHead className="text-center">Work / Present / Leave</TableHead>
          <TableHead className="text-right">OT hrs</TableHead>
          <TableHead className="text-right">Basic</TableHead>
          <TableHead className="text-right">Allow.</TableHead>
          <TableHead className="text-right">Bonus</TableHead>
          <TableHead className="text-right">Incent.</TableHead>
          <TableHead className="text-right">Reimb.</TableHead>
          <TableHead className="text-right">Loan</TableHead>
          <TableHead className="text-right">PF</TableHead>
          <TableHead className="text-right">ESI</TableHead>
          <TableHead className="text-right">Tax</TableHead>
          <TableHead className="text-right">Other</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead className="text-right">Prev.</TableHead>
          <TableHead className="text-right">Diff.</TableHead>
          <TableHead>Flags</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="sticky left-0 z-10 bg-background">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  {r.photoUrl && <AvatarImage src={r.photoUrl} alt={r.staffName ?? ""} />}
                  <AvatarFallback className="text-[10px]">{initials(r.staffName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-[120px]">
                  <div className="font-medium leading-tight">{r.staffName}</div>
                  <div className="text-[11px] text-muted-foreground">{r.employeeCode}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="text-sm">{r.department ?? "—"}</div>
              <div className="text-[11px] capitalize text-muted-foreground">
                {r.designation ?? r.role}
              </div>
            </TableCell>
            <TableCell className="text-center text-xs tabular-nums">
              {r.workingDays} / <span className="text-emerald-600">{r.presentDays}</span> /{" "}
              <span className="text-amber-600">{r.leaveDays}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {(r.overtimeMinutes / 60).toFixed(1)}
            </TableCell>
            <Num v={r.basicSalary} />
            <Num v={r.allowances} />
            <Num v={r.bonus} />
            <Num v={r.incentives} />
            <Num v={r.reimbursements} />
            <Num v={r.loanDeduction} />
            <Num v={r.pf} />
            <Num v={r.esi} />
            <Num v={r.tax} />
            <Num v={r.otherDeductions} />
            <TableCell className="text-right font-semibold tabular-nums">
              {formatINR(r.netSalary)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {r.previousNet > 0 ? formatINR(r.previousNet) : "—"}
            </TableCell>
            <TableCell
              className={`text-right tabular-nums ${
                r.difference > 0
                  ? "text-emerald-600"
                  : r.difference < 0
                    ? "text-rose-600"
                    : "text-muted-foreground"
              }`}
            >
              {r.previousNet > 0
                ? `${r.difference > 0 ? "+" : ""}${formatINR(r.difference)}`
                : "—"}
            </TableCell>
            <TableCell>
              <AnomalyBadges flags={r.anomalies} />
            </TableCell>
            <TableCell>
              <PayrollStatusBadge status={r.status} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title={locked ? "Payroll locked" : "Edit salary"}
                  onClick={() => onEdit(r)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="View slip" onClick={() => onSlip(r)}>
                  <FileText className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={20} className="py-10 text-center text-sm text-muted-foreground">
              No employees match the current filters.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </div>
);
