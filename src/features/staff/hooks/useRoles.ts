import { useMemo } from "react";
import { rolesService, type RoleDescriptor } from "../services/roles.service";

/**
 * Returns the role catalogue. Currently synchronous (roles are a constant
 * union), but exposed as a hook so a future DB-backed roles table can be
 * added without touching callers.
 */
export const useRoles = (): RoleDescriptor[] => useMemo(() => rolesService.list(), []);
