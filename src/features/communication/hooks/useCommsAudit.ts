import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { commsAuditService } from "../services";
import type { CommsAuditEntity } from "../types/communication.types";

export const useCommsAudit = (entity: CommsAuditEntity, id?: string, limit = 50) =>
  useQuery({
    queryKey: queryKeys.communication.audit(entity, id),
    queryFn: () => commsAuditService.list(entity, id, limit),
    enabled: !!entity,
    staleTime: 30_000,
  });
