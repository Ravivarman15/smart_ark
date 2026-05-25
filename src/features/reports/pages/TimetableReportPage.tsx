import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import {
  DataReportTable,
  PresetPicker,
  ReportFiltersBar,
  ReportKpiRow,
  ReportPageShell,
  ReportToolbar,
  BarChart,
  Heatmap,
  ReportChartCard,
} from "../components";
import { useTimetableRows } from "../hooks/useReportData";
import { useReportPage, makeExport } from "./helpers";
import type { ExportColumn } from "../types/reports.types";

type Row = NonNullable<ReturnType<typeof useTimetableRows>["data"]>[number];

const TimetableReportPage = () => {
  const page = useReportPage<Row>({
    reportKey: "timetable",
    title: "Time Table Report",
  });
  const { data: all = [], isLoading } = useTimetableRows();

  const rows = useMemo(() => {
    const search = page.filters.search?.toLowerCase();
    return all.filter((r) => {
      if (search) {
        const hay = `${r.teacherName ?? ""} ${r.batchName ?? ""} ${r.subjectName ?? ""} ${r.room ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [all, page.filters.search]);

  const teacherLoad = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = r.teacherName ?? "Unassigned";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [rows]);

  const roomLoad = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = r.room ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [rows]);

  const heat = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const slots = Array.from(new Set(rows.map((r) => r.startTime).filter(Boolean))).sort();
    const cells = days.flatMap((d) =>
      slots.map((s) => ({
        row: d,
        col: s,
        value: rows.filter((r) => r.day.slice(0, 3) === d && r.startTime === s).length,
      })),
    );
    return { rows: days, cols: slots, cells };
  }, [rows]);

  // Detect clashes: same teacher + same day + same start_time, count > 1
  const clashes = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.teacherName) continue;
      const k = `${r.teacherName}::${r.day}::${r.startTime}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.values()).filter((v) => v > 1).length;
  }, [rows]);

  const cols: ExportColumn<Row>[] = [
    { header: "Day", value: (r) => r.day },
    { header: "Start", value: (r) => r.startTime },
    { header: "End", value: (r) => r.endTime },
    { header: "Teacher", value: (r) => r.teacherName ?? "—" },
    { header: "Batch", value: (r) => r.batchName ?? "—" },
    { header: "Subject", value: (r) => r.subjectName ?? "—" },
    { header: "Room", value: (r) => r.room ?? "—" },
  ];

  const kpis = [
    { key: "p", label: "Periods", value: rows.length, tone: "default" as const },
    {
      key: "t",
      label: "Teachers",
      value: teacherLoad.length,
      tone: "info" as const,
    },
    {
      key: "r",
      label: "Rooms in use",
      value: roomLoad.length,
      tone: "default" as const,
    },
    {
      key: "c",
      label: "Clashes",
      value: clashes,
      tone: clashes > 0 ? ("negative" as const) : ("positive" as const),
    },
  ];

  return (
    <ReportPageShell
      title={page.title}
      description="Teacher / class / room utilisation with clash detection."
      icon={<CalendarClock className="w-5 h-5" />}
      toolbar={
        <>
          <PresetPicker
            reportKey={page.reportKey}
            currentFilters={page.filters}
            onApply={page.setFilters}
          />
          <ReportToolbar
            buildRequest={() => makeExport(page.reportKey, page.title, page.subtitle, rows, cols, kpis)}
          />
        </>
      }
    >
      <ReportKpiRow tiles={kpis} loading={isLoading} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <ReportChartCard title="Teacher load" className="lg:col-span-1">
          <BarChart data={teacherLoad} />
        </ReportChartCard>
        <ReportChartCard title="Room utilisation" className="lg:col-span-1">
          <BarChart data={roomLoad} color="#22c55e" />
        </ReportChartCard>
        <ReportChartCard title="Period density (day × slot)" className="lg:col-span-1">
          <Heatmap cells={heat.cells} rows={heat.rows} cols={heat.cols} />
        </ReportChartCard>
      </div>
      <div className="mt-4 space-y-3">
        <ReportFiltersBar
          value={page.filters}
          onChange={page.setFilters}
          enabled={["search"]}
        />
        <DataReportTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          emptyMessage="No periods scheduled"
        />
      </div>
    </ReportPageShell>
  );
};

export default TimetableReportPage;
