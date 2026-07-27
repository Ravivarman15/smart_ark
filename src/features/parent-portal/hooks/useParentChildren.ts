import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { parentChildrenService } from "../services/parentChildren.service";

/**
 * The signed-in parent's children.
 *
 * Long staleTime: the parent↔student linkage is administrative data that
 * changes when a sibling is admitted, not during a session. Everything that
 * DOES move minute-to-minute (attendance, fees, marks) lives in its own query
 * and is invalidated by ParentRealtimeProvider.
 */
export const useParentChildren = (parentAccountId: string | undefined) =>
  useQuery({
    queryKey: parentAccountId
      ? queryKeys.parentPortal.children(parentAccountId)
      : [...queryKeys.parentPortal.all, "children", "anon"],
    queryFn: () => parentChildrenService.listChildren(parentAccountId as string),
    enabled: !!parentAccountId,
    staleTime: 5 * 60_000,
  });
