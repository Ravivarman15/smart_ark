import { supabase } from "@/integrations/supabase/client";
import { AppError } from "./errors";

// Thin base for entity services. Provides:
//   - the supabase client (so subclasses never re-import it)
//   - a `guard()` helper that converts Supabase's `{ data, error }`
//     pattern into "throw or return data" — eliminating boilerplate
//
// Subclasses stay focused on per-entity mapping and queries.
export abstract class BaseService {
  protected db = supabase;

  protected guard<T>(res: { data: T | null; error: unknown }, entity: string): T {
    if (res.error) throw AppError.fromSupabase(res.error as any, `${entity} query failed`);
    if (res.data === null) throw AppError.notFound(entity);
    return res.data;
  }

  protected guardList<T>(res: { data: T[] | null; error: unknown }, entity: string): T[] {
    if (res.error) throw AppError.fromSupabase(res.error as any, `${entity} query failed`);
    return res.data ?? [];
  }
}
