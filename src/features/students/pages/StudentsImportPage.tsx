import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, StatTile, StudentPageShell } from "../components";
import { useStudents } from "../hooks/useStudents";
import { useCommitImport, useImportHistory } from "../hooks/useStudentImport";
import { csvToStudentRows, formatDateTime, parseCsv } from "../utils/helpers";
import type { ImportRowResult, StudentWriteInput } from "../types/student.types";

const TEMPLATE =
  "name,roll_number,gender,date_of_birth,parent_name,parent_contact,parent_email,address\n" +
  "Asha Kumar,A101,Female,2009-04-12,Ravi Kumar,9800000000,ravi@example.com,12 MG Road\n";

const STATUS_STYLE: Record<ImportRowResult["status"], string> = {
  valid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  duplicate: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  error: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const StudentsImportPage = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<ImportRowResult[]>([]);

  // Existing names power duplicate detection.
  const { data: existing } = useStudents({ filters: { status: "all" } });
  const existingNames = useMemo(
    () => new Set((existing?.rows ?? []).map((s) => s.name.trim().toLowerCase())),
    [existing]
  );

  const commitMut = useCommitImport();
  const { data: history = [] } = useImportHistory();

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const parsed = csvToStudentRows(parseCsv(text));
    const seen = new Set<string>();
    const rows: ImportRowResult[] = parsed.map((data, i) => {
      const name = (data.name ?? "").trim();
      const key = name.toLowerCase();
      let status: ImportRowResult["status"] = "valid";
      let message: string | undefined;
      if (!name) {
        status = "error";
        message = "Missing student name";
      } else if (existingNames.has(key) || seen.has(key)) {
        status = "duplicate";
        message = "A student with this name already exists";
      }
      seen.add(key);
      return { rowNumber: i + 2, name: name || "(blank)", status, message, data };
    });
    setResults(rows);
  };

  const summary = useMemo(() => {
    const valid = results.filter((r) => r.status === "valid");
    return {
      total: results.length,
      valid: valid.length,
      duplicate: results.filter((r) => r.status === "duplicate").length,
      error: results.filter((r) => r.status === "error").length,
      validRows: valid.map((r) => r.data as StudentWriteInput),
    };
  }, [results]);

  const reset = () => {
    setResults([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const commit = () => {
    if (summary.validRows.length === 0) return;
    commitMut.mutate(
      { rows: summary.validRows, fileName: fileName || "import.csv" },
      { onSuccess: reset }
    );
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "student-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <StudentPageShell
      title="Students Import"
      description="Bulk-import students from a CSV file with validation preview and duplicate detection."
      icon={<FileSpreadsheet className="w-5 h-5" />}
      headerExtra={
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Template
        </Button>
      }
    >
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 space-y-4">
          <div className="glass-card p-6 flex flex-col items-center gap-3 text-center">
            <span className="flex w-12 h-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Upload className="w-6 h-6" />
            </span>
            <div>
              <p className="text-sm font-medium">
                {fileName || "Choose a CSV file to import"}
              </p>
              <p className="text-xs text-muted-foreground">
                Columns: name, roll_number, gender, date_of_birth, parent_name,
                parent_contact, parent_email, address
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                Select CSV
              </Button>
              {results.length > 0 && (
                <Button size="sm" variant="outline" onClick={reset}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {results.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile label="Rows" value={summary.total} />
                <StatTile label="Valid" value={summary.valid} tone="positive" />
                <StatTile label="Duplicates" value={summary.duplicate} tone="warning" />
                <StatTile label="Errors" value={summary.error} tone="danger" />
              </div>

              <div className="flex items-center justify-end">
                <Button
                  onClick={commit}
                  disabled={summary.valid === 0 || commitMut.isPending}
                >
                  {commitMut.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Import {summary.valid} valid student{summary.valid === 1 ? "" : "s"}
                </Button>
              </div>

              <div className="glass-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium">Row</th>
                      <th className="px-5 py-2.5 text-left font-medium">Name</th>
                      <th className="px-5 py-2.5 text-left font-medium">Status</th>
                      <th className="px-5 py-2.5 text-left font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {results.map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-5 py-2 text-muted-foreground">{r.rowNumber}</td>
                        <td className="px-5 py-2 font-medium">{r.name}</td>
                        <td className="px-5 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                              STATUS_STYLE[r.status]
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-5 py-2 text-muted-foreground">{r.message ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={<FileSpreadsheet className="w-5 h-5" />}
                title="No imports yet"
                description="Completed CSV imports will be logged here."
              />
            </div>
          ) : (
            <div className="glass-card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">File</th>
                    <th className="px-5 py-2.5 text-left font-medium">When</th>
                    <th className="px-5 py-2.5 text-center font-medium">Total</th>
                    <th className="px-5 py-2.5 text-center font-medium">Imported</th>
                    <th className="px-5 py-2.5 text-center font-medium">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {history.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-2.5 font-medium">{b.fileName ?? "—"}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {formatDateTime(b.createdAt)}
                      </td>
                      <td className="px-5 py-2.5 text-center">{b.totalRows}</td>
                      <td className="px-5 py-2.5 text-center text-emerald-600">
                        {b.successRows}
                      </td>
                      <td className="px-5 py-2.5 text-center text-red-600">{b.errorRows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </StudentPageShell>
  );
};

export default StudentsImportPage;
