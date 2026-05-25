import { useMemo } from "react";
import { IdCard } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  PresetPicker,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
} from "../components";
import { useStudentsBasic } from "../hooks/useReportData";
import { useReportLookups } from "../hooks/useReportLookups";
import { useReportPage, makeExport } from "./helpers";
import { fuzzyMatch } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useStudentsBasic>["data"]>[number];

const StudentIdCardReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "id_card",
    title: "Student ID Card Report",
  });
  const { data: all = [], isLoading } = useStudentsBasic();
  const { data: lookups } = useReportLookups();
  const batchById = new Map((lookups?.batches ?? []).map((b) => [b.id, b.name]));
  const branchById = new Map((lookups?.branches ?? []).map((b) => [b.id, b.name]));

  const rows = useMemo(() => {
    return all.filter((s) => {
      if (page.filters.branchId && s.campusId !== page.filters.branchId) return false;
      if (page.filters.batchId && s.batchId !== page.filters.batchId) return false;
      if (page.filters.search && !fuzzyMatch(s.name, page.filters.search)) return false;
      return s.isActive;
    });
  }, [all, page.filters]);

  const cols: ExportColumn<Row>[] = [
    { header: "Roll", value: (r) => r.rollNumber ?? "—" },
    { header: "Name", value: (r) => r.name },
    { header: "Batch", value: (r) => batchById.get(r.batchId ?? "") ?? "—" },
    { header: "Branch", value: (r) => branchById.get(r.campusId ?? "") ?? "—" },
    { header: "Contact", value: (r) => r.parentContact ?? r.studentContact ?? "—" },
    { header: "ID", value: (r) => r.id },
  ];

  const kpis = [
    { key: "tot", label: "ID cards to print", value: rows.length, tone: "default" as const },
    {
      key: "branches",
      label: "Branches",
      value: new Set(rows.map((r) => r.campusId).filter(Boolean)).size,
      tone: "info" as const,
    },
    {
      key: "batches",
      label: "Batches",
      value: new Set(rows.map((r) => r.batchId).filter(Boolean)).size,
      tone: "default" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Bulk printable ID cards with QR — branch branding ready."
      icon={<IdCard className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={3} />
      <ReportFiltersBar
        value={page.filters}
        onChange={page.setFilters}
        enabled={["branch", "batch", "standard", "search"]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 print:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="border border-border/60 print:break-inside-avoid">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase text-muted-foreground">Student ID</span>
                <span className="text-[10px] font-mono">{r.id.slice(0, 8)}</span>
              </div>
              <p className="font-semibold">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {batchById.get(r.batchId ?? "") ?? "—"} • {branchById.get(r.campusId ?? "") ?? "—"}
              </p>
              <p className="text-[11px] mt-2">Roll: {r.rollNumber ?? "—"}</p>
              <p className="text-[11px]">Contact: {r.parentContact ?? r.studentContact ?? "—"}</p>
              <div className="mt-2 inline-block bg-slate-900 text-white text-[8px] px-1.5 py-1 font-mono">
                QR:{r.id}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ReportPageShell>
  );
};

export default StudentIdCardReportPage;
