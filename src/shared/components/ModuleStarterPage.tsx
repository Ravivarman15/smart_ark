// ──────────────────────────────────────────────────────────────────────────────
// ModuleStarterPage
//
// Lightweight CRUD scaffold for modules whose Supabase backing tables haven't
// shipped yet but whose UI is ready to ship. Used by Certificate, eStudy and
// Live Class right now. Data persists in localStorage via useLocalCollection,
// so the institute can start entering records immediately — when the real
// service lands, swap useLocalCollection for the Supabase service hook and
// the rest of this stays.
//
// Design intent: same visual language as FinancePageShell + EntityCrudTable
// (the established pattern across the app) so these pages don't feel like
// stubs.
// ──────────────────────────────────────────────────────────────────────────────

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EntityCrudTable, type ColumnDef } from "./EntityCrudTable";
import { useLocalCollection } from "@/shared/hooks";

export type StarterFieldType =
  | "text"
  | "textarea"
  | "select"
  | "date"
  | "datetime"
  | "number";

export interface StarterField {
  name: string;
  label: string;
  type: StarterFieldType;
  required?: boolean;
  placeholder?: string;
  /** For "select" fields. */
  options?: { value: string; label: string }[];
  /** Rendered under the input as guidance. */
  hint?: string;
}

export interface StarterRecord {
  id: string;
  createdAt: string;
  [key: string]: string | undefined;
}

export interface ModuleStarterPageProps {
  storageKey: string;
  title: string;
  description: string;
  icon: ReactNode;
  /** Singular noun for "Add X" / "Delete X?" prompts. */
  entityNoun: string;
  fields: StarterField[];
  columns: { key: string; header: string; format?: (v: string | undefined) => ReactNode }[];
  emptyMessage?: string;
  /** When true, hides the "Add" button (used for read-only "My" / "Shared" views). */
  readOnly?: boolean;
  /** Optional filter: only show rows whose field value matches. */
  filter?: { field: string; value: string };
}

const formatDefault = (v: string | undefined): ReactNode => v || "—";

export const ModuleStarterPage = ({
  storageKey,
  title,
  description,
  icon,
  entityNoun,
  fields,
  columns,
  emptyMessage,
  readOnly,
  filter,
}: ModuleStarterPageProps) => {
  const { rows, add, update, remove } = useLocalCollection<StarterRecord>(storageKey);
  const [params, setParams] = useSearchParams();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<StarterRecord | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  // ?new=1 auto-opens the create dialog (consistent with Setup module).
  useEffect(() => {
    if (params.get("new") === "1") {
      openCreate();
      params.delete("new");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setEditorOpen(true);
  };

  const openEdit = (row: StarterRecord) => {
    setEditing(row);
    const next: Record<string, string> = {};
    for (const f of fields) next[f.name] = (row[f.name] as string) ?? "";
    setForm(next);
    setEditorOpen(true);
  };

  const onSave = () => {
    for (const f of fields) {
      if (f.required && !form[f.name]) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    if (editing) {
      update(editing.id, form);
      toast.success(`${entityNoun} updated`);
    } else {
      add({ ...form, createdAt: new Date().toISOString() });
      toast.success(`${entityNoun} created`);
    }
    setEditorOpen(false);
  };

  const onDelete = (row: StarterRecord) => {
    if (!confirm(`Delete this ${entityNoun.toLowerCase()}? This cannot be undone.`)) return;
    remove(row.id);
    toast.success(`${entityNoun} deleted`);
  };

  const filteredRows = useMemo(() => {
    let list = rows;
    if (filter) {
      list = list.filter((r) => (r[filter.field] as string) === filter.value);
    }
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((r) =>
      Object.values(r).some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      ),
    );
  }, [rows, search, filter]);

  const cols = useMemo<ColumnDef<StarterRecord>[]>(
    () =>
      columns.map((c) => ({
        key: c.key,
        header: c.header,
        cell: (row) => (c.format ?? formatDefault)(row[c.key] as string | undefined),
      })),
    [columns],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-accent/10 text-accent shrink-0">
            {icon}
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
          </div>
        </div>
        {!readOnly && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add {entityNoun}
          </Button>
        )}
      </header>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="pl-8 h-9"
        />
      </div>

      <EntityCrudTable
        rows={filteredRows}
        columns={cols}
        rowKey={(r) => r.id}
        emptyMessage={
          emptyMessage ??
          (readOnly
            ? `No ${entityNoun.toLowerCase()}s here yet.`
            : `No ${entityNoun.toLowerCase()}s yet — click "Add ${entityNoun}" to create one.`)
        }
        rowActions={
          readOnly
            ? undefined
            : (row) => [
                { label: "Edit", onClick: () => openEdit(row) },
                {
                  label: "Delete",
                  destructive: true,
                  onClick: () => onDelete(row),
                },
              ]
        }
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        {/*
          Why this dialog is structured as a flex column with max-height:
          some modules (Live Class, eStudy) have 7–9 fields and on laptop
          screens the form bottom + footer fell below the viewport. The
          fixed header/footer + scrollable body keeps Save reachable on
          any screen height without resizing the dialog itself.
        */}
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40 shrink-0">
            <DialogTitle>
              {editing ? `Edit ${entityNoun}` : `Add ${entityNoun}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Update this ${entityNoun.toLowerCase()}'s details.`
                : `Fill in the ${entityNoun.toLowerCase()} details below.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name} className="text-xs font-medium">
                  {f.label}
                  {f.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    value={form[f.name] ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [f.name]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    rows={3}
                  />
                ) : f.type === "select" ? (
                  <Select
                    value={form[f.name] ?? ""}
                    onValueChange={(v) => setForm((p) => ({ ...p, [f.name]: v }))}
                  >
                    <SelectTrigger id={f.name}>
                      <SelectValue placeholder={f.placeholder ?? "Select…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={f.name}
                    type={
                      f.type === "date"
                        ? "date"
                        : f.type === "datetime"
                          ? "datetime-local"
                          : f.type === "number"
                            ? "number"
                            : "text"
                    }
                    value={form[f.name] ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [f.name]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                  />
                )}
                {f.hint && (
                  <p className="text-[11px] text-muted-foreground">{f.hint}</p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border/40 shrink-0 bg-background">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModuleStarterPage;
