// ──────────────────────────────────────────────────────────────────────────────
// Role Editor — both create (/management/roles/new) and edit
// (/management/roles/:slug). One page, four tabs:
//
//   1. Details      — name, description, hierarchy, base role, colour, icon
//   2. Permissions  — unified module + submodule + action builder
//   3. Users        — staff list + per-user override editor
//   4. Diagnostics  — effective preview, audit log, orphan/mismatch checks
//
// For the "new" flow only the Details tab is rendered. Saving creates the
// role row and redirects to the full editor at /management/roles/:slug.
// ──────────────────────────────────────────────────────────────────────────────

import { ArrowLeft, Archive, ArchiveRestore, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveIcon } from "@/shared/icons";
import {
  RoleDetailsForm,
  RoleDiagnosticsTab,
  RolePermissionsTab,
  RoleUsersTab,
  useArchiveRole,
  useRoleCatalogEntry,
  useRolesCatalog,
} from "@/features/rbac";

const RoleEditorPage = () => {
  const params = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const slug = params.slug;
  const isNew = !slug || slug === "new";

  const roles = useRolesCatalog({ includeArchived: true });
  const roleQuery = useRoleCatalogEntry(isNew ? undefined : slug);
  const archive = useArchiveRole();

  const role = isNew ? null : roleQuery.data;
  const Icon = resolveIcon(role?.icon ?? "Shield");

  const parentOptions = (roles.data ?? []).map((r) => ({
    slug: r.slug,
    name: r.name,
  }));

  const handleArchive = async () => {
    if (!role) return;
    if (role.isSystem) {
      toast.error("System roles can't be archived");
      return;
    }
    if (
      !confirm(
        role.isArchived
          ? `Restore "${role.name}" so it shows up in role pickers again?`
          : `Archive "${role.name}"? Staff already holding it keep their assignment but the role disappears from pickers.`,
      )
    ) {
      return;
    }
    try {
      await archive.mutateAsync({ slug: role.slug, archived: !role.isArchived });
      toast.success(role.isArchived ? "Role restored" : "Role archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  if (!isNew && roleQuery.isLoading) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Loading role…
      </p>
    );
  }

  if (!isNew && !role) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Role <span className="font-mono">{slug}</span> not found.
        </p>
        <Button variant="link" onClick={() => navigate("/management/roles")}>
          Back to Role Center
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
        <button
          onClick={() => navigate("/management/roles")}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Role Center
        </button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{isNew ? "New role" : role!.name}</span>
      </nav>

      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex w-10 h-10 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600">
            <Icon className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
              {isNew ? "Create Staff Role" : role!.name}
            </h1>
            {role && (
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <span className="font-mono">{role.slug}</span>
                <Badge variant="outline" className="capitalize">
                  {role.category ?? "custom"}
                </Badge>
                {role.baseRole && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    base · {role.baseRole}
                  </Badge>
                )}
                {role.isSystem && (
                  <Badge variant="outline" className="text-[10px]">
                    System
                  </Badge>
                )}
                {role.isArchived && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-rose-500/40 bg-rose-500/10 text-rose-700"
                  >
                    Archived
                  </Badge>
                )}
              </p>
            )}
            {isNew && (
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Start with details, then configure module visibility and action
                rights from the Permissions tab once the role is saved.
              </p>
            )}
          </div>
        </div>
        {role && !role.isSystem && (
          <Button
            variant="outline"
            onClick={handleArchive}
            disabled={archive.isPending}
            className={
              role.isArchived
                ? ""
                : "text-rose-600 hover:text-rose-700 border-rose-200"
            }
          >
            {role.isArchived ? (
              <>
                <ArchiveRestore className="w-4 h-4 mr-1.5" /> Restore
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 mr-1.5" /> Archive
              </>
            )}
          </Button>
        )}
        {role?.isSystem && (
          <Button variant="outline" disabled title="System roles can't be archived">
            <Trash2 className="w-4 h-4 mr-1.5" /> Protected
          </Button>
        )}
      </header>

      {isNew ? (
        <RoleDetailsForm
          role={null}
          parentOptions={parentOptions}
          onSaved={(s) => navigate(`/management/roles/${s}`)}
        />
      ) : (
        <Tabs defaultValue="permissions">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="pt-4">
            <RoleDetailsForm role={role!} parentOptions={parentOptions} />
          </TabsContent>
          <TabsContent value="permissions" className="pt-4">
            <RolePermissionsTab role={role!} />
          </TabsContent>
          <TabsContent value="users" className="pt-4">
            <RoleUsersTab role={role!} />
          </TabsContent>
          <TabsContent value="diagnostics" className="pt-4">
            <RoleDiagnosticsTab role={role!} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default RoleEditorPage;
