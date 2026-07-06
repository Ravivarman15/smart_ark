import { useEffect, useState } from "react";
import { Brain, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openReportWindow, closeReportWindow } from "@/lib/reportWindow";
import { useExamLookups, useExamAiInsights } from "../hooks";
import {
  examRegistersService,
  REGISTER_TYPES,
  type InsightsFilters,
  type RegisterResult,
  type RegisterType,
} from "../services";
import { EXAM_MONTHS } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Registers (Phase 13) + AI Insights. Registers are built + exported
// through the reused analytics + report-export engines. The AI panel reuses the
// rule-based examInsightsService.aiInsights().
// ─────────────────────────────────────────────────────────────────────────────

const selectCls = "bg-background border border-border rounded-md px-2.5 py-1.5 text-sm";

const riskDot = (risk: string) =>
  risk === "green" ? "#16a34a" : risk === "yellow" ? "#d97706" : "#dc2626";

const ExamRegistersPage = () => {
  const { data: lookups } = useExamLookups();
  const [filters, setFilters] = useState<InsightsFilters>({});
  const [type, setType] = useState<RegisterType>("academic");
  const [preview, setPreview] = useState<RegisterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: ai } = useExamAiInsights(filters);
  const set = (p: Partial<InsightsFilters>) => setFilters((f) => ({ ...f, ...p }));

  // Load a preview whenever the register type or filters change.
  useEffect(() => {
    setLoading(true);
    examRegistersService
      .build(type, filters)
      .then(setPreview)
      .catch(() => toast.error("Failed to build register"))
      .finally(() => setLoading(false));
  }, [type, filters]);

  const download = async (format: "csv" | "xlsx" | "pdf" | "print") => {
    // PDF / Print open a window — open it synchronously in the click so the
    // popup blocker allows it after the async build. CSV / Excel download files.
    const needsWindow = format === "pdf" || format === "print";
    const win = needsWindow ? openReportWindow() : null;
    if (needsWindow && !win) return; // popup blocked — toast already shown
    setBusy(format);
    try {
      const reg = await examRegistersService.generate(type, filters, format, win);
      if (reg.rows.length === 0) toast.message("No rows for this register / filter.");
    } catch (err) {
      closeReportWindow(win);
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">Examination Reports & Registers</h1>
        <p className="text-sm text-muted-foreground">Generate any register and export to PDF, Excel, CSV or print.</p>
      </header>

      {/* AI Insights */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" /> AI Insights</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Academic Health Score</p>
            <p className="text-3xl font-display font-semibold text-foreground">{ai?.academicHealthScore ?? "—"}<span className="text-base text-muted-foreground">/100</span></p>
            <div className="mt-2 space-y-1">
              {(ai?.classHealth ?? []).slice(0, 5).map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ background: riskDot(c.risk) }} />
                  <span className="flex-1 text-foreground">{c.label}</span>
                  <span className="text-muted-foreground">{c.score}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Subject & Faculty</p>
            <ul className="list-disc pl-4 space-y-0.5 text-xs text-foreground">
              {[...(ai?.subjectInsights ?? []), ...(ai?.facultyInsights ?? [])].map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Management & Actions</p>
            <ul className="list-disc pl-4 space-y-0.5 text-xs text-foreground">
              {(ai?.managementInsights ?? []).map((s, i) => <li key={i}>{s}</li>)}
              {(ai?.suggestedImprovements ?? []).map((s, i) => <li key={`s${i}`} className="text-amber-600">{s}</li>)}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Register builder */}
      <section className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as RegisterType)}>
          {REGISTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className={selectCls} value={filters.academicYearId ?? ""} onChange={(e) => set({ academicYearId: e.target.value || undefined })}>
          <option value="">All years</option>
          {(lookups?.academicYears ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className={selectCls} value={filters.standardId ?? ""} onChange={(e) => set({ standardId: e.target.value || undefined })}>
          <option value="">All classes</option>
          {(lookups?.standards ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={selectCls} value={filters.month ?? ""} onChange={(e) => set({ month: e.target.value || undefined })}>
          <option value="">All months</option>
          {EXAM_MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="flex gap-1.5 ml-auto">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => download("csv")} disabled={!!busy}>
            {busy === "csv" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} CSV
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => download("xlsx")} disabled={!!busy}>
            {busy === "xlsx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => download("pdf")} disabled={!!busy}>
            {busy === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />} PDF / Print
          </Button>
        </div>
      </section>

      {/* Preview */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {preview?.title ?? "Register"}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {loading ? "· loading…" : preview ? `· ${preview.rows.length} rows` : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto max-h-[520px]">
          {!preview || preview.rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">
              {loading ? "Building…" : "No rows for this register and filter."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>{preview.columns.map((c) => <th key={c.header} className="px-3 py-2 font-medium text-left">{c.header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {preview.rows.slice(0, 200).map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    {preview.columns.map((c) => <td key={c.header} className="px-3 py-1.5">{String(c.value(row))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExamRegistersPage;
