import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ACTION_CATALOG,
  ACTIONS_BY_SUBMODULE,
  MODULE_CATALOG,
  PermissionBuilder,
  EffectiveAccessPanel,
  resolveAccess,
  useActionRights,
  useAssignActionRights,
  useAssignRolePermissions,
  useResetActionRights,
  useResetRolePermissions,
  useRolePermissions,
  type ActionRightUpsert,
  type BuilderDraft,
  type CatalogRole,
  type RolePermissionUpsert,
} from "@/features/rbac";

interface Props {
  role: CatalogRole;
}

const seedDraftFromRole = (
  role: CatalogRole,
  rolePerms: ReturnType<typeof useRolePermissions>["data"],
  roleActions: ReturnType<typeof useActionRights>["data"],
): BuilderDraft => {
  const eff = resolveAccess({
    role: role.slug,
    rolePermissions: rolePerms ?? [],
    userOverrides: [],
    roleActions: roleActions ?? [],
    userActionOverrides: [],
  });
  const modules: Record<string, boolean> = {};
  const submodules: Record<string, boolean> = {};
  const actions: Record<string, boolean> = {};
  for (const m of MODULE_CATALOG) {
    modules[m.id] = eff.modules[m.id]?.allowed ?? true;
    for (const s of m.submodules) {
      submodules[s.id] = eff.submodules[s.id]?.allowed ?? true;
    }
  }
  for (const a of ACTION_CATALOG) {
    actions[a.id] = eff.actions[a.id]?.allowed ?? true;
  }
  return { modules, submodules, actions };
};

