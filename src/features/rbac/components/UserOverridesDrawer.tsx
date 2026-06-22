// ──────────────────────────────────────────────────────────────────────────────
// UserOverridesDrawer — per-staff override editor.
//
// Opens from the Role Center → Users tab. Reuses PermissionBuilder with the
// user's role grants passed in as `inheritance`, so any toggle the manager
// flips visually highlights as "Overridden". On save we diff the draft
// against the inherited values and only persist the cells that actually
// differ — that keeps the override tables minimal and easy to audit.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ACTION_CATALOG,
  MODULE_CATALOG,
  PermissionBuilder,
  resolveAccess,
  useActionRights,
  useRemoveUserActionOverride,
  useRemoveUserOverride,
  useRolePermissions,
  useUpsertUserActionOverride,
  useUpsertUserOverride,
  useUserActionOverrides,
  useUserOverrides,
  type BuilderDraft,
  type BuilderInheritance,
  type CatalogRole,
} from "@/features/rbac";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: CatalogRole;
  user: { id: string; name: string } | null;
}

const buildDraft = (
  role: CatalogRole,
  rolePerms: ReturnType<typeof useRolePermissions>["data"],
  roleActions: ReturnType<typeof useActionRights>["data"],
  userPerms: ReturnType<typeof useUserOverrides>["data"],
  userActions: ReturnType<typeof useUserActionOverrides>["data"],
): { draft: BuilderDraft; inheritance: BuilderInheritance } => {
  const inheritedAccess = resolveAccess({
    role: role.slug,
    rolePermissions: rolePerms ?? [],
    userOverrides: [],
    roleActions: roleActions ?? [],
    userActionOverrides: [],
  });
  const effectiveAccess = resolveAccess({
    role: role.slug,
    rolePermissions: rolePerms ?? [],
    userOverrides: userPerms ?? [],
    roleActions: roleActions ?? [],
    userActionOverrides: userActions ?? [],
  });

  const draft: BuilderDraft = { modules: {}, submodules: {}, actions: {} };
  const inheritance: BuilderInheritance = { modules: {}, submodules: {}, actions: {} };

  for (const m of MODULE_CATALOG) {
    draft.modules[m.id] = effectiveAccess.modules[m.id]?.allowed ?? true;
    inheritance.modules[m.id] = inheritedAccess.modules[m.id]?.allowed ?? true;
    for (const s of m.submodules) {
      draft.submodules[s.id] = effectiveAccess.submodules[s.id]?.allowed ?? true;
      inheritance.submodules[s.id] =
        inheritedAccess.submodules[s.id]?.allowed ?? true;
    }
  }
  for (const a of ACTION_CATALOG) {
    draft.actions[a.id] = effectiveAccess.actions[a.id]?.allowed ?? true;
    inheritance.actions[a.id] = inheritedAccess.actions[a.id]?.allowed ?? true;
  }

  return { draft, inheritance };
};

