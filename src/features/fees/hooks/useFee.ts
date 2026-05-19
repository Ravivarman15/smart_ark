import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feesService } from "../services/fees.service";

/**
 * Single fee record by id. Derived from the merged list — kept simple
 * because per-record reads are rare today; switch to a dedicated
 * service method when a detail page demands it.
 */
export const useFee = (id: string | undefined) =>
  useQuery({
    queryKey: id ? queryKeys.fees.detail(id) : ["fees", "detail", "noop"],
    queryFn: async () => {
      const list = await feesService.list();
      const row = list.find((f) => f.id === id);
      if (!row) throw new Error(`Fee ${id} not found`);
      return row;
    },
    enabled: !!id,
  });
