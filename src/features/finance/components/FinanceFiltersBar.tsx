import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useFinanceCategories } from "../hooks/useFinanceCategories";
import { useFinanceLookups } from "../hooks/useFinanceLookups";
import type {
  FinanceFilters,
  FinanceKind,
  TransactionStatus,
} from "../types/finance.types";

interface Props {
  kind: FinanceKind;
  filters: FinanceFilters;
  onChange: (next: FinanceFilters) => void;
}

const STATUSES: TransactionStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "paid",
  "cancelled",
];

export const FinanceFiltersBar = ({ kind, filters, onChange }: Props) => {
  const { data: categories = [] } = useFinanceCategories(kind);
  const { data: lookups } = useFinanceLookups();
  const branches = lookups?.branches ?? [];

  const set = <K extends keyof FinanceFilters>(k: K, v: FinanceFilters[K]) =>
    onChange({ ...filters, [k]: v });

  const hasActive = Object.keys(filters).some(
    (k) => k !== "type" && filters[k as keyof FinanceFilters] !== undefined && filters[k as keyof FinanceFilters] !== "",
  );

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[160px]">
        <Input
          placeholder="Search title, category, vendor, invoice..."
          value={filters.search ?? ""}
          onChange={(e) => set("search", e.target.value || undefined)}
        />
      </div>
      <Select
        value={filters.status ?? "all"}
        onValueChange={(v) => set("status", v === "all" ? undefined : (v as TransactionStatus))}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.categoryId ?? "all"}
        onValueChange={(v) => set("categoryId", v === "all" ? undefined : v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.branchId ?? "all"}
        onValueChange={(v) => set("branchId", v === "all" ? undefined : v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Branch" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All branches</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={filters.from ?? ""}
        onChange={(e) => set("from", e.target.value || undefined)}
        className="w-[150px]"
      />
      <Input
        type="date"
        value={filters.to ?? ""}
        onChange={(e) => set("to", e.target.value || undefined)}
        className="w-[150px]"
      />
      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ type: filters.type })}
        >
          <X className="h-4 w-4 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
};
