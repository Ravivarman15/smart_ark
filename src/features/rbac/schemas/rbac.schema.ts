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
