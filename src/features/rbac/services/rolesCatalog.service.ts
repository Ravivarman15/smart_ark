import { BaseService, AppError } from "@/shared/services";
import { ROLES, type Role } from "@/core/constants/roles";
import type { CatalogRole, CatalogRoleUpsert } from "../types/role.types";

// ──────────────────────────────────────────────────────────────────────────────
// Roles Catalog service — single CRUD entry point for `rbac_roles`.
//
// Pre-migration behaviour: every query degrades to a synthetic list of the
// 4 built-in roles so the Role Center page renders. Writes throw a clear
// error so management knows to apply the migration.
// ──────────────────────────────────────────────────────────────────────────────

type DbRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  hierarchy_level: number;
  base_role: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  is_system: boolean;
  is_archived: boolean;
  parent_role_slug: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

const toDomain = (r: DbRow): CatalogRole => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description ?? undefined,
  category: r.category ?? undefined,
  hierarchyLevel: r.hierarchy_level ?? 50,
  baseRole: (r.base_role ?? undefined) as CatalogRole["baseRole"],
  color: r.color ?? undefined,
  icon: r.icon ?? undefined,
  isActive: !!r.is_active,
  isSystem: !!r.is_system,
  isArchived: !!r.is_archived,
  parentRoleSlug: r.parent_role_slug ?? undefined,
  createdAt: r.created_at ?? undefined,
  updatedAt: r.updated_at ?? undefined,
  createdBy: r.created_by ?? undefined,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation")
  );
};

// ── Synthetic fallback for pre-migration deployments ────────────────────────
const builtInRoleDefaults: Record<Role, Omit<CatalogRole, "id" | "slug">> = {
  management: {
    name: "Management",
    description: "Executive role with full system access. Bypasses RBAC.",
    category: "leadership",
    hierarchyLevel: 0,
    baseRole: "management",
    color: "amber",
    icon: "Crown",
    isActive: true,
    isSystem: true,
    isArchived: false,
  },
  admin: {
    name: "Admin",
    description: "Operations administrator. Day-to-day control.",
    category: "operations",
    hierarchyLevel: 20,
    baseRole: "admin",
    color: "blue",
    icon: "ShieldCheck",
    isActive: true,
    isSystem: true,
    isArchived: false,
    parentRoleSlug: "management",
  },
  coordinator: {
    name: "Coordinator",
    description: "Academic coordinator.",
    category: "academic",
    hierarchyLevel: 40,
    baseRole: "coordinator",
    color: "emerald",
    icon: "Users",
    isActive: true,
    isSystem: true,
    isArchived: false,
    parentRoleSlug: "admin",
  },
  teacher: {
    name: "Teacher",
    description: "Teaching staff.",
    category: "academic",
    hierarchyLevel: 60,
    baseRole: "teacher",
    color: "sky",
    icon: "GraduationCap",
    isActive: true,
    isSystem: true,
    isArchived: false,
    parentRoleSlug: "coordinator",
  },
};

const syntheticBuiltins = (): CatalogRole[] =>
  ROLES.map((slug) => ({
    id: `builtin:${slug}`,
    slug,
    ...builtInRoleDefaults[slug],
  }));

class RolesCatalogService extends BaseService {
  async list(options?: { includeArchived?: boolean }): Promise<CatalogRole[]> {
    const res = await this.db
      .from("rbac_roles" as never)
      .select(
        "id, slug, name, description, category, hierarchy_level, base_role, color, icon, is_active, is_system, is_archived, parent_role_slug, created_at, updated_at, created_by",
      )
      .order("hierarchy_level", { ascending: true })
      .order("name", { ascending: true });

    if (res.error) {
      if (isTableMissing(res.error)) return syntheticBuiltins();
      throw AppError.fromSupabase(res.error, "rbac_roles.list");
    }
    const rows = ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
    if (options?.includeArchived) return rows;
    return rows.filter((r) => !r.isArchived);
  }

  async get(slug: string): Promise<CatalogRole | null> {
    const res = await this.db
      .from("rbac_roles" as never)
      .select(
        "id, slug, name, description, category, hierarchy_level, base_role, color, icon, is_active, is_system, is_archived, parent_role_slug, created_at, updated_at, created_by",
      )
      .eq("slug", slug)
      .maybeSingle();

    if (res.error) {
      if (isTableMissing(res.error)) {
        return syntheticBuiltins().find((r) => r.slug === slug) ?? null;
      }
      throw AppError.fromSupabase(res.error, "rbac_roles.get");
    }
    return res.data ? toDomain(res.data as unknown as DbRow) : null;
  }

  async create(input: CatalogRoleUpsert, createdBy?: string): Promise<CatalogRole> {
    const payload = {
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      hierarchy_level: input.hierarchyLevel ?? 50,
      base_role: input.baseRole ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      is_active: input.isActive ?? true,
      is_system: false,
      is_archived: false,
      parent_role_slug: input.parentRoleSlug ?? null,
      created_by: createdBy ?? null,
      updated_at: new Date().toISOString(),
    };
    const res = await this.db
      .from("rbac_roles" as never)
      .insert(payload as never)
      .select(
        "id, slug, name, description, category, hierarchy_level, base_role, color, icon, is_active, is_system, is_archived, parent_role_slug, created_at, updated_at, created_by",
      )
      .single();

    if (res.error) {
      if (isTableMissing(res.error)) {
        throw AppError.validation(
          "Role catalog tables aren't set up yet. Ask an admin to run migration supabase/migrations/20260601_role_catalog.sql.",
        );
      }
      throw AppError.fromSupabase(res.error, "rbac_roles.create");
    }
    return toDomain(res.data as unknown as DbRow);
  }

  async update(slug: string, patch: Partial<CatalogRoleUpsert>): Promise<void> {
    const dbPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.hierarchyLevel !== undefined)
      dbPatch.hierarchy_level = patch.hierarchyLevel;
    if (patch.baseRole !== undefined) dbPatch.base_role = patch.baseRole;
    if (patch.color !== undefined) dbPatch.color = patch.color;
    if (patch.icon !== undefined) dbPatch.icon = patch.icon;
    if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
    if (patch.parentRoleSlug !== undefined)
      dbPatch.parent_role_slug = patch.parentRoleSlug;

    const res = await this.db
      .from("rbac_roles" as never)
      .update(dbPatch as never)
      .eq("slug", slug);

    if (res.error) {
      if (isTableMissing(res.error)) {
        throw AppError.validation(
          "Role catalog tables aren't set up yet. Apply the role catalog migration.",
        );
      }
      throw AppError.fromSupabase(res.error, "rbac_roles.update");
    }
  }

  async archive(slug: string, archived = true): Promise<void> {
    const res = await this.db
      .from("rbac_roles" as never)
      .update({
        is_archived: archived,
        is_active: archived ? false : true,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("slug", slug)
      .eq("is_system", false);

    if (res.error) {
      if (isTableMissing(res.error)) {
        throw AppError.validation(
          "Role catalog tables aren't set up yet. Apply the role catalog migration.",
        );
      }
      throw AppError.fromSupabase(res.error, "rbac_roles.archive");
    }
  }
}

export const rolesCatalogService = new RolesCatalogService();
