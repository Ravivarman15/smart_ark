// ──────────────────────────────────────────────────────────────────────────────
// Permission Diagnostics page — "why does this user see / not see X?"
//
// Two modes:
//   1. **Self** — resolves the signed-in management user's effective access
//      using the live resolver. Useful for "let me look at it the way Akshay
//      would see it" by switching roles in the picker.
//   2. **Impersonate** — pick a staff profile and compute their effective
//      access against their role grants + their personal overrides. The result
//      is read-only — we never log them in or change their session.
//
// Both modes share the EffectiveAccessPanel which surfaces the resolver's
// per-key trace (user override → role grant → catalog default → legacy).
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Eye, Search, ShieldQuestion, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffRights } from "@/contexts/StaffRightsContext";
import { useStaff } from "@/features/staff";
import { ROLES, type Role } from "@/core/constants/roles";
import {
  EffectiveAccessPanel,
  resolveAccess,
  useActionRights,
  useEffectiveAccess,
  useRolePermissions,
  useUserActionOverrides,
  useUserOverrides,
} from "@/features/rbac";

type Mode = "self" | "impersonate";

export const PermissionDiagnosticsPage = () => {
  const { user } = useAuth();
  const self = useEffectiveAccess();
  const [mode, setMode] = useState<Mode>("self");
  const [search, setSearch] = useState("");

  const staffQuery = useStaff();
  const staffOptions = useMemo(
    () => (staffQuery.data ?? []).filter((s) => s.role !== "management"),
    [staffQuery.data]
  );

  const [targetId, setTargetId] = useState<string>("");
  const target = staffOptions.find((s) => s.id === targetId);
  const targetRole = (target?.role ?? "admin") as Role;

  useEffect(() => {
    if (!targetId && staffOptions[0]) setTargetId(staffOptions[0].id);
  }, [targetId, staffOptions]);

  // Resolve the *target* user's effective access independently — does NOT
  // mutate the signed-in user's view. The diagnostic is read-only.
  const targetRolePerms = useRolePermissions(targetRole);
  const targetUserOverrides = useUserOverrides(targetId || undefined);
  const targetRoleActions = useActionRights(targetRole);
  const targetUserActionOverrides = useUserActionOverrides(targetId || undefined);
  const legacy = useStaffRights();

  const targetAccess = useMemo(() => {
    return resolveAccess({
      role: targetRole,
      rolePermissions: targetRolePerms.data ?? [],
      userOverrides: targetUserOverrides.data ?? [],
      roleActions: targetRoleActions.data ?? [],
      userActionOverrides: targetUserActionOverrides.data ?? [],
      // For impersonation we don't have the target's *own* legacy snapshot;
      // we pass nothing so the resolver decides off v2 alone. The legacy
      // snapshot only matters for catalog-unknown keys, which the matrix
      // doesn't display anyway.
      legacyModules: {},
      legacyActions: {},
    });
  }, [
    targetRole,
    targetRolePerms.data,
    targetUserOverrides.data,
    targetRoleActions.data,
    targetUserActionOverrides.data,
  ]);

  const filteredSelf = useMemo(() => {
    return filterAccess(self.data, search);
  }, [self.data, search]);
  const filteredTarget = useMemo(() => {
    return filterAccess(targetAccess, search);
  }, [targetAccess, search]);

  void legacy;

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="flex w-9 h-9 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
          <ShieldQuestion className="w-4 h-4" />
        </span>
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Permission Diagnostics
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Inspect what the centralized RBAC resolver decides for any user or
            for yourself. Every check is read-only — no overrides are written.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-lg border border-border/60 bg-card/60 p-3">
        <div className="flex gap-1 rounded-lg border border-border/60 p-1 bg-background">
          <button
            onClick={() => setMode("self")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "self"
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> My access
          </button>
          <button
            onClick={() => setMode("impersonate")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "impersonate"
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <UserCog className="w-3.5 h-3.5" /> Impersonate
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {mode === "impersonate" && (
            <div className="flex items-center gap-2">
              <Label htmlFor="target" className="text-xs text-muted-foreground">
                User
              </Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger id="target" className="w-64 h-9">
                  <SelectValue placeholder="Choose a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · <span className="capitalize">{s.role}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter keys…"
              className="pl-8 h-9"
            />
          </div>
        </div>
      </div>

      {mode === "self" ? (
        <EffectiveAccessPanel
          access={filteredSelf}
          caption={`Signed in as ${user?.name ?? "unknown"} (${user?.role ?? "—"}). ${
            ROLES.length
          } roles available.`}
        />
      ) : (
        <EffectiveAccessPanel
          access={filteredTarget}
          caption={
            target
              ? `Showing what ${target.name} (${targetRole}) sees right now.`
              : "Pick a user to impersonate."
          }
        />
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: open the management → permission matrix in another tab, change a
        grant, and watch this page recompute in realtime — the same resolver
        backs both screens.
      </p>

      <Button asChild variant="ghost" size="sm" className="text-xs">
        <a href="/management/permissions">Back to permission matrix →</a>
      </Button>
    </div>
  );
};

const filterAccess = (
  access: ReturnType<typeof resolveAccess>,
  query: string
) => {
  if (!query) return access;
  const q = query.toLowerCase();
  const match = (id: string) => id.toLowerCase().includes(q);
  return {
    ...access,
    modules: Object.fromEntries(
      Object.entries(access.modules).filter(([id]) => match(id))
    ),
    submodules: Object.fromEntries(
      Object.entries(access.submodules).filter(([id]) => match(id))
    ),
    actions: Object.fromEntries(
      Object.entries(access.actions).filter(([id]) => match(id))
    ),
  };
};

export default PermissionDiagnosticsPage;