export const UserOverridesDrawer = ({ open, onOpenChange, role, user }: Props) => {
  const rolePerms = useRolePermissions(role.slug);
  const roleActions = useActionRights(role.slug);
  const userPerms = useUserOverrides(user?.id);
  const userActions = useUserActionOverrides(user?.id);

  const upsertModule = useUpsertUserOverride();
  const removeModule = useRemoveUserOverride();
  const upsertAction = useUpsertUserActionOverride();
  const removeAction = useRemoveUserActionOverride();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<BuilderDraft>({
    modules: {},
    submodules: {},
    actions: {},
  });
  const [inheritance, setInheritance] = useState<BuilderInheritance>({
    modules: {},
    submodules: {},
    actions: {},
  });
  const [original, setOriginal] = useState<BuilderDraft>(draft);

  useEffect(() => {
    if (!open || !user) return;
    if (
      rolePerms.isLoading ||
      roleActions.isLoading ||
      userPerms.isLoading ||
      userActions.isLoading
    ) {
      return;
    }
    const { draft: next, inheritance: nextInh } = buildDraft(
      role,
      rolePerms.data,
      roleActions.data,
      userPerms.data,
      userActions.data,
    );
    setDraft(next);
    setInheritance(nextInh);
    setOriginal(next);
  }, [
    open,
    user,
    role,
    rolePerms.data,
    roleActions.data,
    userPerms.data,
    userActions.data,
    rolePerms.isLoading,
    roleActions.isLoading,
    userPerms.isLoading,
    userActions.isLoading,
  ]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const id of Object.keys(draft.modules)) {
      if (draft.modules[id] !== original.modules[id]) n++;
    }
    for (const id of Object.keys(draft.submodules)) {
      if (draft.submodules[id] !== original.submodules[id]) n++;
    }
    for (const id of Object.keys(draft.actions)) {
      if (draft.actions[id] !== original.actions[id]) n++;
    }
    return n;
  }, [draft, original]);

  const overrideCount = useMemo(() => {
    if (!inheritance) return 0;
    let n = 0;
    for (const id of Object.keys(draft.modules)) {
      if (draft.modules[id] !== inheritance.modules[id]) n++;
    }
    for (const id of Object.keys(draft.submodules)) {
      if (draft.submodules[id] !== inheritance.submodules[id]) n++;
    }
    for (const id of Object.keys(draft.actions)) {
      if (draft.actions[id] !== inheritance.actions[id]) n++;
    }
    return n;
  }, [draft, inheritance]);

  const handleSave = async () => {
    if (!user) return;
    if (dirtyCount === 0) {
      toast.info("No changes to save");
      return;
    }
    const ops: Promise<unknown>[] = [];
    for (const m of MODULE_CATALOG) {
      const draftVal = !!draft.modules[m.id];
      const inheritedVal = !!inheritance.modules[m.id];
      const wasOverridden = draftVal !== inheritedVal;
      const wasInDraft = original.modules[m.id] !== draftVal;
      if (!wasInDraft) continue;
      if (wasOverridden) {
        ops.push(
          upsertModule.mutateAsync({
            userProfileId: user.id,
            moduleId: m.id,
            submoduleId: null,
            canView: draftVal,
            reason: "manual override",
          }),
        );
      } else {
        // Removing the override re-aligns with the role grant.
        ops.push(
          removeModule.mutateAsync({
            userProfileId: user.id,
            moduleId: m.id,
            submoduleId: null,
          }),
        );
      }
      for (const s of m.submodules) {
        const sDraft = !!draft.submodules[s.id];
        const sInherited = !!inheritance.submodules[s.id];
        const sChanged = original.submodules[s.id] !== sDraft;
        if (!sChanged) continue;
        if (sDraft !== sInherited) {
          ops.push(
            upsertModule.mutateAsync({
              userProfileId: user.id,
              moduleId: m.id,
              submoduleId: s.id,
              canView: sDraft,
              reason: "manual override",
            }),
          );
        } else {
          ops.push(
            removeModule.mutateAsync({
              userProfileId: user.id,
              moduleId: m.id,
              submoduleId: s.id,
            }),
          );
        }
      }
    }
    for (const a of ACTION_CATALOG) {
      const aDraft = !!draft.actions[a.id];
      const aInherited = !!inheritance.actions[a.id];
      const aChanged = original.actions[a.id] !== aDraft;
      if (!aChanged) continue;
      if (aDraft !== aInherited) {
        ops.push(
          upsertAction.mutateAsync({
            userProfileId: user.id,
            actionId: a.id,
            isAllowed: aDraft,
            reason: "manual override",
          }),
        );
      } else {
        ops.push(
          removeAction.mutateAsync({
            userProfileId: user.id,
            actionId: a.id,
          }),
        );
      }
    }

    try {
      await Promise.all(ops);
      toast.success(`Synced ${dirtyCount} override change${dirtyCount === 1 ? "" : "s"}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save overrides");
    }
  };

  const handleResetToRole = async () => {
    if (
      !(await confirm({
        type: "warning",
        title: "Reset Overrides",
        description: `Reset ${user?.name ?? "this user"}'s overrides — they'll inherit ${role.name}'s defaults again?`,
        confirmText: "Reset",
      }))
    ) {
      return;
    }
    setDraft({ ...inheritance });
  };

  const isPending =
    upsertModule.isPending ||
    removeModule.isPending ||
    upsertAction.isPending ||
    removeAction.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldQuestion className="w-4 h-4 text-indigo-600" />
            Overrides for {user?.name ?? "—"}
          </SheetTitle>
          <SheetDescription>
            Toggling any row diverges from {role.name}'s defaults. Saving with a
            row matching its inherited value removes the override so the user
            re-inherits the role grant.
          </SheetDescription>
        </SheetHeader>

        <div className="my-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{overrideCount}</strong> active
            override{overrideCount === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>
            <strong className="text-foreground">{dirtyCount}</strong> pending
            change{dirtyCount === 1 ? "" : "s"}
          </span>
        </div>

        <PermissionBuilder
          draft={draft}
          onChange={setDraft}
          inheritance={inheritance}
          disabled={isPending}
          hideToolbar
        />

        <SheetFooter className="flex-row justify-between gap-2 border-t border-border/60 pt-4 mt-4">
          <Button
            variant="ghost"
            onClick={handleResetToRole}
            disabled={isPending}
            className="text-rose-600 hover:text-rose-700"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" /> Reset to role defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending || dirtyCount === 0}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" /> Save overrides
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
