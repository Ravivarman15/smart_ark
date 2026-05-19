import { ReactNode } from "react";
import { useCanDo } from "../hooks/useCanDo";

interface Props {
  /** Catalog action id. Unknown ids default to allowed (permissive). */
  action: string;
  /** Render only when the action is allowed. */
  children: ReactNode;
  /** Optional render shown when the action is denied. Defaults to `null`. */
  fallback?: ReactNode;
  /**
   * Optional pre-resolved boolean — bypass the hook for cases where the
   * parent already evaluated the gate (e.g. inside a map over actions).
   */
  allowed?: boolean;
}

/**
 * Wraps children behind an action-rights gate. Use for whole UI regions
 * (a section, a card, a table column). For interactive controls prefer
 * `ProtectedButton` / `ProtectedMenuItem` so the affordance can be shown
 * as disabled with a tooltip rather than hidden.
 *
 * Important: This is UI ergonomics, not a security boundary. The DB / edge
 * functions are still authoritative; never trust the client gate alone.
 */
export const ActionGuard = ({ action, children, fallback = null, allowed }: Props) => {
  const { canDo } = useCanDo();
  const ok = allowed ?? canDo(action);
  return <>{ok ? children : fallback}</>;
};
