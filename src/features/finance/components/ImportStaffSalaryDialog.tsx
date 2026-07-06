import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  Loader2,
  Receipt,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FinanceKpiCard } from "./FinanceKpiCard";
import { useSalaryLines, useImportSalaryLines } from "../hooks/useSalaryImport";
import { formatINR } from "../utils/financeCalc";
import type { SalaryLine } from "../types/financeImport.types";

// ─────────────────────────────────────────────────────────────────────────────
// "Import Staff Salary" popup (Phases 2 + 5). Lists every salary line from
// approved / paid payroll runs and lets Finance staff post them to Expense —
// one Expense per employee, idempotently. Already-imported lines are disabled
// with a grey "Already Imported" badge (source='payroll', source_id=item.id).
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const ALL = "__all__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const distinct = (values: (string | undefined)[]): string[] =>
  Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b),
  );

export const ImportStaffSalaryDialog = ({ open, onOpenChange }: Props) => {
  const { data: rows = [], isLoading } = useSalaryLines({}, open);
  const importMut = useImportSalaryLines();

  const [search, setSearch] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [designation, setDesignation] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [employee, setEmployee] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const opts = useMemo(
    () => ({
      departments: distinct(rows.map((r) => r.department)),
      designations: distinct(rows.map((r) => r.designation)),
      statuses: distinct(rows.map((r) => r.status)),
      methods: distinct(rows.map((r) => r.paymentMethod)),
      employees: distinct(rows.map((r) => r.employeeName)),
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (monthKey && r.monthKey !== monthKey) return false;
      if (from && (r.paymentDate ?? "") < from) return false;
      if (to && (r.paymentDate ?? "") > to) return false;
      if (department !== ALL && r.department !== department) return false;
      if (designation !== ALL && r.designation !== designation) return false;
      if (status !== ALL && r.status !== status) return false;
      if (method !== ALL && r.paymentMethod !== method) return false;
      if (employee !== ALL && r.employeeName !== employee) return false;
      if (
        s &&
        ![r.employeeName, r.employeeCode, r.department, r.designation, r.payrollMonth]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s)
      )
        return false;
      return true;
    });
  }, [rows, search, monthKey, from, to, department, designation, status, method, employee]);

  const importable = useMemo(
    () => filtered.filter((r) => !r.alreadyImported),
    [filtered],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );
  const summary = useMemo(() => {
    const employees = new Set<string>();
    let salary = 0;
    let expense = 0;
    for (const r of selectedRows) {
      if (r.staffId) employees.add(r.staffId);
      salary += r.gross;
      expense += r.net;
    }
    return { employees: employees.size, records: selectedRows.length, salary, expense };
  }, [selectedRows]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const addAll = (list: SalaryLine[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of list) if (!r.alreadyImported) next.add(r.id);
      return next;
    });
  const clear = () => setSelected(new Set());

  const runImport = async (lines: SalaryLine[]) => {
    if (lines.length === 0) {
      toast.error("No importable salary lines selected");
      return;
    }
    try {
      const res = await importMut.mutateAsync(lines);
      const parts = [`${res.imported} imported`];
      if (res.skipped) parts.push(`${res.skipped} already imported`);
      if (res.failed) parts.push(`${res.failed} failed`);
      toast[res.failed ? "warning" : "success"](
        `Salary → Expense: ${parts.join(", ")}`,
      );
      clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const resetFilters = () => {
    setSearch("");
    setMonthKey("");
    setFrom("");
    setTo("");
    setDepartment(ALL);
    setDesignation(ALL);
    setStatus(ALL);
    setMethod(ALL);
    setEmployee(ALL);
    setPage(1);
  };

  const filterSelect = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    options: string[],
  ) => (
    <Select
      value={value}
      onValueChange={(v) => {
        onChange(v);
        setPage(1);
      }}
    >
      <SelectTrigger className="h-9 w-[150px] text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-rose-600" />
            Import Staff Salary
          </DialogTitle>
          <DialogDescription>
            Post approved / paid salary lines to Finance Expense — one Expense per
            employee. Already-imported lines are locked and never counted twice.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="px-6 py-3 border-b bg-muted/20 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search employee / code / department"
              className="h-9 w-64 pl-8 text-xs"
            />
          </div>
          <Input
            type="month"
            value={monthKey}
            onChange={(e) => {
              setMonthKey(e.target.value);
              setPage(1);
            }}
            className="h-9 w-[130px] text-xs"
            aria-label="Payroll month"
          />
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="h-9 w-[140px] text-xs"
            aria-label="From date"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="h-9 w-[140px] text-xs"
            aria-label="To date"
          />
          {filterSelect(department, setDepartment, "Department", opts.departments)}
          {filterSelect(designation, setDesignation, "Designation", opts.designations)}
          {filterSelect(status, setStatus, "Status", opts.statuses)}
          {filterSelect(method, setMethod, "Method", opts.methods)}
          {filterSelect(employee, setEmployee, "Employee", opts.employees)}
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={resetFilters}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear filters
          </Button>
        </div>

        {/* Selection toolbar */}
        <div className="px-6 py-2 border-b flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {filtered.length} salary line(s) · {importable.length} importable
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => addAll(importable)}>
              Select All
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => addAll(filtered)}>
              Select Filtered
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => addAll(pageRows)}>
              Select Page
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clear}>
              Clear Selection
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="max-h-[38vh] overflow-auto px-6">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Emp ID</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Payroll Month</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Pay Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={12}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    No salary lines match these filters (only approved / paid runs appear).
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow
                    key={r.id}
                    className={r.alreadyImported ? "opacity-60" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        disabled={r.alreadyImported}
                        onCheckedChange={() => toggle(r.id)}
                        aria-label="Select salary line"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.employeeCode}</TableCell>
                    <TableCell className="font-medium">{r.employeeName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.department ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.designation ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.payrollMonth ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{formatINR(r.gross)}</TableCell>
                    <TableCell className="text-right text-xs">
                      {r.allowances ? formatINR(r.allowances) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {r.deductions ? formatINR(r.deductions) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatINR(r.net)}</TableCell>
                    <TableCell className="text-xs">{r.paymentDate ?? "—"}</TableCell>
                    <TableCell>
                      {r.alreadyImported ? (
                        <Badge
                          variant="secondary"
                          className="gap-1 bg-muted text-muted-foreground"
                          title="Already Imported"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Already Imported
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="capitalize">
                          {r.status}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="px-6 py-2 border-t flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Page {safePage} of {pageCount}
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={safePage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Summary + actions */}
        <div className="px-6 py-3 border-t bg-muted/20 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <FinanceKpiCard
              label="Selected Employees"
              value={String(summary.employees)}
              tone="info"
              icon={<Users className="w-4 h-4" />}
            />
            <FinanceKpiCard
              label="Selected Salary (Gross)"
              value={formatINR(summary.salary)}
              tone="default"
            />
            <FinanceKpiCard
              label="Selected Expense (Net)"
              value={formatINR(summary.expense)}
              tone="negative"
              icon={<Receipt className="w-4 h-4" />}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={importMut.isPending || importable.length === 0}
              onClick={() => runImport(importable)}
            >
              {importMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              Import All ({importable.length})
            </Button>
            <Button
              disabled={importMut.isPending || selectedRows.length === 0}
              onClick={() => runImport(selectedRows.filter((r) => !r.alreadyImported))}
            >
              {importMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1" />
              )}
              Import Selected ({summary.records})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
