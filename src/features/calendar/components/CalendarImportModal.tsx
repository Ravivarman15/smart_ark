// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Event Bulk Import Modal
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  X,
  Check,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Clipboard,
} from "lucide-react";
import {
  parseDelimitedCalendarText,
  parseExcelCalendarBuffer,
  validateMappedCalendarRows,
  type ParsedCalendarImport,
  type ValidatedImportEvent,
} from "../utils/calendarImporter";
import { useCreateCalendarEvent } from "../hooks/useCalendarEvents";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CalendarImportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [pastedText, setPastedText] = useState("");
  const [parsed, setParsed] = useState<ParsedCalendarImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validatedEvents, setValidatedEvents] = useState<ValidatedImportEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const createMutation = useCreateCalendarEvent();

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const res = await parseExcelCalendarBuffer(buffer);
      setParsed(res);
      setMapping(res.suggestedMapping);
      setStep("map");
    } catch {
      toast.error("Failed to parse spreadsheet. Please verify file format.");
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) return;
    const res = parseDelimitedCalendarText(pastedText);
    setParsed(res);
    setMapping(res.suggestedMapping);
    setStep("map");
  };

  const handleProceedToPreview = () => {
    if (!parsed) return;
    const events = validateMappedCalendarRows(parsed.rawRows, mapping);
    setValidatedEvents(events);
    setStep("preview");
  };

  const handleConfirmImport = async () => {
    const validOnes = validatedEvents.filter((e) => e.isValid);
    if (validOnes.length === 0) {
      toast.error("No valid events to import");
      return;
    }

    setIsProcessing(true);
    let imported = 0;

    try {
      for (const ev of validOnes) {
        await createMutation.mutateAsync({
          title: ev.title,
          event_type: ev.event_type,
          start_at: ev.start_at,
          end_at: ev.end_at,
          all_day: ev.all_day,
          location: ev.location,
          description: ev.description,
          target_scope: ev.standard_name ? "standards" : "all",
          reminders: [
            {
              id: "rem_default",
              reminder_type: "1_day",
              offset_minutes: 1440,
              label: "1 day before",
              channels: ["in_app"],
            },
          ],
        });
        imported++;
      }
      toast.success(`Successfully imported ${imported} calendar events!`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed during bulk import");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[85vh] bg-card border border-border rounded-2xl shadow-xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Import Academic Calendar Events</h3>
              <p className="text-[11px] text-muted-foreground">
                Upload CSV / Excel file or paste tabular data with auto-header mapping
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Upload or Paste */}
        {step === "upload" && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <label className="border-2 border-dashed border-border hover:border-primary/50 bg-muted/10 hover:bg-muted/20 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all gap-2 text-center">
              <Upload className="w-8 h-8 text-primary" />
              <p className="font-semibold text-foreground">Click to upload spreadsheet</p>
              <p className="text-[11px] text-muted-foreground">Supported: .xlsx, .xls, .csv</p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold text-muted-foreground">
                <span className="bg-card px-2">Or paste table text</span>
              </div>
            </div>

            <div className="space-y-2">
              <textarea
                rows={4}
                placeholder="Paste CSV or Tab-delimited rows copied from Excel / Google Sheets..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="w-full p-3 text-xs rounded-xl bg-background border border-input text-foreground font-mono resize-none"
              />
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={!pastedText.trim()}
                className="w-full py-2 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Parse Tabular Text</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === "map" && parsed && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">
                Match Spreadsheet Headers ({parsed.rawRows.length} rows found)
              </p>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="text-xs text-primary hover:underline font-medium"
              >
                Choose another file
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[40vh] overflow-y-auto p-1">
              {parsed.headers.map((h) => (
                <div
                  key={h}
                  className="p-2.5 rounded-xl border border-border bg-background flex items-center justify-between gap-2"
                >
                  <span className="font-semibold text-foreground truncate">{h}</span>
                  <select
                    value={mapping[h] || ""}
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                    className="px-2 py-1 text-xs rounded-lg border border-input bg-card text-foreground font-medium"
                  >
                    <option value="">-- Ignore Column --</option>
                    <option value="title">Event Title *</option>
                    <option value="event_type">Category / Type</option>
                    <option value="start_date">Start Date *</option>
                    <option value="start_time">Start Time</option>
                    <option value="end_date">End Date</option>
                    <option value="end_time">End Time</option>
                    <option value="location">Location / Room</option>
                    <option value="description">Description / Notes</option>
                    <option value="standard_name">Class / Standard</option>
                    <option value="batch_name">Section / Batch</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleProceedToPreview}
                className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 flex items-center gap-1"
              >
                <span>Preview Validated Events</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Validation Preview */}
        {step === "preview" && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">
                  Ready to Import {validatedEvents.filter((e) => e.isValid).length} of{" "}
                  {validatedEvents.length} Events
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Invalid events with missing titles will be skipped
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep("map")}
                className="text-xs text-primary hover:underline font-medium"
              >
                Back to Mapping
              </button>
            </div>

            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
              {validatedEvents.map((ev, i) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    ev.isValid
                      ? "bg-muted/20 border-border"
                      : "bg-destructive/10 border-destructive/30 text-destructive"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {ev.title || "Untitled Event"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {ev.event_type} • {ev.start_at.substring(0, 10)}
                    </p>
                  </div>

                  {ev.isValid ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 font-bold text-[10px]">
                      Valid
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-destructive">
                      {ev.errors.join(", ")}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-border rounded-xl text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isProcessing}
                className="px-5 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isProcessing ? "Importing..." : "Confirm & Import Events"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
