import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// The organization's own roster, for targeting a test.
//
// Read WHOLE rather than per-batch, because the assignment screen has to answer
// "how many students does this selection reach?" — and three of the four scopes
// (everyone, named student, and an unassigned exam meaning everyone) cannot be
// expressed as a batch query at all.
//
// RLS scopes this to the caller's own organization, so "the whole roster" is
// never another tenant's. The rows are the minimum targeting needs: no contact
// details, no addresses, no guardians.
// ─────────────────────────────────────────────────────────────────────────────

export interface RosterEntry {
  id: string;
  name: string;
  rollNumber?: string;
  batchId?: string;
  batchName?: string;
  standardId?: string;
  isActive: boolean;
}

interface Row {
  id: string;
  name: string;
  roll_number: string | null;
  batch_id: string | null;
  standard_id: string | null;
  is_active: boolean | null;
}

export const useStudentRoster = () =>
  useQuery<RosterEntry[]>({
    queryKey: queryKeys.exams.lookups("targeting-roster"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, roll_number, batch_id, standard_id, is_active")
        .order("name", { ascending: true });
      // An empty roster and a failed read look identical to the count, and the
      // count is what a teacher trusts before publishing. Surfacing the error
      // is the difference between "nobody matches" and "we could not check".
      if (error) throw error;

      const rows = (data as unknown as Row[]) ?? [];
      const batchIds = Array.from(
        new Set(rows.map((r) => r.batch_id).filter(Boolean) as string[]),
      );

      let names = new Map<string, string>();
      if (batchIds.length > 0) {
        const { data: batches } = await supabase
          .from("batches")
          .select("id, name")
          .in("id", batchIds);
        names = new Map(
          ((batches as unknown as { id: string; name: string }[]) ?? []).map((b) => [
            b.id,
            b.name,
          ]),
        );
      }

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        rollNumber: r.roll_number ?? undefined,
        batchId: r.batch_id ?? undefined,
        batchName: r.batch_id ? names.get(r.batch_id) : undefined,
        standardId: r.standard_id ?? undefined,
        isActive: r.is_active !== false,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
