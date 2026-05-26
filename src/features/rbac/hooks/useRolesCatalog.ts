import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import {
  rolesCatalogService,
  roleAuditService,
  roleUsageService,
} from "../services";
import { rbacDebug } from "../utils/rbacDebug";
import type {
  CatalogRole,
  CatalogRoleUpsert,
  RoleAuditEntry,
  RoleUsageStats,
} from "../types/role.types";

// ── Reads ──────────────────────────────────────────────────────────────────
export const useRolesCatalog = (options?: { includeArchived?: boolean }) =>
  useQuery({
    queryKey: queryKeys.rbac.rolesCatalog(options?.includeArchived ?? false),
    queryFn: () => rolesCatalogService.list(options),
    staleTime: 60_000,
  });

export const useRoleCatalogEntry = (slug: string | undefined) =>
  useQuery({
    queryKey: slug
      ? queryKeys.rbac.roleCatalogEntry(slug)
      : ["rbac", "role-catalog", "noop"],
    queryFn: () => rolesCatalogService.get(slug as string),
    enabled: !!slug,
    staleTime: 30_000,
  });

export const useRoleUsage = () =>
  useQuery<Record<string, RoleUsageStats>>({
    queryKey: queryKeys.rbac.roleUsage(),
    queryFn: () => roleUsageService.byRole(),
    staleTime: 30_000,
  });

export const useRoleUsers = (slug: string | undefined) =>
  useQuery({
    queryKey: slug ? queryKeys.rbac.roleUsers(slug) : ["rbac", "role-users", "noop"],
    queryFn: () => roleUsageService.listUsersByRole(slug as string),
    enabled: !!slug,
    staleTime: 30_000,
  });

export const useRoleAudit = (slug: string | undefined) =>
  useQuery<RoleAuditEntry[]>({
    queryKey: slug
      ? queryKeys.rbac.roleAudit(slug)
      : ["rbac", "role-audit", "noop"],
    queryFn: () => roleAuditService.list(slug),
    enabled: !!slug,
    staleTime: 30_000,
  });

// ── Mutations ──────────────────────────────────────────────────────────────
const invalidateRoleCatalog = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: [...queryKeys.rbac.all, "roles-catalog"] });
  qc.invalidateQueries({ queryKey: queryKeys.rbac.roleUsage() });
};

interface CreateArgs extends CatalogRoleUpsert {
  /** Optional seed grants applied on creation (e.g. cloned from another role). */
  seedGrants?: { moduleId: string; submoduleId?: string | null; canView: boolean }[];
  seedActions?: { actionId: string; isAllowed: boolean }[];
}

export const useCreateRole = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: CreateArgs) => {
      const created = await rolesCatalogService.create(args, user?.profileId);
      await roleAuditService.record({
        actorId: user?.profileId,
        roleSlug: created.slug,
        eventType: "created",
        payload: {
          name: created.name,
          baseRole: created.baseRole,
          category: created.category,
        },
      });
      return created;
    },
    onSuccess: (created) => {
      invalidateRoleCatalog(qc);
      rbacDebug("mutation", { source: "useCreateRole", slug: created.slug });
    },
  });
};

export const useUpdateRole = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { slug: string; patch: Partial<CatalogRoleUpsert> }) => {
      await rolesCatalogService.update(args.slug, args.patch);
      await roleAuditService.record({
        actorId: user?.profileId,
        roleSlug: args.slug,
        eventType: "updated",
        payload: args.patch as Record<string, unknown>,
      });
    },
    onSuccess: (_v, args) => {
      invalidateRoleCatalog(qc);
      qc.invalidateQueries({ queryKey: queryKeys.rbac.roleCatalogEntry(args.slug) });
      qc.invalidateQueries({ queryKey: queryKeys.rbac.roleAudit(args.slug) });
      rbacDebug("mutation", { source: "useUpdateRole", slug: args.slug });
    },
  });
};

export const useArchiveRole = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { slug: string; archived: boolean }) => {
      await rolesCatalogService.archive(args.slug, args.archived);
      await roleAuditService.record({
        actorId: user?.profileId,
        roleSlug: args.slug,
        eventType: args.archived ? "archived" : "unarchived",
      });
    },
    onSuccess: (_v, args) => {
      invalidateRoleCatalog(qc);
      qc.invalidateQueries({ queryKey: queryKeys.rbac.roleCatalogEntry(args.slug) });
      rbacDebug("mutation", { source: "useArchiveRole", slug: args.slug });
    },
  });
};

/**
 * Clone an existing role: copies catalog metadata + all module/submodule
 * grants + all action grants into a brand-new slug. Returns the new role so
 * the caller can immediately navigate to its editor.
 */
export const useCloneRole = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: {
      source: CatalogRole;
      newSlug: string;
      newName: string;
    }) => {
      // 1. Create the new role row with the source's metadata.
      const created = await rolesCatalogService.create(
        {
          slug: args.newSlug,
          name: args.newName,
          description: args.source.description ?? null,
          category: args.source.category ?? null,
          hierarchyLevel: args.source.hierarchyLevel,
          baseRole: args.source.baseRole ?? null,
          color: args.source.color ?? null,
          icon: args.source.icon ?? null,
          isActive: true,
          parentRoleSlug: args.source.parentRoleSlug ?? null,
        },
        user?.profileId,
      );

      // 2. Copy grants by reading the source role's rows and re-upserting
      //    against the new slug. We keep this in the hook to keep the catalog
      //    service free of cross-table writes.
      const [{ rolePermissionsService }, { actionRightsService }] = await Promise.all([
        import("../services/rolePermissions.service"),
        import("../services/actionRights.service"),
      ]);
      const [modGrants, actGrants] = await Promise.all([
        rolePermissionsService.list(args.source.slug),
        actionRightsService.list(args.source.slug),
      ]);

      if (modGrants.length > 0) {
        await rolePermissionsService.upsertMany(
          modGrants.map((g) => ({
            role: args.newSlug,
            moduleId: g.moduleId,
            submoduleId: g.submoduleId ?? null,
            canView: g.canView,
          })),
          user?.profileId,
        );
      }
      if (actGrants.length > 0) {
        await actionRightsService.upsertMany(
          actGrants.map((g) => ({
            role: args.newSlug,
            actionId: g.actionId,
            isAllowed: g.isAllowed,
          })),
          user?.profileId,
        );
      }

      await roleAuditService.record({
        actorId: user?.profileId,
        roleSlug: created.slug,
        eventType: "cloned",
        payload: {
          source: args.source.slug,
          modules_copied: modGrants.length,
          actions_copied: actGrants.length,
        },
      });

      return created;
    },
    onSuccess: (created) => {
      invalidateRoleCatalog(qc);
      qc.invalidateQueries({ queryKey: queryKeys.rbac.rolePermissions() });
      qc.invalidateQueries({ queryKey: queryKeys.rbac.roleActions() });
      rbacDebug("mutation", { source: "useCloneRole", slug: created.slug });
    },
  });
};
