// ──────────────────────────────────────────────────────────────────────────────
// Templates service — CRUD + versioning over the `comms_templates` table.
// Pre-migration: falls back to BUILTIN_TEMPLATES so the UI still renders.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import {
  BUILTIN_TEMPLATES,
  asCommsTemplate,
  type BuiltinTemplate,
} from "../utils/whatsappTemplates";
import type {
  CommsTemplate,
  CommsTemplateInput,
  TemplateButton,
  TemplateMedia,
  TemplateCategory,
} from "../types/communication.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbRow = {
  id: string;
  template_key: string;
  version: number;
  language: string;
  category: string;
  title: string;
  body: string;
  variables: unknown;
  buttons: unknown;
  media: unknown;
  provider_name: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const toDomain = (r: DbRow): CommsTemplate => ({
  id: r.id,
  templateKey: r.template_key,
  version: r.version,
  language: r.language,
  category: (r.category as TemplateCategory) ?? "general",
  title: r.title,
  body: r.body,
  variables: Array.isArray(r.variables) ? (r.variables as string[]) : [],
  buttons: Array.isArray(r.buttons) ? (r.buttons as TemplateButton[]) : [],
  media: r.media ? (r.media as TemplateMedia) : undefined,
  providerName: r.provider_name ?? undefined,
  isActive: !!r.is_active,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (input: CommsTemplateInput): Record<string, unknown> => ({
  template_key: input.templateKey,
  version: input.version ?? 1,
  language: input.language ?? "en",
  category: input.category,
  title: input.title,
  body: input.body,
  variables: input.variables ?? [],
  buttons: input.buttons ?? [],
  media: input.media ?? null,
  provider_name: input.providerName ?? null,
  is_active: input.isActive ?? true,
});

const builtinFallback = (): CommsTemplate[] =>
  BUILTIN_TEMPLATES.map((b: BuiltinTemplate) => asCommsTemplate(b));

class CommsTemplatesService extends BaseService {
  /** List all active templates, sorted by category then title. */
  async list(): Promise<CommsTemplate[]> {
    const res = await this.db
      .from("comms_templates" as never)
      .select(
        "id, template_key, version, language, category, title, body, variables, buttons, media, provider_name, is_active, created_by, created_at, updated_at"
      )
      .order("category", { ascending: true })
      .order("template_key", { ascending: true })
      .order("version", { ascending: false });
    if (res.error) {
      if (isMissingTable(res.error)) return builtinFallback();
      throw AppError.fromSupabase(res.error, "comms_templates.list");
    }
    const rows = (res.data as unknown as DbRow[]) ?? [];
    if (rows.length === 0) return builtinFallback();
    // Deduplicate to the highest version per (key, language).
    const byKey = new Map<string, CommsTemplate>();
    for (const r of rows.map(toDomain)) {
      const k = `${r.templateKey}::${r.language}`;
      const existing = byKey.get(k);
      if (!existing || existing.version < r.version) byKey.set(k, r);
    }
    return Array.from(byKey.values()).sort((a, b) =>
      `${a.category}:${a.title}`.localeCompare(`${b.category}:${b.title}`)
    );
  }

  /** Highest version active template by key (+ optional language). */
  async getByKey(key: string, language = "en"): Promise<CommsTemplate | null> {
    const res = await this.db
      .from("comms_templates" as never)
      .select(
        "id, template_key, version, language, category, title, body, variables, buttons, media, provider_name, is_active, created_by, created_at, updated_at"
      )
      .eq("template_key", key)
      .eq("language", language)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) {
      if (isMissingTable(res.error)) {
        const builtin = BUILTIN_TEMPLATES.find((b) => b.key === key && b.language === language);
        return builtin ? asCommsTemplate(builtin) : null;
      }
      throw AppError.fromSupabase(res.error, "comms_templates.getByKey");
    }
    if (!res.data) {
      const builtin = BUILTIN_TEMPLATES.find((b) => b.key === key && b.language === language);
      return builtin ? asCommsTemplate(builtin) : null;
    }
    return toDomain(res.data as unknown as DbRow);
  }

  /** Insert a new template OR a new version of an existing key. */
  async create(input: CommsTemplateInput): Promise<CommsTemplate | null> {
    const res = await this.db
      .from("comms_templates" as never)
      .insert(toRow(input) as never)
      .select("*")
      .maybeSingle();
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "comms_templates.create");
    }
    return res.data ? toDomain(res.data as unknown as DbRow) : null;
  }

  /** Patch a template by id. */
  async update(id: string, patch: Partial<CommsTemplateInput>): Promise<CommsTemplate | null> {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.body !== undefined) payload.body = patch.body;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.variables !== undefined) payload.variables = patch.variables;
    if (patch.buttons !== undefined) payload.buttons = patch.buttons;
    if (patch.media !== undefined) payload.media = patch.media;
    if (patch.providerName !== undefined) payload.provider_name = patch.providerName;
    if (patch.isActive !== undefined) payload.is_active = patch.isActive;
    if (patch.version !== undefined) payload.version = patch.version;
    if (patch.language !== undefined) payload.language = patch.language;
    const res = await this.db
      .from("comms_templates" as never)
      .update(payload as never)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "comms_templates.update");
    }
    return res.data ? toDomain(res.data as unknown as DbRow) : null;
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("comms_templates" as never).delete().eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "comms_templates.remove");
    }
  }

  /** Seed the DB with the builtin template registry — safe to call multiple times. */
  async seedBuiltins(): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    for (const b of BUILTIN_TEMPLATES) {
      const existing = await this.getByKey(b.key, b.language);
      if (existing && !existing.id.startsWith("builtin:")) {
        skipped++;
        continue;
      }
      const created = await this.create({
        templateKey: b.key,
        version: 1,
        language: b.language,
        category: b.category,
        title: b.title,
        body: b.body,
        variables: b.variables,
        buttons: b.buttons ?? [],
        media: b.media,
        providerName: b.providerName,
        isActive: true,
      });
      if (created) inserted++;
      else skipped++;
    }
    return { inserted, skipped };
  }
}

export const commsTemplatesService = new CommsTemplatesService();
