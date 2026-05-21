import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ACTION_DEFS,
  MODULE_KEYS,
  MODULE_LABELS,
  type ModuleKey,
} from "@/contexts/StaffRightsContext";
import { useUserPermissions, useSaveUserPermissions } from "../hooks/useUserPermissions";
import { ModuleAccessTable } from "./ModuleAccessTable";

interface Props {
  staffId: string;
  staffName?: string;
  /** Called after a successful save — used for onboarding audit logging. */
  onSaved?: () => void;
}

// Full permission editor: module toggles + per-action toggles grouped by
// module. Defaults to "everything allowed" when no rows exist in the DB
// — matches the runtime behaviour of `StaffRightsContext` so what you
// see here is what the user actually experiences.
export const PermissionMatrix = ({ staffId, staffName, onSaved }: Props) => {
  const { data, isLoading } = useUserPermissions(staffId);
  const save = useSaveUserPermissions();

  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [actions, setActions] = useState<Record<string, boolean>>({});

  // Hydrate local form state from server response.
  useEffect(() => {
    if (!data) return;
    const nextModules: Record<string, boolean> = {};
    for (const k of MODULE_KEYS) {
      nextModules[k] = data.modules[k] !== false; // default true
    }
    const nextActions: Record<string, boolean> = {};
    for (const a of ACTION_DEFS) {
      nextActions[a.key] = data.actions[a.key] !== false;
    }
    setModules(nextModules);
    setActions(nextActions);
  }, [data]);

  const moduleRows = useMemo(
    () =>
      MODULE_KEYS.map((k) => ({
        key: k,
        label: MODULE_LABELS[k],
        enabled: modules[k] ?? true,
      })),
    [modules]
  );

  const actionsByModule = useMemo(() => {
    const grouped: Record<ModuleKey, { key: string; label: string }[]> = {} as Record<
      ModuleKey,
      { key: string; label: string }[]
    >;
    for (const k of MODULE_KEYS) grouped[k] = [];
    for (const a of ACTION_DEFS) grouped[a.module].push({ key: a.key, label: a.label });
    return grouped;
  }, []);

  const submit = async () => {
    try {
      await save.mutateAsync({ staffId, modules, actions });
      toast.success("Permissions saved");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading permissions…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Modules{staffName ? ` — ${staffName}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ModuleAccessTable
            modules={moduleRows}
            onChange={(k, v) => setModules((m) => ({ ...m, [k]: v }))}
            disabled={save.isPending}
          />
        </CardContent>
      </Card>

      {MODULE_KEYS.map((mk) => {
        const list = actionsByModule[mk];
        if (list.length === 0) return null;
        if (modules[mk] === false) return null; // hide actions when module hidden
        return (
          <Card key={mk}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Actions — {MODULE_LABELS[mk]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {list.map((a) => (
                <div
                  key={a.key}
                  className="flex items-center justify-between border-b last:border-0 py-1.5"
                >
                  <span className="text-sm">{a.label}</span>
                  <Switch
                    checked={actions[a.key] ?? true}
                    onCheckedChange={(v) => setActions((m) => ({ ...m, [a.key]: v }))}
                    disabled={save.isPending}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save permissions"}
        </Button>
      </div>
    </div>
  );
};
