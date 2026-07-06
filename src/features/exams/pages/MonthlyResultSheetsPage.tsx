import { useState } from "react";
import { FileSpreadsheet, FileText, IdCard, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openReportWindow, closeReportWindow } from "@/lib/reportWindow";
import { useExamLookups } from "../hooks";
import { resultSheetService } from "../services";
import { ReportCardDialog, type ReportCardDialogParams } from "../components/ReportCardDialog";
import { EXAM_MONTHS, type ExamMonth } from "../types/exam.types";
import type { ResultSheetFormat as SheetFormat } from "../services";

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Result Sheets (Phase 7). Management picks an Academic Year + Class,
// then downloads each month's consolidated result sheet (CSV / Excel / print
// PDF) or opens the per-student report cards. All aggregation is reused from
// resultSheetService / reportCardService.
// ─────────────────────────────────────────────────────────────────────────────

// The literal months the immediate requirement calls out are highlighted.
const HIGHLIGHT: ExamMonth[] = ["april", "may", "june"];

const selectCls =
  "w-full bg-background border border-border rounded-md px-3 py-2 text-sm";

const MonthlyResultSheetsPage = () => {
  const { data: lookups } = useExamLookups();
  const academicYears = lookups?.academicYears ?? [];
  const standards = lookups?.standards ?? [];

  const [yearId, setYearId] = useState("");
  const [standardId, setStandardId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cardParams, setCardParams] = useState<ReportCardDialogParams | null>(null);

  const standardName = standards.find((s) => s.id === standardId)?.name;
  const academicYearName = academicYears.find((y) => y.id === yearId)?.name;
  const ready = !!standardId;

  const download = async (month: ExamMonth, format: SheetFormat) => {
    if (!standardId) {
      toast.error("Pick a class first");
      return;
    }
    // PDF / Print need a window opened synchronously in the click (before the
    // async build) so the popup blocker trusts it. CSV / Excel download files.
    const needsWindow = format !== "csv" && format !== "xlsx";
    const win = needsWindow ? openReportWindow() : null;
    if (needsWindow && !win) return; // popup blocked — toast already shown
    setBusy(`${month}:${format}`);
    try {
      const sheet = await resultSheetService.generate(
        {
          standardId,
          standardName,
          month,
          academicYearId: yearId || undefined,
          academicYearName,
        },
        format,
        win,
      );
      if (sheet.rows.length === 0) toast.message("No results recorded for this month yet.");
    } catch (err) {
      closeReportWindow(win);
      toast.error(err instanceof Error ? err.message : "Failed to build the sheet");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
          Monthly Result Sheets
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a class, then download each month's consolidated result sheet or
          generate student report cards.
        </p>
      </header>

      <section className="rounded-lg border border-border/60 bg-card/60 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <select className={selectCls} value={yearId} onChange={(e) => setYearId(e.target.value)}>
          <option value="">All academic years</option>
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
        <select className={selectCls} value={standardId} onChange={(e) => setStandardId(e.target.value)}>
          <option value="">Select class *</option>
          {standards.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </section>

      {!ready ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Select a class to list downloadable monthly result sheets.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {EXAM_MONTHS.map((m) => {
            const highlighted = HIGHLIGHT.includes(m.value);
            const b = (fmt: SheetFormat) => busy === `${m.value}:${fmt}`;
            return (
              <div
                key={m.value}
                className={`rounded-lg border p-3 space-y-2 ${
                  highlighted ? "border-accent/50 bg-accent/5" : "border-border/60 bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{m.label}</p>
                  <span className="text-[11px] text-muted-foreground uppercase">
                    {m.term.replace("_", " ")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => download(m.value, "csv")} disabled={b("csv")}>
                    {b("csv") ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} CSV
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => download(m.value, "xlsx")} disabled={b("xlsx")}>
                    {b("xlsx") ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />} Excel
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => download(m.value, "print")} disabled={b("print")}>
                    {b("print") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />} PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() =>
                      setCardParams({
                        standardId,
                        standardName,
                        month: m.value,
                        academicYearId: yearId || undefined,
                        academicYearName,
                      })
                    }
                  >
                    <IdCard className="w-3 h-3" /> Report Cards
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReportCardDialog params={cardParams} onOpenChange={() => setCardParams(null)} />
    </div>
  );
};

export default MonthlyResultSheetsPage;
