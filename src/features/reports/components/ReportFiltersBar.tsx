import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReportLookups } from "../hooks/useReportLookups";
import { isEmpty, type FilterField } from "../utils/filterEngine";
import type { ReportFilterValues } from "../types/reports.types";

interface Props {
  value: ReportFilterValues;
  onChange: (v: ReportFilterValues) => void;
  enabled?: FilterField[];
  statusOptions?: { value: string; label: string }[];
  paymentOptions?: { value: string; label: string }[];
}

const ALL: FilterField[] = [
  "dateRange",
  "branch",
  "batch",
  "standard",
  "courseType",
  "academicYear",
  "staff",
  "category",
  "status",
  "paymentMethod",
  "vendor",
  "student",
  "search",
];

// Reusable filter row. Pages tell us which inputs to show via `enabled`.
// Lookups (branches, batches, etc) are fetched once and shared via the
// reports lookup hook.
export const ReportFiltersBar = ({
  value,
  onChange,
  enabled = ALL,
  statusOptions,
  paymentOptions,
}: Props) => {
  const { data: lookups } = useReportLookups();
  const set = <K extends keyof ReportFilterValues>(k: K, v: ReportFilterValues[K]) =>
    onChange({ ...value, [k]: v });
  const reset = () => onChange({});
  const show = useMemo(() => new Set(enabled), [enabled]);
  const hasActive = !isEmpty(value);

  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      {show.has("dateRange") && (
        <>
          <Input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => set("from", e.target.value || undefined)}
            className="w-[150px]"
            aria-label="From date"
          />
          <Input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => set("to", e.target.value || undefined)}
            className="w-[150px]"
            aria-label="To date"
          />
        </>
      )}

      {show.has("branch") && (
        <Select
          value={value.branchId ?? "all"}
          onValueChange={(v) => set("branchId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {(lookups?.branches ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("batch") && (
        <Select
          value={value.batchId ?? "all"}
          onValueChange={(v) => set("batchId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All batches</SelectItem>
            {(lookups?.batches ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("standard") && (
        <Select
          value={value.standardId ?? "all"}
          onValueChange={(v) => set("standardId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Standard" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All standards</SelectItem>
            {(lookups?.standards ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("courseType") && (
        <Select
          value={value.courseTypeId ?? "all"}
          onValueChange={(v) => set("courseTypeId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Course type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All course types</SelectItem>
            {(lookups?.courseTypes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("academicYear") && (
        <Select
          value={value.academicYearId ?? "all"}
          onValueChange={(v) => set("academicYearId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Academic year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {(lookups?.academicYears ?? []).map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("staff") && (
        <Select
          value={value.staffId ?? "all"}
          onValueChange={(v) => set("staffId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All staff</SelectItem>
            {(lookups?.staff ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("category") && (
        <Select
          value={value.categoryId ?? "all"}
          onValueChange={(v) => set("categoryId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {[
              ...(lookups?.expenseCategories ?? []),
              ...(lookups?.incomeCategories ?? []),
            ].map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("vendor") && (
        <Select
          value={value.vendorId ?? "all"}
          onValueChange={(v) => set("vendorId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Vendor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {(lookups?.vendors ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("status") && statusOptions && (
        <Select
          value={value.status ?? "all"}
          onValueChange={(v) => set("status", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("paymentMethod") && paymentOptions && (
        <Select
          value={value.paymentMethod ?? "all"}
          onValueChange={(v) => set("paymentMethod", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {paymentOptions.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {show.has("search") && (
        <Input
          placeholder="Search..."
          value={value.search ?? ""}
          onChange={(e) => set("search", e.target.value || undefined)}
          className="flex-1 min-w-[160px]"
        />
      )}

      {hasActive && (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X className="h-4 w-4 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
};
