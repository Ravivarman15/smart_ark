import React, { useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { exportCsv, exportExcel, exportPdf } from "@/features/reports/utils/exportEngine";
import { openReportWindow } from "@/lib/reportWindow";
import type { ExportRequest } from "@/features/reports/types/reports.types";
import { useAllocationReport } from "../hooks";
import { REPORT_LABELS } from "../services";
import type { AllocationReport, AllocationReportKey } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Faculty allocation reports (Phase 10).
//
// The datasets come from allocationReportsService; PDF / Excel / CSV all go
// through the SHARED report export engine — no bespoke export code here. The
// print window is opened SYNCHRONOUSLY on the click (before any await) so
// popup blockers never swallow it.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, string | number>;

const toExportRequest = (r: AllocationReport): ExportRequest<Row> => ({
  reportKey: r.key,
  title: r.title,
  subtitle: r.subtitle,
  columns: r.columns.map((c) => ({
    header: c.header,
    align: c.align,
    value: (row: Row) => row[c.field] ?? "",
  })),
  rows: r.rows,
  kpis: r.kpis.map((k, i) => ({ key: `${r.key}-${i}`, label: k.label, value: k.value })),
});

const REPORT_KEYS = Object.keys(REPORT_LABELS) as AllocationReportKey[];

interface Props {
  defaultFrom: string;
  defaultTo: string;
}

export const AllocationReportsPanel: React.FC<Props> = ({ defaultFrom, defaultTo }) => {
  const [key, setKey] = useState<AllocationReportKey>("faculty_monthly");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const { data: report, isLoading } = useAllocationReport(key, from, to);

  const guard = (fn: (r: AllocationReport) => void) => () => {
    if (!report || report.rows.length === 0) {
      toast.error("Nothing to export for this period.");
      return;
    }
    fn(report);
  };

  const handlePdf = () => {
    if (!report || report.rows.length === 0) {
      toast.error("Nothing to export for this period.");
      return;
    }
    // Open first, render second — a window opened after an await is blocked.
    const win = openReportWindow();
    exportPdf(toExportRequest(report), win);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Reports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="text-xs text-muted-foreground">Report</label>
            <Select value={key} onValueChange={(v) => setKey(v as AllocationReportKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {REPORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePdf}>
              <Printer className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={guard((r) => exportExcel(toExportRequest(r)))}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={guard((r) => exportCsv(toExportRequest(r)))}
            >
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {report && report.kpis.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {report.kpis.map((k) => (
              <div key={k.label} className="rounded-md border px-3 py-1.5">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-sm font-semibold">{k.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Building report…</p>
          ) : !report || report.rows.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" /> No data for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {report.columns.map((c) => (
                    <TableHead
                      key={c.field}
                      className={c.align === "right" ? "text-right" : undefined}
                    >
                      {c.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.slice(0, 200).map((row, i) => (
                  <TableRow key={i}>
                    {report.columns.map((c) => (
                      <TableCell
                        key={c.field}
                        className={c.align === "right" ? "text-right" : undefined}
                      >
                        {row[c.field] ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {report && report.rows.length > 200 && (
            <p className="pt-2 text-xs text-muted-foreground">
              Showing the first 200 of {report.rows.length} rows — export for the full set.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AllocationReportsPanel;
