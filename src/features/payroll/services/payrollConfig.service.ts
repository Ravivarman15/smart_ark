import { BaseService, AppError } from "@/shared/services";
import { staffService } from "@/features/staff/services/staff.service";
import type {
  PayrollRule,
  PayrollRuleInput,
  PayrollSettings,
  PayrollSettingsInput,
  RoleRate,
  RoleRateInput,
  Shift,
  ShiftInput,
  StaffRate,
  StaffRateInput,
} from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Salary Configuration service — role rates, staff-specific overrides, shifts,
// rules and module settings. The only place that reads/writes the config
// tables. All tables are untyped in the generated Supabase types, so queries go
// through the untyped builder (`from(<name> as never)`), matching the
// attendance/finance pattern.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

class PayrollConfigService extends BaseService {
  // ── Role rates ──────────────────────────────────────────────────────────────
  async listRoleRates(): Promise<RoleRate[]> {
    const { data, error } = await this.db
      .from("payroll_role_rates" as never)
      .select("*")
      .order("role", { ascending: true });
    if (error) return [];
    return ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      role: String(r.role ?? ""),
      label: (r.label as string) ?? undefined,
      hourlyRate: num(r.hourly_rate),
      monthlySalary: num(r.monthly_salary),
      currency: "INR",
      effectiveFrom: (r.effective_from as string) ?? undefined,
      isActive: r.is_active !== false,
      notes: (r.notes as string) ?? undefined,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? r.created_at ?? ""),
    }));
  }

  async upsertRoleRate(input: RoleRateInput, actorId?: string): Promise<string> {
    const payload = {
      role: input.role,
      label: input.label ?? null,
      hourly_rate: input.hourlyRate,
      monthly_salary: input.monthlySalary ?? 0,
      effective_from: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      is_active: input.isActive ?? true,
      notes: input.notes ?? null,
      created_by: actorId ?? null,
    };
    const { data, error } = await this.db
      .from("payroll_role_rates" as never)
      .upsert(payload as never, { onConflict: "role" })
      .select("id")
      .single();
    if (error) throw AppError.fromSupabase(error, "payroll_role_rates");
    return String((data as { id: string }).id);
  }

  async removeRoleRate(id: string): Promise<void> {
    const { error } = await this.db
      .from("payroll_role_rates" as never)
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "payroll_role_rates");
  }

  // ── Staff-specific rates ────────────────────────────────────────────────────
  async listStaffRates(): Promise<StaffRate[]> {
    const { data, error } = await this.db
      .from("payroll_staff_rates" as never)
      .select("*");
    if (error) return [];
    const rows = (data as unknown as Record<string, unknown>[]) ?? [];
    // Hydrate staff identity (name / role / department) in one extra query.
    const ids = [...new Set(rows.map((r) => String(r.staff_id)).filter(Boolean))];
    const byId = new Map<string, { name?: string; role?: string; department?: string }>();
    if (ids.length > 0) {
      const res = await this.db
        .from("profiles")
        .select("id, name, role, department")
        .in("id", ids);
      for (const p of (res.data ?? []) as unknown as Record<string, unknown>[]) {
        byId.set(String(p.id), {
          name: (p.name as string) ?? undefined,
          role: (p.role as string) ?? undefined,
          department: (p.department as string) ?? undefined,
        });
      }
    }
    return rows.map((r) => {
      const prof = byId.get(String(r.staff_id));
      return {
        id: String(r.id),
        staffId: String(r.staff_id),
        staffName: prof?.name,
        role: prof?.role,
        department: prof?.department,
        hourlyRate: r.hourly_rate != null ? num(r.hourly_rate) : undefined,
        monthlySalary: r.monthly_salary != null ? num(r.monthly_salary) : undefined,
        basicSalary: r.basic_salary != null ? num(r.basic_salary) : undefined,
        currency: "INR",
        effectiveFrom: (r.effective_from as string) ?? undefined,
        isActive: r.is_active !== false,
        notes: (r.notes as string) ?? undefined,
        createdAt: String(r.created_at ?? ""),
        updatedAt: String(r.updated_at ?? r.created_at ?? ""),
      } satisfies StaffRate;
    });
  }

  async upsertStaffRate(input: StaffRateInput, actorId?: string): Promise<string> {
    const payload = {
      staff_id: input.staffId,
      hourly_rate: input.hourlyRate ?? null,
      monthly_salary: input.monthlySalary ?? null,
      basic_salary: input.basicSalary ?? null,
      effective_from: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      is_active: input.isActive ?? true,
      notes: input.notes ?? null,
      created_by: actorId ?? null,
    };
    const { data, error } = await this.db
      .from("payroll_staff_rates" as never)
      .upsert(payload as never, { onConflict: "staff_id" })
      .select("id")
      .single();
    if (error) throw AppError.fromSupabase(error, "payroll_staff_rates");
    return String((data as { id: string }).id);
  }

  async removeStaffRate(id: string): Promise<void> {
    const { error } = await this.db
      .from("payroll_staff_rates" as never)
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "payroll_staff_rates");
  }

  // ── Shifts ──────────────────────────────────────────────────────────────────
  async listShifts(): Promise<Shift[]> {
    const { data, error } = await this.db
      .from("payroll_shifts" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return [];
    return ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      scope: (r.scope as Shift["scope"]) ?? "role",
      scopeRef: String(r.scope_ref ?? ""),
      scopeLabel: (r.scope_label as string) ?? undefined,
      startTime: String(r.start_time ?? "09:00"),
      endTime: String(r.end_time ?? "18:00"),
      expectedDailyMinutes: num(r.expected_daily_minutes) || 480,
      expectedWeeklyMinutes: num(r.expected_weekly_minutes) || 2400,
      expectedMonthlyMinutes: num(r.expected_monthly_minutes) || 10560,
      workingDays: num(r.working_days) || 22,
      isActive: r.is_active !== false,
      notes: (r.notes as string) ?? undefined,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? r.created_at ?? ""),
    }));
  }

  async saveShift(input: ShiftInput, id?: string, actorId?: string): Promise<string> {
    const payload = {
      scope: input.scope,
      scope_ref: input.scopeRef,
      scope_label: input.scopeLabel ?? null,
      start_time: input.startTime,
      end_time: input.endTime,
      expected_daily_minutes: input.expectedDailyMinutes ?? 480,
      expected_weekly_minutes: input.expectedWeeklyMinutes ?? 2400,
      expected_monthly_minutes: input.expectedMonthlyMinutes ?? 10560,
      working_days: input.workingDays ?? 22,
      is_active: input.isActive ?? true,
      notes: input.notes ?? null,
      created_by: actorId ?? null,
    };
    if (id) {
      const { error } = await this.db
        .from("payroll_shifts" as never)
        .update(payload as never)
        .eq("id", id);
      if (error) throw AppError.fromSupabase(error, "payroll_shifts");
      return id;
    }
    const { data, error } = await this.db
      .from("payroll_shifts" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw AppError.fromSupabase(error, "payroll_shifts");
    return String((data as { id: string }).id);
  }

  async removeShift(id: string): Promise<void> {
    const { error } = await this.db
      .from("payroll_shifts" as never)
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "payroll_shifts");
  }

  // ── Rules ───────────────────────────────────────────────────────────────────
  async listRules(): Promise<PayrollRule[]> {
    const { data, error } = await this.db
      .from("payroll_rules" as never)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return [];
    return ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      ruleType: (r.rule_type as PayrollRule["ruleType"]) ?? "incentive",
      name: String(r.name ?? ""),
      calcMethod: (r.calc_method as PayrollRule["calcMethod"]) ?? "flat",
      value: num(r.value),
      appliesTo: (r.applies_to as PayrollRule["appliesTo"]) ?? "all",
      appliesRef: (r.applies_ref as string) ?? undefined,
      condition: (r.condition as Record<string, unknown>) ?? undefined,
      isActive: r.is_active !== false,
      sortOrder: num(r.sort_order),
      notes: (r.notes as string) ?? undefined,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? r.created_at ?? ""),
    }));
  }

  async saveRule(input: PayrollRuleInput, id?: string, actorId?: string): Promise<string> {
    const payload = {
      rule_type: input.ruleType,
      name: input.name,
      calc_method: input.calcMethod,
      value: input.value,
      applies_to: input.appliesTo,
      applies_ref: input.appliesRef ?? null,
      condition: input.condition ?? null,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
      notes: input.notes ?? null,
      created_by: actorId ?? null,
    };
    if (id) {
      const { error } = await this.db
        .from("payroll_rules" as never)
        .update(payload as never)
        .eq("id", id);
      if (error) throw AppError.fromSupabase(error, "payroll_rules");
      return id;
    }
    const { data, error } = await this.db
      .from("payroll_rules" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw AppError.fromSupabase(error, "payroll_rules");
    return String((data as { id: string }).id);
  }

  async removeRule(id: string): Promise<void> {
    const { error } = await this.db
      .from("payroll_rules" as never)
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "payroll_rules");
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  async getSettings(): Promise<PayrollSettings> {
    const fallback: PayrollSettings = {
      defaultCurrency: "INR",
      overtimeMultiplier: 1.5,
      payDay: 1,
      defaultPeriod: "monthly",
      autoFinanceSync: true,
      autoNotify: true,
      salaryCategoryName: "Salary",
      includeTeachingHours: false,
    };
    const { data, error } = await this.db
      .from("payroll_settings" as never)
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error || !data) return fallback;
    const r = data as Record<string, unknown>;
    return {
      defaultCurrency: "INR",
      overtimeMultiplier: num(r.overtime_multiplier) || 1.5,
      payDay: num(r.pay_day) || 1,
      defaultPeriod: (r.default_period as PayrollSettings["defaultPeriod"]) ?? "monthly",
      autoFinanceSync: r.auto_finance_sync !== false,
      autoNotify: r.auto_notify !== false,
      salaryCategoryName: String(r.salary_category_name ?? "Salary"),
      includeTeachingHours: r.include_teaching_hours === true,
      updatedAt: (r.updated_at as string) ?? undefined,
    };
  }

  async updateSettings(input: PayrollSettingsInput): Promise<void> {
    const payload: Record<string, unknown> = { id: true };
    if (input.overtimeMultiplier !== undefined)
      payload.overtime_multiplier = input.overtimeMultiplier;
    if (input.payDay !== undefined) payload.pay_day = input.payDay;
    if (input.defaultPeriod !== undefined) payload.default_period = input.defaultPeriod;
    if (input.autoFinanceSync !== undefined)
      payload.auto_finance_sync = input.autoFinanceSync;
    if (input.autoNotify !== undefined) payload.auto_notify = input.autoNotify;
    if (input.salaryCategoryName !== undefined)
      payload.salary_category_name = input.salaryCategoryName;
    if (input.includeTeachingHours !== undefined)
      payload.include_teaching_hours = input.includeTeachingHours;
    const { error } = await this.db
      .from("payroll_settings" as never)
      .upsert(payload as never, { onConflict: "id" });
    if (error) throw AppError.fromSupabase(error, "payroll_settings");
  }

  // ── Lookups ─────────────────────────────────────────────────────────────────
  /** Distinct role labels present across staff (for rule / rate targeting). */
  async roleOptions(): Promise<string[]> {
    const staff = await staffService.list({ includeInactive: true });
    return [...new Set(staff.map((s) => s.role).filter(Boolean) as string[])].sort();
  }

  async departmentOptions(): Promise<string[]> {
    const staff = await staffService.list({ includeInactive: true });
    return [
      ...new Set(staff.map((s) => s.department).filter(Boolean) as string[]),
    ].sort();
  }
}

export const payrollConfigService = new PayrollConfigService();
