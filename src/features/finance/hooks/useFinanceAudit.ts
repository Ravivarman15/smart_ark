import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { financeAuditService } from "../services";
import type { FinanceAuditEntityType } from "../types/finance.types";

export const useFinanceAudit = (
  entityType: FinanceAuditEntityType,
  entityId: string | null,
) =>
  useQuery({
    queryKey: queryKeys.finance.audit(entityType, entityId ?? ""),
    queryFn: () => financeAuditService.list(entityType, entityId as string),
    enabled: !!entityId,
  });
