import { z } from "zod";
import { ROLES } from "@/core/constants/roles";

const RoleSchema = z.enum(ROLES).or(z.string().min(1));

export const rolePermissionUpsertSchema = z.object({
  role: RoleSchema,
  moduleId: z.string().min(1),
  submoduleId: z.string().min(1).nullable().optional(),
  canView: z.boolean(),
});
export type RolePermissionUpsertValues = z.infer<typeof rolePermissionUpsertSchema>;

export const userOverrideSchema = z.object({
  userProfileId: z.string().uuid(),
  moduleId: z.string().min(1),
  submoduleId: z.string().min(1).nullable().optional(),
  canView: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type UserOverrideValues = z.infer<typeof userOverrideSchema>;

// ── Action rights (Phase 3) ─────────────────────────────────────────────────

export const actionRightUpsertSchema = z.object({
  role: RoleSchema,
  actionId: z.string().min(1),
  isAllowed: z.boolean(),
});
export type ActionRightUpsertValues = z.infer<typeof actionRightUpsertSchema>;

export const userActionOverrideSchema = z.object({
  userProfileId: z.string().uuid(),
  actionId: z.string().min(1),
  isAllowed: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type UserActionOverrideValues = z.infer<typeof userActionOverrideSchema>;

// ── Role catalog (Phase 5) ──────────────────────────────────────────────────

// Slug must be lower-snake_case so it joins cleanly to rbac_role_permissions.role
// and stays URL-safe in routes like /management/roles/:slug.
const slugRegex = /^[a-z][a-z0-9_]*$/;

export const catalogRoleSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(slugRegex, "Use lowercase letters, digits and underscores only"),
  name: z.string().min(2).max(80),
  description: z.string().max(500).nullable().optional(),
  category: z.string().max(40).nullable().optional(),
  hierarchyLevel: z.number().int().min(0).max(100).optional(),
  baseRole: z.enum(ROLES).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  parentRoleSlug: z.string().max(48).nullable().optional(),
});
export type CatalogRoleValues = z.infer<typeof catalogRoleSchema>;
