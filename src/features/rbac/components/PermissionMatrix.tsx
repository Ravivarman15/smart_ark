import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLES, type Role } from "@/core/constants/roles";
import { useModuleCatalog } from "../hooks/useModuleCatalog";
import { useRolePermissions } from "../hooks/useRolePermissions";
import { useAssignRolePermissions } from "../hooks/useAssignPermissions";
import { deriveEffectivePermissions, setAllSubmodulesForModule } from "../utils/effective";
import type { RolePermissionUpsert } from "../types/rbac.types";
import { CopyFromRoleDialog } from "./CopyFromRoleDialog";
import { ModulePermissionCard } from "./ModulePermissionCard";

interface Props {
  /** Initial role tab. Defaults to "admin". */
  initialRole?: Role;
}

/**
 * Top-level permission editor. Owns:
 *   - role tab state
 *   - local draft of module/submodule toggles (so users can review before
 *     committing — single save button)
 *   - search filter
 *   - copy-from-role + reset
 *
 * Loads the live grants for the selected role, merges with catalog defaults
 * to compute the initial draft, then diffs against the original on save and
 * pushes the diff through `useAssignRolePermissions`.
 */
export const PermissionMatrix = ({ initialRole = "admin" }: Props) => {
  const catalog = useModuleCatalog();
  const [role, setRole] = useState<Role | string>(initialRole);
  const [search, setSearch] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);

  const rolePerms = useRolePermissions(role);
  const sourceRolePerms = useRolePermissions(undefined); // for "copy-from"
  const assign = useAssignRolePermissions();

  // Draft state — mirror of effective permissions for this role, mutable.
  const [draft, setDraft] = useState<{
    modules: Record<string, boolean>;
    submodules: Record<string, boolean>;
  }>({ modules: {}, submodules: {} });

  // Snapshot of the "original" effective state so we can compute a diff on save.
  const [original, setOriginal] = useState<typeof draft>({ modules: {}, submodules: {} });

  // Reset draft whenever the role or its grants change.
  useEffect(() => {
    const eff = deriveEffectivePermissions({
      role,
      rolePermissions: rolePerms.data ?? [],
      // The matrix edits ROLE defaults, not per-user overrides — leave empty.
      userOverrides: [],
    });
    setDraft(eff);
    setOriginal(eff);
  }, [role, rolePerms.data]);

  const toggleModule = (moduleId: string, next: boolean) => {
    setDraft((d) => setAllSubmodulesForModule(d.modules, d.submodules, moduleId, next));
  };
  const toggleSubmodule = (subId: string, next: boolean) => {
    setDraft((d) => ({ ...d, submodules: { ...d.submodules, [subId]: next } }));
  };

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const k of Object.keys(draft.modules)) {
      if (draft.modules[k] !== original.modules[k]) n++;
    }
    for (const k of Object.keys(draft.submodules)) {
      if (draft.submodules[k] !== original.submodules[k]) n++;
    }
    return n;
  }, [draft, original]);

  const handleSave = async () => {
    const rows: RolePermissionUpsert[] = [];
    for (const m of catalog) {
      if (draft.modules[m.id] !== original.modules[m.id]) {
        rows.push({
          role,
          moduleId: m.id,
          submoduleId: null,
          canView: !!draft.modules[m.id],
        });
      }
      for (const s of m.submodules) {
        if (draft.submodules[s.id] !== original.submodules[s.id]) {
          rows.push({
            role,
            moduleId: m.id,
            submoduleId: s.id,
            canView: !!draft.submodules[s.id],
          });
        }
      }
    }
    if (rows.length === 0) {
      toast.info("No changes to save");
      return;
    }
    try {
      await assign.mutateAsync({ role, rows });
      toast.success(`Saved ${rows.length} permission change${rows.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleSelectAll = (value: boolean) => {
    setDraft(() => {
      const modules: Record<string, boolean> = {};
      const submodules: Record<string, boolean> = {};
      for (const m of catalog) {
        modules[m.id] = value;
        for (const s of m.submodules) submodules[s.id] = value;
      }
      return { modules, submodules };
    });
  };

  const handleReset = () => setDraft(original);

  const handleCopyFromRole = (sourceRole: string) => {
    setCopyOpen(false);
    const source = (sourceRolePerms.data ?? []).filter((r) => r.role === sourceRole);
    const eff = deriveEffectivePermissions({
      role: sourceRole,
      rolePermissions: source,
      userOverrides: [],
    });
    setDraft(eff);
    toast.success(`Copied from ${sourceRole}. Review and save.`);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 p-1 bg-card/40">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                role === r
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modules…"
              className="pl-8 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleSelectAll(true)}>
            Enable all
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSelectAll(false)}>
            Disable all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy from…
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={dirtyCount === 0}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={assign.isPending || dirtyCount === 0}>
            {assign.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      {/* Matrix */}
      <div className="space-y-2.5">
        {rolePerms.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading permissions…</p>
        ) : (
          catalog.map((m) => (
            <ModulePermissionCard
              key={m.id}
              module={m}
              moduleEnabled={!!draft.modules[m.id]}
              submodules={draft.submodules}
              searchTerm={search}
              disabled={assign.isPending}
              onToggleModule={(v) => toggleModule(m.id, v)}
              onToggleSubmodule={(id, v) => toggleSubmodule(id, v)}
            />
          ))
        )}
      </div>

      <CopyFromRoleDialog
        open={copyOpen}
        currentRole={role}
        onOpenChange={setCopyOpen}
        onConfirm={handleCopyFromRole}
      />
    </div>
  );
};
