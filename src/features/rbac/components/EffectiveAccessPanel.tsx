// ──────────────────────────────────────────────────────────────────────────────
// EffectiveAccessPanel — at-a-glance "what does this user actually see?"
//
// Reads from `useEffectiveAccess` (the resolver result) and renders three
// columns: modules, submodules and actions, with each entry colour-coded by
// outcome. Drives the diagnostics tab inside the permission management page
// and the per-staff preview drawer.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Eye, EyeOff, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GRANTABLE_MODULES } from "../constants/catalog";
import { ACTION_CATALOG } from "../constants/actionCatalog";
import type { AccessEntry, EffectiveAccess } from "../resolver/types";
import { AccessTracePanel } from "./AccessTracePanel";

interface Props {
  access: EffectiveAccess;
  /** Show the "Why?" trace inline when an entry is clicked. */
  showTrace?: boolean;
  /** Header summary line. */
  caption?: string;
}

interface Row {
  id: string;
  label: string;
  entry: AccessEntry;
  group?: string;
}

const EntryRow = ({
  row,
  onSelect,
  selected,
}: {
  row: Row;
  onSelect: () => void;
  selected: boolean;
}) => (
  <button
    onClick={onSelect}
    className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-md transition-colors ${
      selected ? "bg-muted ring-1 ring-border" : "hover:bg-muted/40"
    }`}
  >
    <div className="min-w-0">
      <p className="text-sm text-foreground truncate">{row.label}</p>
      <p className="text-[11px] font-mono text-muted-foreground truncate">
        {row.id}
        {row.group ? ` · ${row.group}` : ""}
      </p>
    </div>
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] ${
        row.entry.allowed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
          : "border-rose-500/40 bg-rose-500/10 text-rose-700"
      }`}
    >
      {row.entry.allowed ? (
        <>
          <Eye className="w-3 h-3" /> Allowed
        </>
      ) : (
        <>
          <EyeOff className="w-3 h-3" /> Denied
        </>
      )}
    </Badge>
  </button>
);

export const EffectiveAccessPanel = ({ access, showTrace = true, caption }: Props) => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const moduleRows = useMemo<Row[]>(() => {
    return GRANTABLE_MODULES.flatMap((m) => {
      const moduleEntry = access.modules[m.id];
      return moduleEntry
        ? [{ id: m.id, label: m.label, entry: moduleEntry }]
        : [];
    });
  }, [access.modules]);

  const submoduleRows = useMemo<Row[]>(() => {
    return GRANTABLE_MODULES.flatMap((m) =>
      m.submodules.flatMap((s) => {
        const entry = access.submodules[s.id];
        return entry
          ? [{ id: s.id, label: s.label, entry, group: m.label }]
          : [];
      })
    );
  }, [access.submodules]);

  const actionRows = useMemo<Row[]>(() => {
    return ACTION_CATALOG.flatMap((a) => {
      const entry = access.actions[a.id];
      return entry
        ? [{ id: a.id, label: a.label, entry, group: a.submoduleId }]
        : [];
    });
  }, [access.actions]);

  const matches = (row: Row) =>
    !search ||
    row.id.toLowerCase().includes(search.toLowerCase()) ||
    row.label.toLowerCase().includes(search.toLowerCase());

  const selectedEntry = selected
    ? (access.modules[selected] ??
        access.submodules[selected] ??
        access.actions[selected])
    : undefined;

  return (
    <div className="space-y-3">
      {caption && (
        <p className="text-xs text-muted-foreground">{caption}</p>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keys…"
          className="pl-8 h-9"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.5fr] gap-3">
        <Tabs defaultValue="modules" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="modules">
              Modules ({moduleRows.length})
            </TabsTrigger>
            <TabsTrigger value="submodules">
              Submodules ({submoduleRows.length})
            </TabsTrigger>
            <TabsTrigger value="actions">
              Actions ({actionRows.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="modules" className="space-y-1 max-h-[480px] overflow-y-auto">
            {moduleRows.filter(matches).map((row) => (
              <EntryRow
                key={row.id}
                row={row}
                selected={selected === row.id}
                onSelect={() => setSelected(row.id)}
              />
            ))}
          </TabsContent>
          <TabsContent value="submodules" className="space-y-1 max-h-[480px] overflow-y-auto">
            {submoduleRows.filter(matches).map((row) => (
              <EntryRow
                key={row.id}
                row={row}
                selected={selected === row.id}
                onSelect={() => setSelected(row.id)}
              />
            ))}
          </TabsContent>
          <TabsContent value="actions" className="space-y-1 max-h-[480px] overflow-y-auto">
            {actionRows.filter(matches).map((row) => (
              <EntryRow
                key={row.id}
                row={row}
                selected={selected === row.id}
                onSelect={() => setSelected(row.id)}
              />
            ))}
          </TabsContent>
        </Tabs>

        {showTrace && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Resolution trace
            </p>
            {selected && selectedEntry ? (
              <AccessTracePanel accessKey={selected} entry={selectedEntry} />
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 px-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Select a row to see why it's allowed or denied.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
