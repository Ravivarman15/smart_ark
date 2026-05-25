import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useCommsLookups } from "../hooks/useCommsLookups";
import type { AudienceFilter } from "../types/communication.types";

interface Props {
  value: AudienceFilter;
  onChange: (next: AudienceFilter) => void;
  enabled?: Array<"batch" | "campus" | "standard" | "role" | "segment" | "search" | "dateRange">;
}

const ALL = "__all__";

export const AudienceFilterBar = ({ value, onChange, enabled = ["batch", "campus", "standard", "search"] }: Props) => {
  const { data: lookups } = useCommsLookups();
  const [search, setSearch] = useState(value.search ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (value.search ?? "")) onChange({ ...value, search: search || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const set = (patch: Partial<AudienceFilter>) => onChange({ ...value, ...patch });

  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap gap-3">
        {enabled.includes("campus") && (
          <Select
            value={value.campusIds?.[0] ?? ALL}
            onValueChange={(v) => set({ campusIds: v === ALL ? undefined : [v] })}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="Campus" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All campuses</SelectItem>
              {(lookups?.campuses ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {enabled.includes("standard") && (
          <Select
            value={value.standardIds?.[0] ?? ALL}
            onValueChange={(v) => set({ standardIds: v === ALL ? undefined : [v] })}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="Standard" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All standards</SelectItem>
              {(lookups?.standards ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {enabled.includes("batch") && (
          <Select
            value={value.batchIds?.[0] ?? ALL}
            onValueChange={(v) => set({ batchIds: v === ALL ? undefined : [v] })}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="Batch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All batches</SelectItem>
              {(lookups?.batches ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {enabled.includes("role") && (
          <Select
            value={value.role ?? ALL}
            onValueChange={(v) => set({ role: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="w-40"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {(lookups?.roles ?? []).map((r) => (
                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {enabled.includes("segment") && (
          <Select
            value={value.segment ?? ALL}
            onValueChange={(v) => set({ segment: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="follow_up">Follow-up</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        )}
        {enabled.includes("dateRange") && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={value.dateFrom ?? ""}
              onChange={(e) => set({ dateFrom: e.target.value || undefined })}
              className="w-40"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={value.dateTo ?? ""}
              onChange={(e) => set({ dateTo: e.target.value || undefined })}
              className="w-40"
            />
          </div>
        )}
        {enabled.includes("search") && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name…"
            className="w-56"
          />
        )}
      </CardContent>
    </Card>
  );
};
