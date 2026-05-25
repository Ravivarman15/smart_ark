import { useMemo, useState } from "react";
import { Search, Users, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RecipientCandidate } from "../types/communication.types";
import { formatPhone } from "../utils/commsCalc";

interface Props {
  candidates: RecipientCandidate[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  loading?: boolean;
  /** Hide candidates with no phone number. */
  requirePhone?: boolean;
}

export const RecipientPicker = ({ candidates, selected, onChange, loading, requirePhone = true }: Props) => {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let list = candidates;
    if (requirePhone) list = list.filter((c) => !!c.phone);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((c) =>
        [c.name, c.phone, c.email, ...Object.values(c.meta ?? {}).map((v) => String(v ?? ""))]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    return list;
  }, [candidates, q, requirePhone]);

  const allOnPageSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) {
      filtered.forEach((c) => next.delete(c.id));
    } else {
      filtered.forEach((c) => next.add(c.id));
    }
    onChange(next);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Recipients</span>
            <Badge variant="outline" className="text-[11px]">
              {selected.size} selected · {candidates.length} total
            </Badge>
          </div>
          <Button size="sm" variant="outline" onClick={toggleAll} disabled={filtered.length === 0}>
            <UserCheck className="w-3.5 h-3.5 mr-1.5" />
            {allOnPageSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone or meta…"
            className="pl-8"
          />
        </div>
        <ScrollArea className="h-72 border rounded-md">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No recipients match this filter.
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 cursor-pointer">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatPhone(c.phone)}
                        {c.email ? ` · ${c.email}` : ""}
                        {c.meta?.batch_name ? ` · ${c.meta.batch_name}` : ""}
                        {c.meta?.campus_name ? ` · ${c.meta.campus_name}` : ""}
                      </p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
