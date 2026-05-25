import { useMemo } from "react";
import { QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

// QR cards use Google Chart's QR API at print/render time so we don't bundle
// a QR library. The payload is the student ID — the attendance kiosk can
// verify it against the students table.
const qrUrl = (text: string, size = 96) =>
  `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(text)}`;

const StudentQrCardReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "qrcode_card",
    title: "Student QRCode Card",
  });
  const { data: all = [], isLoading } = useStudentsBasic();
  const { data: lookups } = useReportLookups();
  const batchById = new Map((lookups?.batches ?? []).map((b) => [b.id, b.name]));

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
    { header: "QR payload", value: (r) => r.id },
  ];

  const kpis = [
    { key: "cards", label: "QR cards", value: rows.length, tone: "default" as const },
    {
      key: "batches",
      label: "Batches",
      value: new Set(rows.map((r) => r.batchId).filter(Boolean)).size,
      tone: "info" as const,
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Student identity QR — used by the attendance kiosk for secure verification."
      icon={<QrCode className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker reportKey={page.reportKey} currentFilters={page.filters} onApply={page.setFilters} />
          <ReportToolbar buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)} />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={2} />
      <ReportFiltersBar
        value={page.filters}
        onChange={page.setFilters}
        enabled={["branch", "batch", "standard", "search"]}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4 print:grid-cols-4">
        {rows.map((r) => (
          <Card key={r.id} className="text-center print:break-inside-avoid">
            <CardContent className="p-3 space-y-1">
              <img
                src={qrUrl(r.id, 96)}
                alt={`QR for ${r.name}`}
                width={96}
                height={96}
                className="mx-auto"
              />
              <p className="text-xs font-semibold truncate">{r.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {batchById.get(r.batchId ?? "") ?? "—"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </ReportPageShell>
  );
};

export default StudentQrCardReportPage;
