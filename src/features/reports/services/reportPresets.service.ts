import { BaseService, AppError } from "@/shared/services";
import type {
  ReportFilterValues,
  ReportPreset,
  ReportPresetInput,
} from "../types/reports.types";

// ─────────────────────────────────────────────────────────────────────────────
// Saved report presets. Each preset is a named filter combination that the
// user can re-apply on a report page. Owned rows write back to the
// authenticated profile; shared rows are visible org-wide.
//
// Returns [] when the migration hasn't been applied (graceful degrade).
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  report_key: string;
  name: string;
  description: string | null;
  filters: unknown;
  is_shared: boolean | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
};

const toDomain = (r: Row): ReportPreset => ({
  id: r.id,
  reportKey: r.report_key,
  name: r.name,
  description: r.description ?? undefined,
  filters: (r.filters as ReportFilterValues) ?? {},
  isShared: !!r.is_shared,
  ownerId: r.owner_id ?? undefined,
  ownerName: r.owner_name ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

class ReportPresetsService extends BaseService {
  async list(reportKey?: string): Promise<ReportPreset[]> {
    let q = this.db.from("report_presets").select("*");
    if (reportKey) q = q.eq("report_key", reportKey);
    const { data, error } = await q.order("updated_at", { ascending: false });
    if (error) return [];
    return ((data as Row[]) ?? []).map(toDomain);
  }

  async create(
    input: ReportPresetInput,
    owner?: { id?: string; name?: string },
  ): Promise<ReportPreset> {
    const res = await this.db
      .from("report_presets")
      .insert({
        report_key: input.reportKey,
        name: input.name,
        description: input.description ?? null,
        filters: input.filters as never,
        is_shared: input.isShared ?? false,
        owner_id: owner?.id ?? null,
        owner_name: owner?.name ?? null,
      } as never)
      .select("*")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "preset");
    return toDomain(res.data as unknown as Row);
  }

  async update(
    id: string,
    input: ReportPresetInput,
  ): Promise<ReportPreset> {
    const res = await this.db
      .from("report_presets")
      .update({
        report_key: input.reportKey,
        name: input.name,
        description: input.description ?? null,
        filters: input.filters as never,
        is_shared: input.isShared ?? false,
      } as never)
      .eq("id", id)
      .select("*")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "preset");
    return toDomain(res.data as unknown as Row);
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("report_presets").delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "preset");
  }
}

export const reportPresetsService = new ReportPresetsService();
