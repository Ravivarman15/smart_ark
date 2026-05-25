import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { supabase } from "@/integrations/supabase/client";

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};

interface CommsLookups {
  batches: Array<{ id: string; name: string }>;
  campuses: Array<{ id: string; name: string }>;
  standards: Array<{ id: string; name: string }>;
  roles: string[];
}

export const useCommsLookups = () =>
  useQuery({
    queryKey: queryKeys.communication.recipientCandidates("lookups", {}),
    queryFn: async (): Promise<CommsLookups> => {
      const [b, c, s] = await Promise.all([
        supabase.from("batches" as never).select("id, name").order("name"),
        supabase.from("campuses" as never).select("id, name").order("name"),
        supabase.from("standards" as never).select("id, name").order("name"),
      ]);
      const safe = <T extends { id: string; name: string }>(
        res: { data: unknown; error: { message?: string } | null }
      ): T[] => {
        if (res.error) {
          if (tableMissing(res.error)) return [];
          return [];
        }
        return (res.data as T[]) ?? [];
      };
      return {
        batches: safe(b),
        campuses: safe(c),
        standards: safe(s),
        roles: ["admin", "coordinator", "management", "teacher"],
      };
    },
    staleTime: 5 * 60 * 1000,
  });
