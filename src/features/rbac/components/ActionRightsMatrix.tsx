import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, type Role } from "@/core/constants/roles";
import { useModuleCatalog } from "../hooks/useModuleCatalog";
import { useActionRights } from "../hooks/useActionRights";
import { useRolePermissions } from "../hooks/useRolePermissions";
import { useAssignActionRights } from "../hooks/useAssignActionRights";
import {
  deriveEffectiveActions,
  setAllForCategory,
  setAllForSubmodule,
} from "../utils/actionEvaluator";
import { deriveEffectivePermissions } from "../utils/effective";
import {
  ACTION_CATALOG,
  ACTION_CATEGORIES,
  ACTIONS_BY_SUBMODULE,
} from "../constants/actionCatalog";
import type { ActionRightUpsert } from "../types/rbac.types";
import { ActionRightsCard } from "./ActionRightsCard";
import { CopyFromRoleDialog } from "./CopyFromRoleDialog";

interface Props {
  initialRole?: Role;
}

/**
 * Action-rights editor. Mirrors the module-permission matrix layout so the
 * mental model carries over.
 *
 * Edits the *role* layer only — per-user overrides are managed from the
 * staff profile drawer (Phase 4). The save button commits the diff and
 * writes one audit row per changed action.
 */
export const ActionRightsMatrix = ({ initialRole = "admin" }: Props) => {
  const catalog = useModuleCatalog();
  const [role, setRole] = useState<Role | string>(initialRole);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [copyOpen, setCopyOpen] = useState(false);

  const roleActions = useActionRights(role);
  const sourceActions = useActionRights(undefined); // every-role grants for "copy-from"
  const modulePerms = useRolePermissions(role); // submodule visibility context
  const assign = useAssignActionRights();

  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [original, setOriginal] = useState<Record<string, boolean>>({});

  // Recompute draft whenever the role or its grants change.
  useEffect(() => {
    const moduleEff = deriveEffectivePermissions({
      role,
      rolePermissions: modulePerms.data ?? [],
      userOverrides: [],
    });
    const eff = deriveEffectiveActions({
      role,
      modulePermissions: moduleEff,
      roleActions: roleActions.data ?? [],
      userOverrides: [],
    });
    setDraft(eff.actions);
    setOriginal(eff.actions);
  }, [role, roleActions.data, modulePerms.data]);

  // Pre-computed submodule visibility map for the cards. Reading from the
  // editor's draft of module-permissions wouldn't make sense — that's a
  // different page — so we use the persisted layer.
  const submoduleVisibility = useMemo(() => {
    const eff = deriveEffectivePermissions({
      role,
      rolePermissions: modulePerms.data ?? [],
      userOverrides: [],
    });
    return eff.submodules;
  }, [role, modulePerms.data]);

  const toggleAction = (actionId: string, next: boolean) => {
    setDraft((d) => ({ ...d, [actionId]: next }));
  };
  const toggleSubmoduleActions = (submoduleId: string, next: boolean) => {
    setDraft((d) => setAllForSubmodule(d, submoduleId, next));
  };
  const toggleCategory = (cat: string, next: boolean) => {
    setDraft((d) => setAllForCategory(d, cat, next));
  };

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const a of ACTION_CATALOG) {
      if (!!draft[a.id] !== !!original[a.id]) n++;
    }
    return n;
  }, [draft, original]);

  const handleSave = async () => {
    const rows: ActionRightUpsert[] = [];
    for (const a of ACTION_CATALOG) {
      if (!!draft[a.id] !== !!original[a.id]) {
        rows.push({ role, actionId: a.id, isAllowed: !!draft[a.id] });
      }
    }
    if (rows.length === 0) {
      toast.info("No changes to save");
      return;
    }
    try {
      await assign.mutateAsync({ role, rows });
      toast.success(`Saved ${rows.length} action change${rows.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleSelectAll = (value: boolean) => {
    setDraft(() => {
      const next: Record<string, boolean> = {};
      for (const a of ACTION_CATALOG) next[a.id] = value;
      return next;
    });
  };

  const handleReset = () => setDraft(original);

  const handleCopyFromRole = (sourceRole: string) => {
    setCopyOpen(false);
    const source = (sourceActions.data ?? []).filter((r) => r.role === sourceRole);
    const eff = deriveEffectiveActions({
      role: sourceRole,
      modulePermissions: undefined, // copying the action layer only
      roleActions: source,
      userOverrides: [],
    });
    setDraft(eff.actions);
    toast.success(`Copied actions from ${sourceRole}. Review and save.`);
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
          <div className="relative flex-1 lg:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions…"
              className="pl-8 h-9"
            />
          </div>
          <Select value={category || "__all"} onValueChange={(v) => setCategory(v === "__all" ? "" : v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All categories</SelectItem>
              {ACTION_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {category ? (
            <>
              <Button variant="outline" size="sm" onClick={() => toggleCategory(category, true)}>
                Allow all <span className="ml-1 capitalize">{category}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => toggleCategory(category, false)}>
                Deny all <span className="ml-1 capitalize">{category}</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => handleSelectAll(true)}>
                Enable all
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleSelectAll(false)}>
                Disable all
              </Button>
            </>
          )}
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
        {roleActions.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading actions…</p>
        ) : (
          catalog
            .filter((m) => m.submodules.some((s) => (ACTIONS_BY_SUBMODULE[s.id] ?? []).length > 0))
            .map((m) => (
              <ActionRightsCard
                key={m.id}
                module={m}
                submoduleVisibility={submoduleVisibility}
                actions={draft}
                searchTerm={search}
                categoryFilter={category || undefined}
                disabled={assign.isPending}
                onToggleAction={toggleAction}
                onToggleSubmodule={toggleSubmoduleActions}
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
