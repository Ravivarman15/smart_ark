import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_STATUSES, ALL_PRIORITIES, statusMeta, priorityMeta } from "../utils/taskConfig";
import { useTaskCategories } from "../hooks/useTasks";
import type { TaskFilters as Filters } from "../types/tasks.types";

export const TaskFilterBar = ({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) => {
  const { data: categories = [] } = useTaskCategories();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={filters.search ?? ""}
          onChange={(e) => onChange({ search: e.target.value, page: 1 })}
          placeholder="Search tasks…"
          className="h-9 pl-8"
        />
      </div>

      <Select value={filters.status ?? "all"} onValueChange={(v) => onChange({ status: v as Filters["status"], page: 1 })}>
        <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {ALL_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{statusMeta(s).label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.priority ?? "all"} onValueChange={(v) => onChange({ priority: v as Filters["priority"], page: 1 })}>
        <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          {ALL_PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>{priorityMeta(p).label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.categoryId ?? "all"} onValueChange={(v) => onChange({ categoryId: v, page: 1 })}>
        <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={`${filters.sortBy ?? "created_at"}:${filters.sortDir ?? "desc"}`}
        onValueChange={(v) => {
          const [sortBy, sortDir] = v.split(":") as [Filters["sortBy"], Filters["sortDir"]];
          onChange({ sortBy, sortDir });
        }}
      >
        <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Sort" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="created_at:desc">Newest</SelectItem>
          <SelectItem value="created_at:asc">Oldest</SelectItem>
          <SelectItem value="due_date:asc">Due soonest</SelectItem>
          <SelectItem value="priority:asc">Priority</SelectItem>
          <SelectItem value="progress:desc">Most progress</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
