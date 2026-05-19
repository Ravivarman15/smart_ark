import type { ReactNode } from "react";
import { usePermissions } from "./usePermissions";
import type { Role } from "@/core/constants/roles";

interface Props {
  /** One or more action keys (e.g. "student.control"). Pass either action or role. */
  action?: string;
  /** Allowed roles. If both action and role are set, BOTH must pass. */
  roles?: Role[];
  /** What to render when allowed. */
  children: ReactNode;
  /** What to render when denied. Default: nothing. */
  fallback?: ReactNode;
}

// Declarative permission rendering. Replaces ad-hoc
// `user.role === "admin" && ...` checks sprinkled in components.
//
//   <PermissionGate action="fee.collection">
//     <Button>Collect</Button>
//   </PermissionGate>
//
// Keep the rule in the JSX, not in nested conditionals or imperative if-trees.
export const PermissionGate = ({ action, roles, children, fallback = null }: Props) => {
  const { canDoAction, hasRole } = usePermissions();
  const actionOk = action ? canDoAction(action) : true;
  const roleOk = roles ? hasRole(roles) : true;
  return <>{actionOk && roleOk ? children : fallback}</>;
};
