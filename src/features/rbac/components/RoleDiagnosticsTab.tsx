import { useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  History,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ACTION_CATALOG,
  ACTIONS_BY_SUBMODULE,
  EffectiveAccessPanel,
  GRANTABLE_MODULES,
  MODULE_CATALOG,
  resolveAccess,
  useActionRights,
  useRoleAudit,
  useRolePermissions,
  type CatalogRole,
} from "@/features/rbac";

interface Props {
  role: CatalogRole;
}

interface Finding {
  id: string;
  severity: "warn" | "info";
  label: string;
  detail: string;
}

export const RoleDiagnosticsTab = ({ role }: Props) => {
  const rolePerms = useRolePermissions(role.slug);
  const roleActions = useActionRights(role.slug);
  const audit = useRoleAudit(role.slug);

  const access = useMemo(() => {
    return resolveAccess({
      role: role.slug,
      rolePermissions: rolePerms.data ?? [],
      userOverrides: [],
      roleActions: roleActions.data ?? [],
      userActionOverrides: [],
    });
  }, [role.slug, rolePerms.data, roleActions.data]);

  // ── Diagnostics: orphans, mismatches, stale overrides ────────────────────
  const findings = useMemo<Finding[]>(() => {
    const list: Finding[] = [];
    const moduleGrantIds = new Set((rolePerms.data ?? []).map((r) => r.moduleId));
    const submoduleGrantIds = new Set(
      (rolePerms.data ?? [])
        .filter((r) => r.submoduleId)
        .map((r) => r.submoduleId as string),
    );

    // Orphan module grants — saved row but the catalog removed the module.
    const knownModuleIds = new Set(MODULE_CATALOG.map((m) => m.id));
    for (const id of moduleGrantIds) {
      if (!knownModuleIds.has(id)) {
        list.push({
          id: `orphan-module:${id}`,
          severity: "warn",
          label: "Orphan module grant",
          detail: `${id} is no longer in the module catalog.`,
        });
      }
    }
    const knownSubIds = new Set(
      MODULE_CATALOG.flatMap((m) => m.submodules.map((s) => s.id)),
    );
    for (const id of submoduleGrantIds) {
      if (!knownSubIds.has(id)) {
        list.push({
          id: `orphan-sub:${id}`,
          severity: "warn",
          label: "Orphan submodule grant",
          detail: `${id} is no longer in the catalog.`,
        });
      }
    }

    // Actions enabled while their parent submodule is hidden.
    for (const m of GRANTABLE_MODULES) {
      const modOn = access.modules[m.id]?.allowed ?? true;
      for (const s of m.submodules) {
        const subOn = access.submodules[s.id]?.allowed ?? true;
        if (subOn && !modOn) {
          list.push({
            id: `mismatch-sub:${s.id}`,
            severity: "warn",
            label: "Submodule enabled inside hidden module",
            detail: `${s.label} (${s.id}) is allowed but its parent module ${m.label} is hidden — users will never reach it.`,
          });
        }
        const acts = ACTIONS_BY_SUBMODULE[s.id] ?? [];
        for (const a of acts) {
          const aOn = access.actions[a.id]?.allowed ?? true;
          if (aOn && !subOn) {
            list.push({
              id: `mismatch-action:${a.id}`,
              severity: "warn",
              label: "Action enabled while submodule hidden",
              detail: `${a.label} (${a.id}) is allowed but submodule ${s.label} is hidden.`,
            });
          }
        }
      }
    }

    // Orphan action grants
    const knownActionIds = new Set(ACTION_CATALOG.map((a) => a.id));
    for (const r of roleActions.data ?? []) {
      if (!knownActionIds.has(r.actionId)) {
        list.push({
          id: `orphan-action:${r.actionId}`,
          severity: "warn",
          label: "Orphan action grant",
          detail: `${r.actionId} is no longer in the action catalog.`,
        });
      }
    }

    if (list.length === 0) {
      list.push({
        id: "all-clear",
        severity: "info",
        label: "No diagnostics issues",
        detail:
          "All grants match the current catalog and no parent/child mismatches detected.",
      });
    }

    return list;
  }, [access, rolePerms.data, roleActions.data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Effective access
          </h3>
          <EffectiveAccessPanel
            access={access}
            caption="Computed from saved role grants (no user overrides applied)."
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-indigo-600" />
            Findings ({findings.length})
          </h3>
          <div className="space-y-2">
            {findings.map((f) => (
              <div
                key={f.id}
                className={`rounded-lg border p-3 ${
                  f.severity === "warn"
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-emerald-500/30 bg-emerald-500/10"
                }`}
              >
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  {f.severity === "warn" ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  {f.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">{f.detail}</p>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-medium text-foreground flex items-center gap-2 pt-2">
            <History className="w-4 h-4 text-muted-foreground" />
            Recent lifecycle events
          </h3>
          {audit.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : !audit.data || audit.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No lifecycle events recorded. Once you save changes, they appear
              here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {audit.data.slice(0, 10).map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="capitalize">
                      {entry.eventType.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.payload && Object.keys(entry.payload).length > 0 && (
                    <pre className="text-[10px] text-muted-foreground mt-1 overflow-x-auto">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
