import React from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePayrollValidation } from "@/features/allocation/hooks";

// Pre-generation payroll validation. Reuses the allocation discrepancy engine to
// flag teachers with missing attendance, unfinished classes or leave overlap for
// a period BEFORE a run is generated. Read-only — not a report/export.
export const PayrollValidationPanel: React.FC<{ from: string; to: string }> = ({ from, to }) => {
  const { data: rows = [], isLoading } = usePayrollValidation(from, to);
  const flagged = rows.filter((r) => r.flags.length > 0);
  const fmt = (m: number) => `${(m / 60).toFixed(1)}h`;

  return (
    <Card className={flagged.length > 0 ? "border-amber-500/40" : "border-emerald-500/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {flagged.length > 0 ? (
            <><ShieldAlert className="h-4 w-4 text-amber-500" /> Payroll Validation — {flagged.length} teacher(s) flagged</>
          ) : (
            <><ShieldCheck className="h-4 w-4 text-emerald-500" /> Payroll Validation — no discrepancies</>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {from} → {to}. Review before generating; teaching hours flow into the run.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teaching activity in this period.</p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.teacherId} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.teacherName ?? r.teacherId}</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Completed {fmt(r.completedMinutes)}</span>
                    <span>Extra {fmt(r.extraMinutes)}</span>
                    <span>Scheduled {fmt(r.scheduledMinutes)}</span>
                    {r.substituteMinutes > 0 && <span>Substitute {fmt(r.substituteMinutes)}</span>}
                    <span>Cancelled {r.cancelledCount}</span>
                    <span>Missed {r.missedCount}</span>
                  </div>
                </div>
                {r.flags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.flags.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-amber-500 text-[11px]">{f}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PayrollValidationPanel;
