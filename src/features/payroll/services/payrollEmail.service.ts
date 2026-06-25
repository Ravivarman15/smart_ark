import { BaseService } from "@/shared/services";
import { emailService } from "@/features/staff/services/email.service";
import { payrollRunService } from "./payrollRun.service";
import { formatINR } from "../utils/payrollCalc";

// ─────────────────────────────────────────────────────────────────────────────
// Payslip email automation — after Management approves a run, each employee is
// emailed THEIR OWN branded salary slip (net amount + a secure in-app download
// link). Routes through the shared `send-email` edge function (Brevo) via the
// existing emailService gateway, so the API key stays server-side and only the
// registered `salary-slip` template can be rendered.
//
// Entirely best-effort and per-recipient: one missing email never blocks the
// approval or the other sends. Returns a result row per employee so the UI can
// surface a "sent N of M" summary.
// ─────────────────────────────────────────────────────────────────────────────

export interface PayslipEmailResult {
  staffId: string;
  staffName?: string;
  email?: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

interface ProfileContact {
  email?: string;
  role?: string;
}

const ROLE_PATHS = ["management", "admin", "coordinator", "teacher"];

class PayrollEmailService extends BaseService {
  /** Deep link to the recipient's OWN My Salary page (their slip only). */
  private mySalaryUrl(role?: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const seg = role && ROLE_PATHS.includes(role) ? role : "teacher";
    return `${origin}/${seg}/payroll/my-salary`;
  }

  private async contactsFor(staffIds: string[]): Promise<Map<string, ProfileContact>> {
    const map = new Map<string, ProfileContact>();
    if (staffIds.length === 0) return map;
    const res = await this.db
      .from("profiles")
      .select("id, email, role")
      .in("id", staffIds);
    if (res.error) return map;
    for (const r of (res.data as unknown as Record<string, unknown>[]) ?? []) {
      map.set(String(r.id), {
        email: (r.email as string) ?? undefined,
        role: (r.role as string) ?? undefined,
      });
    }
    return map;
  }

  /** Email every employee in the run their own payslip. `month` e.g. "June 2026". */
  async sendApprovedPayslips(
    runId: string,
    month: string,
  ): Promise<PayslipEmailResult[]> {
    const detail = await payrollRunService.getDetail(runId);
    const contacts = await this.contactsFor(detail.items.map((i) => i.staffId));
    const periodLabel = `${detail.periodStart} – ${detail.periodEnd}`;
    const results: PayslipEmailResult[] = [];

    for (const item of detail.items) {
      const contact = contacts.get(item.staffId);
      const base: PayslipEmailResult = {
        staffId: item.staffId,
        staffName: item.staffName,
        email: contact?.email,
        status: "skipped",
      };
      if (!contact?.email) {
        results.push({ ...base, error: "No email on file" });
        continue;
      }
      try {
        const res = await emailService.sendTemplateEmail({
          templateId: "salary-slip",
          to: { email: contact.email, name: item.staffName },
          params: {
            employeeName: item.staffName ?? "Team Member",
            month,
            netSalary: formatINR(item.netSalary),
            periodLabel,
            downloadUrl: this.mySalaryUrl(contact.role),
          },
        });
        results.push({ ...base, status: res.status, error: res.error });
      } catch (e) {
        results.push({ ...base, status: "failed", error: (e as Error).message });
      }
    }
    return results;
  }
}

export const payrollEmailService = new PayrollEmailService();
