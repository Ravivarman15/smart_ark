import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionGuard } from "@/features/rbac";
import {
  exportCsv,
  exportExcel,
  exportPdf,
  printCurrentPage,
} from "../utils/exportEngine";
import type { ExportRequest } from "../types/reports.types";

interface Props<T> {
  buildRequest: () => ExportRequest<T>;
  /** Extra controls (preset picker, refresh). */
  extras?: React.ReactNode;
}

// Reusable export/print toolbar with RBAC gating on each action.
export function ReportToolbar<T>({ buildRequest, extras }: Props<T>) {
  return (
    <div className="flex items-center gap-2 print:hidden flex-wrap">
      {extras}
      <ActionGuard action="reports.export_pdf">
        <Button variant="outline" size="sm" onClick={() => exportPdf(buildRequest())}>
          <FileText className="h-4 w-4 mr-1.5" /> PDF
        </Button>
      </ActionGuard>
      <ActionGuard action="reports.export_excel">
        <Button variant="outline" size="sm" onClick={() => exportExcel(buildRequest())}>
          <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </ActionGuard>
      <ActionGuard action="reports.export">
        <Button variant="outline" size="sm" onClick={() => exportCsv(buildRequest())}>
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
      </ActionGuard>
      <ActionGuard action="reports.print">
        <Button variant="outline" size="sm" onClick={() => printCurrentPage()}>
          <Printer className="h-4 w-4 mr-1.5" /> Print
        </Button>
      </ActionGuard>
    </div>
  );
}
