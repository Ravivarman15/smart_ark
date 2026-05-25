import { useMemo } from "react";
import { User } from "lucide-react";
import {
  DataReportTable,
  PresetPicker,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
} from "../components";
import { useStudentsBasic } from "../hooks/useReportData";
import { useReportLookups } from "../hooks/useReportLookups";
import { useReportPage, makeExport } from "./helpers";
import { fuzzyMatch, formatDate } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useStudentsBasic>["data"]>[number];

const StudentDetailReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "student_detail",
    title: "Student Detail Report",
  });
  const { data: all = [], isLoading } = useStudentsBasic();
  const { data: lookups } = useReportLookups();
  const branchById = new Map((lookups?.branches ?? []).map((b) => [b.id, b.name]));
  const batchById = new Map((lookups?.batches ?? []).map((b) => [b.id, b.name]));
  const standardById = new Map((lookups?.standards ?? []).map((b) => [b.id, b.name]));

  const rows = useMemo(() => {
    return all.filter((s) => {
      if (page.filters.branchId && s.campusId !== page.filters.branchId) return false;
      if (page.filters.batchId && s.batchId !== page.filters.batchId) return false;
      if (page.filters.standardId && s.standardId !== page.filters.standardId) return false;
      if (page.filters.search && !fuzzyMatch(s.name, page.filters.search)) return false;
      return true;
    });
  }, [all, page.filters]);

  const cols: ExportColumn<Row>[] = [
    { header: "Roll", value: (r) => r.rollNumber ?? "—" },
    { header: "Name", value: (r) => r.name },
    { header: "Batch", value: (r) => batchById.get(r.batchId ?? "") ?? "—" },
    { header: "Branch", value: (r) => branchById.get(r.campusId ?? "") ?? "—" },
    { header: "Standard", value: (r) => standardById.get(r.standardId ?? "") ?? "—" },
    { header: "SPI", value: (r) => r.spi ?? "—", align: "right" },
    { header: "Last test", value: (r) => formatDate(r.lastTestDate) },
    { header: "Parent", value: (r) => r.parentContact ?? "—" },
    { header: "Student", value: (r) => r.studentContact ?? "—" },
    { header: "Admitted", value: (r) => formatDate(r.admissionDate) },
    { header: "Active", value: (r) => (r.isActive ? "Yes" : "No") },
  ];

  const active = rows.filter((r) => r.isActive).length;
  const inactive = rows.length - active;
  const avgSpi = rows.length
    ? Math.round(
        rows.reduce((a, b) => a + (b.spi ?? 0), 0) / Math.max(1, rows.filter((r) => r.spi != null).length),
      )
    : 0;

  const kpis = [
    { key: "tot", label: "Students", value: rows.length, tone: "default" as const },
    { key: "a", label: "Active", value: active, tone: "positive" as const },
    { key: "i", label: "Inactive", value: inactive, tone: "warning" as const },
    { key: "spi", label: "Avg SPI", value: avgSpi, tone: "info" as const },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Complete student dossier — profile, attendance, fees and performance summary."
      icon={<User className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["branch", "batch", "standard", "search"]}
        />
        <DataReportTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={isLoading} />
      </div>
    </ReportPageShell>
  );
};

export default StudentDetailReportPage;