export const RolePermissionsTab = ({ role }: Props) => {
  const rolePerms = useRolePermissions(role.slug);
  const roleActions = useActionRights(role.slug);
  const assignPerms = useAssignRolePermissions();
  const assignActions = useAssignActionRights();
  const resetPerms = useResetRolePermissions();
  const resetActions = useResetActionRights();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<BuilderDraft>({
    modules: {},
    submodules: {},
    actions: {},
  });
  const [original, setOriginal] = useState<BuilderDraft>(draft);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (rolePerms.isLoading || roleActions.isLoading) return;
    const next = seedDraftFromRole(role, rolePerms.data, roleActions.data);
    setDraft(next);
    setOriginal(next);
  }, [role, rolePerms.data, roleActions.data, rolePerms.isLoading, roleActions.isLoading]);

  const dirty = useMemo(() => {
    let count = 0;
    for (const id of Object.keys(draft.modules)) {
      if (draft.modules[id] !== original.modules[id]) count++;
    }
    for (const id of Object.keys(draft.submodules)) {
      if (draft.submodules[id] !== original.submodules[id]) count++;
    }
    for (const id of Object.keys(draft.actions)) {
      if (draft.actions[id] !== original.actions[id]) count++;
    }
    return count;
  }, [draft, original]);

  const previewAccess = useMemo(() => {
    const synth: import("../types/rbac.types").RolePermission[] = [];
    for (const m of MODULE_CATALOG) {
      synth.push({
        id: `draft:${m.id}`,
        role: role.slug,
        moduleId: m.id,
        canView: !!draft.modules[m.id],
      });
      for (const s of m.submodules) {
        synth.push({
          id: `draft:${s.id}`,
          role: role.slug,
          moduleId: m.id,
          submoduleId: s.id,
          canView: !!draft.submodules[s.id],
        });
      }
    }
    const synthActions: import("../types/rbac.types").ActionRight[] = ACTION_CATALOG.map(
      (a) => ({
        id: `draft:${a.id}`,
        role: role.slug,
        actionId: a.id,
        isAllowed: !!draft.actions[a.id],
      }),
    );
    return resolveAccess({
      role: role.slug,
      rolePermissions: synth,
      userOverrides: [],
      roleActions: synthActions,
      userActionOverrides: [],
    });
  }, [role.slug, draft]);

  const handleSave = async () => {
    const moduleRows: RolePermissionUpsert[] = [];
    for (const m of MODULE_CATALOG) {
      if (draft.modules[m.id] !== original.modules[m.id]) {
        moduleRows.push({
          role: role.slug,
          moduleId: m.id,
          submoduleId: null,
          canView: !!draft.modules[m.id],
        });
      }
      for (const s of m.submodules) {
        if (draft.submodules[s.id] !== original.submodules[s.id]) {
          moduleRows.push({
            role: role.slug,
            moduleId: m.id,
            submoduleId: s.id,
            canView: !!draft.submodules[s.id],
          });
        }
      }
    }

    const actionRows: ActionRightUpsert[] = [];
    for (const a of ACTION_CATALOG) {
      if (draft.actions[a.id] !== original.actions[a.id]) {
        actionRows.push({
          role: role.slug,
          actionId: a.id,
          isAllowed: !!draft.actions[a.id],
        });
      }
    }

    if (moduleRows.length === 0 && actionRows.length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      if (moduleRows.length > 0) {
        await assignPerms.mutateAsync({ role: role.slug, rows: moduleRows });
      }
      if (actionRows.length > 0) {
        await assignActions.mutateAsync({ role: role.slug, rows: actionRows });
      }
      toast.success(
        `Saved ${moduleRows.length} module + ${actionRows.length} action change${
          moduleRows.length + actionRows.length === 1 ? "" : "s"
        }`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleSyncDefaults = async () => {
    // Seed every catalog row as explicit; subsequent edits show the matrix as
    // the source of truth (no more "implicit defaultRoles" surprises).
    const moduleRows: RolePermissionUpsert[] = [];
    for (const m of MODULE_CATALOG) {
      const baseRole = role.baseRole ?? role.slug;
      const visible = m.defaultRoles.includes(baseRole as never);
      moduleRows.push({
        role: role.slug,
        moduleId: m.id,
        submoduleId: null,
        canView: visible,
      });
      for (const s of m.submodules) {
        moduleRows.push({
          role: role.slug,
          moduleId: m.id,
          submoduleId: s.id,
          canView: visible,
        });
      }
    }
    const actionRows: ActionRightUpsert[] = ACTION_CATALOG.map((a) => {
      const parentSub = MODULE_CATALOG.find((m) =>
        m.submodules.some((s) => s.id === a.submoduleId),
      );
      const baseRole = role.baseRole ?? role.slug;
      const visible = parentSub?.defaultRoles.includes(baseRole as never) ?? true;
      return { role: role.slug, actionId: a.id, isAllowed: visible };
    });

    try {
      await assignPerms.mutateAsync({
        role: role.slug,
        rows: moduleRows,
        reason: "sync defaults from catalog",
      });
      await assignActions.mutateAsync({
        role: role.slug,
        rows: actionRows,
        reason: "sync defaults from catalog",
      });
      toast.success(`Synced ${moduleRows.length + actionRows.length} catalog defaults`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    }
  };

  const handleHardReset = async () => {
    if (
      !(await confirm({
        type: "danger",
        title: "Reset All Grants",
        description: `Delete every saved permission and action row for "${role.name}"? Falls back to catalog defaults.`,
        confirmText: "Reset",
      }))
    ) {
      return;
    }
    try {
      await Promise.all([
        resetPerms.mutateAsync(role.slug),
        resetActions.mutateAsync(role.slug),
      ]);
      toast.success(`Reset all grants for ${role.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    }
  };

  const isPending =
    assignPerms.isPending ||
    assignActions.isPending ||
    resetPerms.isPending ||
    resetActions.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
        <p className="text-xs text-muted-foreground">
          Editing module visibility AND fine-grained action gates in one place.
          Saving fans out to <span className="font-mono">rbac_role_permissions</span>{" "}
          and <span className="font-mono">rbac_role_actions</span>.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview effective
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncDefaults}
            disabled={isPending}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Sync defaults
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleHardReset}
            disabled={isPending}
            className="text-rose-600 hover:text-rose-700"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset role
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft(original)}
            disabled={dirty === 0}
          >
            Revert
          </Button>
          <Button onClick={handleSave} disabled={isPending || dirty === 0} size="sm">
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            Save {dirty > 0 ? `(${dirty})` : ""}
          </Button>
        </div>
      </div>

      <PermissionBuilder
        draft={draft}
        onChange={setDraft}
        disabled={isPending}
        caption={
          dirty === 0
            ? "All changes saved."
            : `${dirty} unsaved change${dirty === 1 ? "" : "s"}.`
        }
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Effective access — {role.name}</DialogTitle>
            <DialogDescription>
              Resolver output for the current draft. Click any row to see why.
            </DialogDescription>
          </DialogHeader>
          <EffectiveAccessPanel access={previewAccess} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Prevent ACTIONS_BY_SUBMODULE from being tree-shaken when this tab is the
// only consumer of the action catalog re-export chain.
void ACTIONS_BY_SUBMODULE;
