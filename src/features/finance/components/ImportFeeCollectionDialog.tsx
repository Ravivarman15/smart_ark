import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  Loader2,
  Search,
  Users,
  Wallet,
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
import {
  useCollectedPayments,
  useImportFeePayments,
} from "../hooks/useFeeCollectionImport";
import { formatINR } from "../utils/financeCalc";
import type { CollectedPayment } from "../types/financeImport.types";

// ─────────────────────────────────────────────────────────────────────────────
// "Import Student Fee Collection" popup (Phases 1 + 5). Lists every collected
// fee payment with student context, lets Finance staff filter / select / import
// them into Income — idempotently. Already-imported payments are badged and
// locked so a payment can never be double-counted.
//
// All filtering / pagination is client-side over one fetch: the popup operates
// on a bounded set (collected payments) and derives its filter options from the
// data itself, so options and rows can never drift out of sync.
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

export const ImportFeeCollectionDialog = ({ open, onOpenChange }: Props) => {
  const { data: rows = [], isLoading } = useCollectedPayments({}, open);
  const importMut = useImportFeePayments();

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [className, setClassName] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [feeCategory, setFeeCategory] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [collectedBy, setCollectedBy] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // Filter-option universes derived from the fetched rows.
  const opts = useMemo(
    () => ({
      classes: distinct(rows.map((r) => r.className)),
      sections: distinct(rows.map((r) => r.section)),
      categories: distinct(rows.map((r) => r.feeCategory)),
      methods: distinct(rows.map((r) => r.paymentMethod)),
      statuses: distinct(rows.map((r) => r.status)),
      collectors: distinct(rows.map((r) => r.collectedBy)),
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (month && (r.collectedDate ?? "").slice(0, 7) !== month) return false;
      if (from && (r.collectedDate ?? "") < from) return false;
      if (to && (r.collectedDate ?? "") > to) return false;
      if (className !== ALL && r.className !== className) return false;
      if (section !== ALL && r.section !== section) return false;
      if (feeCategory !== ALL && r.feeCategory !== feeCategory) return false;
      if (method !== ALL && r.paymentMethod !== method) return false;
      if (status !== ALL && r.status !== status) return false;
      if (collectedBy !== ALL && r.collectedBy !== collectedBy) return false;
      if (
        s &&
        ![r.studentName, r.admissionNo, r.receiptNo, r.className, r.feeCategory]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s)
      )
        return false;
      return true;
    });
  }, [rows, search, month, from, to, className, section, feeCategory, method, status, collectedBy]);

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
    const students = new Set<string>();
    let income = 0;
    let discount = 0;
    for (const r of selectedRows) {
      if (r.studentId) students.add(r.studentId);
      income += r.collectedAmount;
      discount += r.discount;
    }
    return { students: students.size, records: selectedRows.length, income, discount };
  }, [selectedRows]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const addAll = (list: CollectedPayment[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of list) if (!r.alreadyImported) next.add(r.id);
      return next;
    });
  const clear = () => setSelected(new Set());

  const runImport = async (payments: CollectedPayment[]) => {
    if (payments.length === 0) {
      toast.error("No importable payments selected");
      return;
    }
    try {
      const res = await importMut.mutateAsync(payments);
      const parts = [`${res.imported} imported`];
      if (res.skipped) parts.push(`${res.skipped} already imported`);
      if (res.failed) parts.push(`${res.failed} failed`);
      toast[res.failed ? "warning" : "success"](
        `Fee collection → Income: ${parts.join(", ")}`,
      );
      clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const resetFilters = () => {
    setSearch("");
    setMonth("");
    setFrom("");
    setTo("");
    setClassName(ALL);
    setSection(ALL);
    setFeeCategory(ALL);
    setMethod(ALL);
    setStatus(ALL);
    setCollectedBy(ALL);
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
            <Wallet className="w-5 h-5 text-emerald-600" />
            Import Student Fee Collection
          </DialogTitle>
          <DialogDescription>
            Post collected fee payments to Finance Income. Already-imported
            payments are locked — a payment is never counted twice.
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
              placeholder="Search student / receipt / admission no"
              className="h-9 w-64 pl-8 text-xs"
            />
          </div>
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
            className="h-9 w-[130px] text-xs"
            aria-label="Month"
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
          {filterSelect(className, setClassName, "Class", opts.classes)}
          {filterSelect(section, setSection, "Section", opts.sections)}
          {filterSelect(feeCategory, setFeeCategory, "Fee Category", opts.categories)}
          {filterSelect(method, setMethod, "Method", opts.methods)}
          {filterSelect(status, setStatus, "Status", opts.statuses)}
          {filterSelect(collectedBy, setCollectedBy, "Collected By", opts.collectors)}
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={resetFilters}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear filters
          </Button>
        </div>

        {/* Selection toolbar */}
        <div className="px-6 py-2 border-b flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {filtered.length} record(s) · {importable.length} importable
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
                <TableHead>Receipt</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Adm. No</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Sec</TableHead>
                <TableHead>Fee Category</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Collected By</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={14}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                    No collected payments match these filters.
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
                        aria-label="Select payment"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.receiptNo ?? "—"}</TableCell>
                    <TableCell className="font-medium">{r.studentName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.admissionNo ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.className ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.section ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.feeCategory ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(r.collectedAmount)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {r.discount ? formatINR(r.discount) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {r.pending ? formatINR(r.pending) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.paymentMethod ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.collectedDate ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.collectedBy ?? "—"}</TableCell>
                    <TableCell>
                      {r.alreadyImported ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Imported
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <FinanceKpiCard
              label="Selected Students"
              value={String(summary.students)}
              tone="info"
              icon={<Users className="w-4 h-4" />}
            />
            <FinanceKpiCard
              label="Selected Records"
              value={String(summary.records)}
              tone="default"
            />
            <FinanceKpiCard
              label="Total Income"
              value={formatINR(summary.income)}
              tone="positive"
              icon={<Wallet className="w-4 h-4" />}
            />
            <FinanceKpiCard
              label="Total Discount"
              value={formatINR(summary.discount)}
              tone="warning"
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
