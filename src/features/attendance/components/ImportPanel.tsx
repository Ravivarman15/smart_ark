import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTile } from "./StatTile";
import { EmptyState } from "./EmptyState";
import type { ImportPreview, ImportPreviewRow } from "../utils/importMapping";

interface Props {
  kind: "student" | "staff";
  templateHeaders: string[];
  /** Returns the validated preview for a chosen file. */
  onPreview: (file: File) => Promise<ImportPreview | undefined>;
  previewPending: boolean;
  /** Commits the chosen rows. */
  onCommit: (rows: ImportPreviewRow[]) => void;
  commitPending: boolean;
}

const downloadCsv = (filename: string, rows: string[][]) => {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Shared upload → preview → validate → import flow for student & staff. */
export const ImportPanel = ({ kind, templateHeaders, onPreview, previewPending, onCommit, commitPending }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    const result = await onPreview(file);
    setPreview(result ?? null);
  };

  const committable = (preview?.rows ?? []).filter(
    (r) => r.valid && (includeDuplicates || !r.duplicate),
  );

  const exportErrors = () => {
    const errored = (preview?.rows ?? []).filter((r) => !r.valid);
    if (errored.length === 0) return;
    const headers = ["row", ...templateHeaders, "errors"];
    const body = errored.map((r) => [
      String(r.rowNumber),
      ...templateHeaders.map((h) => r.raw[headerToField(h, kind)] ?? ""),
      r.errors.join("; "),
    ]);
    downloadCsv(`attendance-import-errors.csv`, [headers, ...body]);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={previewPending}>
          {previewPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
          Choose CSV / Excel
        </Button>
        <Button variant="outline" onClick={() => downloadCsv(`${kind}-attendance-template.csv`, [templateHeaders])}>
          <Download className="w-4 h-4 mr-2" /> Template
        </Button>
        {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
      </div>

      {!preview ? (
        <div className="glass-card">
          <EmptyState
            icon={<Upload className="w-5 h-5" />}
            title="Upload an attendance file"
            description={`Columns: ${templateHeaders.join(", ")}. Dates may be any past date — historical imports are supported.`}
          />
        </div>
      ) : (
        <>
          {preview.unmatchedColumns && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Some required columns weren't detected. Check the header names against the template.</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Total rows" value={preview.total} />
            <StatTile label="Ready" value={preview.validCount} tone="positive" />
            <StatTile label="Duplicates" value={preview.duplicateCount} tone="warning" />
            <StatTile label="Errors" value={preview.errorCount} tone="danger" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} />
              Include duplicates (overwrite existing)
            </label>
            {preview.errorCount > 0 && (
              <Button size="sm" variant="outline" onClick={exportErrors}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export errors
              </Button>
            )}
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => onCommit(committable)}
              disabled={committable.length === 0 || commitPending}
            >
              {commitPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Import {committable.length} rows
            </Button>
          </div>

          <div className="glass-card p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>{kind === "student" ? "Student" : "Staff"}</TableHead>
                  <TableHead>Status</TableHead>
                  {kind === "staff" && <TableHead>In / Out</TableHead>}
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.slice(0, 200).map((r) => (
                  <TableRow key={r.rowNumber}>
                    <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                    <TableCell>{r.date ?? "—"}</TableCell>
                    <TableCell>{r.matchedName ?? r.raw.studentName ?? r.raw.staffName ?? "—"}</TableCell>
                    <TableCell className="capitalize">{r.status ?? "—"}</TableCell>
                    {kind === "staff" && (
                      <TableCell className="text-xs text-muted-foreground">
                        {(r.inTime ?? "—")} / {(r.outTime ?? "—")}
                      </TableCell>
                    )}
                    <TableCell>
                      {!r.valid ? (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5" /> {r.errors[0]}
                        </span>
                      ) : r.duplicate ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                          <Copy className="w-3.5 h-3.5" /> Duplicate
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

// Maps a template header back to the raw record field key used during parse,
// so the error export pulls the original cell value.
function headerToField(header: string, kind: "student" | "staff"): string {
  const h = header.toLowerCase();
  if (h.includes("date")) return "date";
  if (h.includes("status")) return "status";
  if (h.includes("remark")) return "remarks";
  if (kind === "student") {
    if (h.includes("enrol") || h.includes("enroll")) return "enrolmentNo";
    if (h.includes("roll")) return "rollNumber";
    if (h.includes("name")) return "studentName";
  } else {
    if (h.includes("email")) return "email";
    if (h.includes("in")) return "inTime";
    if (h.includes("out")) return "outTime";
    if (h.includes("name") || h.includes("staff")) return "staffName";
  }
  return "";
}
