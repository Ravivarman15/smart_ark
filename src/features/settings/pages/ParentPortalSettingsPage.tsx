// ──────────────────────────────────────────────────────────────────────────────
// SETTINGS → PARENT PORTAL
//
// Every institution decides which pages ITS OWN parents are offered. A tuition
// centre with no hostel does not want a Transport & Hostel tab; a school that
// settles fees at the counter does not want a Fees page inviting questions it
// has no answer for. Those are product decisions, they differ per organization,
// and until now the portal made them once for everybody.
//
// ┌── SCOPE ───────────────────────────────────────────────────────────────┐
// │ The write goes to `organization_settings`, whose policy is             │
// │ `organization_id = current_org_id() AND has_any_role('admin',          │
// │ 'management')`. ARK's administrator edits ARK's row and there is no    │
// │ request they can construct that reaches another tenant's — the id is   │
// │ never a parameter of the decision.                                     │
// └────────────────────────────────────────────────────────────────────────┘
//
// ┌── WHY THIS PAGE HAS A SAVE BUTTON ─────────────────────────────────────┐
// │ Every other settings screen here saves on toggle, and that is right    │
// │ for a preference that affects the person clicking it. This one does    │
// │ not: one stray tap removes Fees & Receipts from every parent's portal  │
// │ at this institution, immediately, with no signal that it happened.     │
// │                                                                        │
// │ So the switches build a DRAFT, the header states plainly how many      │
// │ pages the change affects, and nothing reaches a parent until it is     │
// │ confirmed. Discard is always available and always restores the saved   │
// │ state, not the defaults.                                               │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsCard } from "../components/SettingsCard";
import {
  CONFIGURABLE_PARENT_MODULES,
  PARENT_GROUP_ORDER,
  PARENT_MODULES,
  toDisabledList,
  type ParentModuleId,
} from "@/features/parent-portal/constants/parentModules";
import {
  useParentModules,
  useSaveParentModules,
} from "@/features/parent-portal/hooks/useParentModules";

const ModuleRow = ({
  label,
  description,
  checked,
  locked,
  lockReason,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  locked: boolean;
  lockReason?: string;
  onChange: (next: boolean) => void;
}) => (
  <div
    className={cn(
      "flex items-start justify-between gap-4 border-b border-border/40 px-4 py-3 last:border-0",
      locked && "opacity-70",
    )}
  >
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <p className="text-xs text-muted-foreground">{locked ? (lockReason ?? description) : description}</p>
    </div>
    <Switch
      checked={checked}
      disabled={locked}
      onCheckedChange={onChange}
      aria-label={`Show ${label} to parents`}
    />
  </div>
);

const ParentPortalSettingsPage = () => {
  const { user } = useAuth();
  const { map, isLoading } = useParentModules();
  const save = useSaveParentModules();

  /** The draft. `null` until the saved state has loaded — see the effect below. */
  const [draft, setDraft] = useState<Set<ParentModuleId> | null>(null);

  const savedEnabled = useMemo(
    () =>
      new Set(
        CONFIGURABLE_PARENT_MODULES.filter((m) => map[m.id]?.enabled).map((m) => m.id),
      ),
    [map],
  );

  // Seed the draft from the saved state once it arrives, and re-seed whenever
  // the saved state changes underneath — which is what happens after a
  // successful save, and is how the "unsaved changes" banner clears itself.
  const savedKey = useMemo(() => [...savedEnabled].sort().join(","), [savedEnabled]);
  useEffect(() => {
    if (!isLoading) setDraft(new Set(savedEnabled));
    // savedKey is the value identity of savedEnabled; the Set itself is a new
    // object on every render and would re-seed the draft mid-edit.
  }, [isLoading, savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = draft ?? savedEnabled;

  const changed = useMemo(() => {
    const before = savedEnabled;
    if (before.size !== current.size) return true;
    for (const id of current) if (!before.has(id)) return true;
    return false;
  }, [savedEnabled, current]);

  const hiddenCount = CONFIGURABLE_PARENT_MODULES.filter((m) => !current.has(m.id)).length;

  const toggle = (id: ParentModuleId, next: boolean) => {
    setDraft((prev) => {
      const base = new Set(prev ?? savedEnabled);
      if (next) base.add(id);
      else base.delete(id);
      return base;
    });
  };

  const onSave = () => {
    save.mutate(
      { disabled: toDisabledList(current), updatedBy: user?.profileId },
      {
        onSuccess: () =>
          toast.success(
            hiddenCount === 0
              ? "Every page is now visible to your parents."
              : `Saved. ${hiddenCount} page${hiddenCount === 1 ? " is" : "s are"} hidden from your parents.`,
          ),
        // The service turns a zero-row write into a real error rather than a
        // silent success, so this message is reached by the case that matters:
        // an account without permission to save.
        onError: (e: Error) => toast.error(e.message || "Could not save the parent portal settings."),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <SettingsCard
        title="Parent Portal"
        description={
          "Choose which sections your parents see when they sign in. This changes what is offered — it is not a permission: what a parent may read is decided by their link to their own child, and is unaffected by anything on this page."
        }
        contentClassName="p-0"
        actions={
          <div className="flex items-center gap-2">
            {changed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(new Set(savedEnabled))}
                disabled={save.isPending}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Discard
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={!changed || save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save changes
            </Button>
          </div>
        }
      >
        {changed && (
          <p className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            Not saved yet. Once you save, this takes effect for every parent at your organization
            the next time their portal loads.
          </p>
        )}

        {PARENT_GROUP_ORDER.map((group) => {
          const rows = PARENT_MODULES.filter((m) => m.group === group);
          if (rows.length === 0) return null;
          return (
            <div key={group || "home"}>
              <p className="border-b border-border/40 bg-muted/30 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group || "Dashboard"}
              </p>
              {rows.map((m) => {
                const state = map[m.id];
                return (
                  <ModuleRow
                    key={m.id}
                    label={m.label}
                    description={m.description}
                    checked={state?.configurable ? current.has(m.id) : !!state?.enabled}
                    locked={!state?.configurable}
                    lockReason={state?.explain}
                    onChange={(next) => toggle(m.id, next)}
                  />
                );
              })}
            </div>
          );
        })}
      </SettingsCard>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Home and Settings cannot be switched off — a parent needs somewhere to land and a way to
        sign out. A section your organization does not have on its plan is shown locked here, and
        turning it on is not possible from this page.
      </p>
    </div>
  );
};

export default ParentPortalSettingsPage;
