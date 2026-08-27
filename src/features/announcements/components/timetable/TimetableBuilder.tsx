// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Timetable Builder Component
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from "react";
import {
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Upload,
  FileSpreadsheet,
  Calendar,
  Clock,
  Sparkles,
  Layers,
  AlertCircle,
  Check,
  X,
  Settings2,
  Table as TableIcon,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AnnouncementTimetableData,
  TimetableColumn,
  TimetableRow,
  TimetableTemplateType,
} from "../../types/announcements.types";
import {
  getTemplateDefaults,
  calculateDayFromDate,
  parseRawDelimitedText,
  parseExcelBuffer,
  applyColumnMappingToRows,
  STANDARD_FIELDS,
  type ParsedRawTable,
} from "../../utils/timetableParser";

interface Props {
  value?: AnnouncementTimetableData | null;
  onChange: (data: AnnouncementTimetableData) => void;
}

export const TimetableBuilder: React.FC<Props> = ({ value, onChange }) => {
  const data = value || getTemplateDefaults("exam");

  const [activeTemplate, setActiveTemplate] = useState<TimetableTemplateType>(
    data.template || "exam"
  );

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"file" | "paste">("file");
  const [pasteContent, setPasteContent] = useState("");
  const [parsedData, setParsedData] = useState<ParsedRawTable | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Switch Template
  const handleTemplateChange = (tmpl: TimetableTemplateType) => {
    setActiveTemplate(tmpl);
    const def = getTemplateDefaults(tmpl);
    onChange({
      ...def,
      title: data.title || def.title,
    });
    toast.success(`Switched to ${tmpl.toUpperCase()} timetable template`);
  };

  // Row operations
  const handleAddRow = () => {
    const newRow: TimetableRow = {
      id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      date: "",
      day: "",
      start_time: "09:00 AM",
      end_time: "12:00 PM",
      subject: "",
      room: "",
      notes: "",
    };
    onChange({
      ...data,
      rows: [...data.rows, newRow],
    });
  };

  const handleDuplicateRow = (index: number) => {
    const source = data.rows[index];
    const cloned: TimetableRow = {
      ...source,
      id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    };
    const nextRows = [...data.rows];
    nextRows.splice(index + 1, 0, cloned);
    onChange({ ...data, rows: nextRows });
    toast.success("Row duplicated");
  };

  const handleDeleteRow = (index: number) => {
    if (data.rows.length <= 1) {
      toast.error("Timetable must contain at least one row");
      return;
    }
    const nextRows = data.rows.filter((_, i) => i !== index);
    onChange({ ...data, rows: nextRows });
  };

  const handleMoveRow = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= data.rows.length) return;
    const nextRows = [...data.rows];
    const temp = nextRows[index];
    nextRows[index] = nextRows[targetIdx];
    nextRows[targetIdx] = temp;
    onChange({ ...data, rows: nextRows });
  };

  const handleCellChange = (rowIndex: number, columnKey: string, val: string) => {
    const nextRows = [...data.rows];
    const currentRow = { ...nextRows[rowIndex], [columnKey]: val };

    // Auto-calculate day when date changes
    if (columnKey === "date") {
      const calcDay = calculateDayFromDate(val);
      if (calcDay) {
        currentRow.day = calcDay;
      }
    }

    nextRows[rowIndex] = currentRow;
    onChange({ ...data, rows: nextRows });
  };

  // Add Custom Column
  const handleAddCustomColumn = () => {
    const name = window.prompt("Enter new column label (e.g. Invigilator, Paper Code, Max Marks):");
    if (!name || !name.trim()) return;
    const key = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (data.columns.some((c) => c.key === key)) {
      toast.error("A column with this name already exists");
      return;
    }
    const newCol: TimetableColumn = {
      key,
      label: name.trim(),
      type: "text",
    };
    onChange({
      ...data,
      columns: [...data.columns, newCol],
    });
    toast.success(`Column "${name.trim()}" added`);
  };

  const handleRemoveColumn = (colKey: string) => {
    if (data.columns.length <= 2) {
      toast.error("Cannot delete all columns");
      return;
    }
    const nextCols = data.columns.filter((c) => c.key !== colKey);
    onChange({ ...data, columns: nextCols });
  };

  // Handle File Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
        const text = await file.text();
        const parsed = parseRawDelimitedText(text);
        if (parsed.headers.length === 0) {
          toast.error("No valid headers found in CSV file");
          return;
        }
        setParsedData(parsed);
        setColumnMapping(parsed.suggestedMapping);
      } else {
        // Assume Excel
        const buffer = await file.arrayBuffer();
        const parsed = parseExcelBuffer(buffer);
        if (parsed.headers.length === 0) {
          toast.error("No valid headers found in Excel file");
          return;
        }
        setParsedData(parsed);
        setColumnMapping(parsed.suggestedMapping);
      }
    } catch (err: any) {
      console.error("Import parsing error:", err);
      toast.error("Failed to parse file: " + (err.message || "Invalid format"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePasteParse = () => {
    if (!pasteContent.trim()) {
      toast.error("Please paste tabular data first");
      return;
    }
    const parsed = parseRawDelimitedText(pasteContent);
    if (parsed.headers.length === 0) {
      toast.error("Could not detect tabular columns from pasted text");
      return;
    }
    setParsedData(parsed);
    setColumnMapping(parsed.suggestedMapping);
  };

  const handleApplyImport = () => {
    if (!parsedData) return;
    const { rows: importedRows, columns: importedCols } = applyColumnMappingToRows(
      parsedData.rawRows,
      columnMapping,
      data.columns
    );

    if (importedRows.length === 0) {
      toast.error("No rows were imported");
      return;
    }

    onChange({
      ...data,
      columns: importedCols,
      rows: importedRows,
    });

    toast.success(`Successfully imported ${importedRows.length} timetable entries!`);
    setIsImportOpen(false);
    setParsedData(null);
    setPasteContent("");
  };

  return (
    <div className="space-y-4">
      {/* Header controls & template picker */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <TableIcon className="w-5 h-5 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">Timetable Builder</h4>
            <p className="text-xs text-muted-foreground">
              Define exam slots, class periods, or event schedules
            </p>
          </div>
        </div>

        {/* Template selector pills */}
        <div className="flex items-center gap-1.5 bg-background p-1 rounded-lg border border-border">
          <span className="text-[11px] font-medium text-muted-foreground px-2">Template:</span>
          {(
            [
              { id: "exam", label: "Exam Timetable" },
              { id: "weekly", label: "Class Timetable" },
              { id: "event", label: "Event Schedule" },
              { id: "custom", label: "Custom Table" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTemplateChange(t.id)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all font-medium ${
                activeTemplate === t.id
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV / Excel</span>
          </button>
          <button
            type="button"
            onClick={handleAddCustomColumn}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
            title="Add a custom column"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Column</span>
          </button>
        </div>
      </div>

      {/* Dynamic Table Grid */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              {data.columns.map((col) => (
                <th key={col.key} className="py-2.5 px-3 whitespace-nowrap min-w-[130px]">
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {!["date", "day", "subject", "start_time"].includes(col.key) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveColumn(col.key)}
                        className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                        title="Remove column"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="py-2.5 px-3 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((row, rIdx) => (
              <tr key={row.id || rIdx} className="hover:bg-muted/30 transition-colors group">
                <td className="py-2 px-3 text-center text-muted-foreground font-mono">
                  {rIdx + 1}
                </td>

                {data.columns.map((col) => (
                  <td key={col.key} className="py-1.5 px-2">
                    {col.key === "date" ? (
                      <input
                        type="date"
                        value={row.date || ""}
                        onChange={(e) => handleCellChange(rIdx, "date", e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden"
                      />
                    ) : col.key === "day" ? (
                      <input
                        type="text"
                        placeholder="e.g. Monday"
                        value={row.day || ""}
                        onChange={(e) => handleCellChange(rIdx, "day", e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden"
                      />
                    ) : col.key === "start_time" || col.key === "end_time" ? (
                      <input
                        type="text"
                        placeholder="e.g. 09:00 AM"
                        value={row[col.key] || ""}
                        onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden"
                      />
                    ) : (
                      <input
                        type="text"
                        placeholder={`Enter ${col.label.toLowerCase()}`}
                        value={row[col.key] || ""}
                        onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden"
                      />
                    )}
                  </td>
                ))}

                <td className="py-1.5 px-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveRow(rIdx, "up")}
                      disabled={rIdx === 0}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveRow(rIdx, "down")}
                      disabled={rIdx === data.rows.length - 1}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateRow(rIdx)}
                      className="p-1 rounded text-muted-foreground hover:text-primary"
                      title="Duplicate row"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(rIdx)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row bar */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleAddRow}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Timetable Row</span>
        </button>
        <span className="text-xs text-muted-foreground font-mono">
          {data.rows.length} row{data.rows.length !== 1 ? "s" : ""} · {data.columns.length} columns
        </span>
      </div>

      {/* ── Import Dialog Modal ── */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">Import Timetable Data</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportOpen(false);
                  setParsedData(null);
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {!parsedData ? (
                <>
                  {/* Tabs: File vs Paste */}
                  <div className="flex border-b border-border">
                    <button
                      type="button"
                      onClick={() => setImportTab("file")}
                      className={`pb-2 px-4 text-xs font-medium border-b-2 transition-colors ${
                        importTab === "file"
                          ? "border-primary text-primary font-semibold"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Upload File (.xlsx, .csv)
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportTab("paste")}
                      className={`pb-2 px-4 text-xs font-medium border-b-2 transition-colors ${
                        importTab === "paste"
                          ? "border-primary text-primary font-semibold"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Paste Tabular Data
                    </button>
                  </div>

                  {importTab === "file" ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 p-8 rounded-xl text-center cursor-pointer transition-colors space-y-3"
                    >
                      <Upload className="w-8 h-8 text-primary mx-auto" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Click to select or drag and drop an Excel or CSV file
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Supports .xlsx, .xls, .csv with column headers
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls,.txt"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        rows={6}
                        placeholder={`Paste CSV or copy/paste rows from Excel here:\nDate,Start,End,Subject,Room\n2026-10-10,09:00 AM,12:00 PM,Mathematics,Hall A`}
                        value={pasteContent}
                        onChange={(e) => setPasteContent(e.target.value)}
                        className="w-full p-3 text-xs font-mono rounded-xl border border-input bg-background text-foreground focus:ring-1 focus:ring-primary outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handlePasteParse}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Parse Pasted Data
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Column Mapping UI */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Map Columns</h4>
                      <p className="text-xs text-muted-foreground">
                        Match detected file headers to Smart ARK timetable fields.
                      </p>
                    </div>
                    <span className="text-xs font-mono bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                      {parsedData.rawRows.length} rows detected
                    </span>
                  </div>

                  <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/20 max-h-48 overflow-y-auto">
                    {parsedData.headers.map((hdr) => (
                      <div key={hdr} className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-foreground truncate max-w-[200px]">
                          {hdr}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <select
                          value={columnMapping[hdr] || "_ignore_"}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({ ...prev, [hdr]: e.target.value }))
                          }
                          className="px-2.5 py-1 rounded-md border border-input bg-card text-foreground text-xs focus:ring-1 focus:ring-primary outline-hidden"
                        >
                          <option value="_ignore_">— Ignore this column —</option>
                          <optgroup label="Standard Fields">
                            {STANDARD_FIELDS.map((sf) => (
                              <option key={sf.key} value={sf.key}>
                                {sf.label} ({sf.key})
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Custom Field">
                            <option value={hdr.toLowerCase().replace(/[^a-z0-9_]/g, "_")}>
                              Keep as custom: {hdr}
                            </option>
                          </optgroup>
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Sample preview of first 3 rows */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sample Preview (first 3 rows)
                    </span>
                    <div className="overflow-x-auto border border-border rounded-lg max-h-32">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-muted text-muted-foreground font-semibold">
                          <tr>
                            {parsedData.headers.map((h) => (
                              <th key={h} className="p-1.5 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border font-mono text-[10px]">
                          {parsedData.rawRows.slice(0, 3).map((r, i) => (
                            <tr key={i}>
                              {parsedData.headers.map((h) => (
                                <td key={h} className="p-1.5 whitespace-nowrap truncate max-w-[140px]">
                                  {r[h]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-muted/30 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsImportOpen(false);
                  setParsedData(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>

              {parsedData && (
                <button
                  type="button"
                  onClick={handleApplyImport}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply & Import {parsedData.rawRows.length} Rows</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
