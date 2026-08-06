import { BaseService } from "@/shared/services";
import { emailService } from "@/features/staff/services/email.service";
import { signedUrl, SIGNED_URL_TTL_EMAIL } from "@/lib/storageUrl";
import { payrollRunService } from "./payrollRun.service";
import { generatePayslipPdfBlob } from "../utils/payslipPdf";
import { formatINR } from "../utils/payrollCalc";
import type { PayrollItem, PayrollRun } from "../types/payroll.types";
import { orgPath } from "@/lib/orgStorage";

// ─────────────────────────────────────────────────────────────────────────────
// Payslip email automation — after Management approves a run, each employee is
// emailed THEIR OWN branded salary slip. The "Download Payslip" button is a
// DIRECT link to that employee's PDF: at send time the slip is rendered to a
// PDF, uploaded to the `payslips` storage bucket, and a 30-day SIGNED download
// URL is embedded in the email so clicking it starts the download (no login /
// no app redirect). If PDF generation or upload fails we fall back to the
// in-app My Salary link so the email is still useful.
//
// Routes through the shared `send-email` edge function (Brevo) via the existing
// emailService gateway, so the API key stays server-side and only the registered
// `salary-slip` template can be rendered.
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
  /** Deep link to the recipient's OWN My Salary page — the fallback link. */
  private mySalaryUrl(role?: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const seg = role && ROLE_PATHS.includes(role) ? role : "teacher";
    return `${origin}/${seg}/payroll/my-salary`;
  }

  /**
   * Render the employee's payslip to a PDF, upload it to the `payslips` bucket
   * and return a forced-download SIGNED URL. Returns null on any failure so the
   * caller can fall back to the in-app link.
   *
   * Phase 0 security hardening: the `payslips` bucket used to be PUBLIC and
   * this used getPublicUrl(). A public Supabase bucket is readable by anyone on
   * the internet holding the URL — no auth, no RLS, no expiry — so every salary
   * slip ever emailed stayed permanently exposed. "The path is two random
   * UUIDs" is obscurity, not access control: URLs leak through forwarded mail,
   * mail-scanner logs, and browser history.
   *
   * The link is now signed and expires after 30 days. That window is
   * deliberately long: recipients open payroll mail days or weeks late, and a
   * one-hour TTL would hand most of them a dead link. Finite and revocable
   * beats permanent and public.
   */
  private async uploadPayslipPdf(
    item: PayrollItem,
    run: PayrollRun,
    month: string,
  ): Promise<string | null> {
    try {
      const blob = await generatePayslipPdfBlob(item, run);
      const path = orgPath(`${run.id}/${item.id}.pdf`);
      const up = await this.db.storage
        .from("payslips")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (up.error) return null;
      const fileName = `Payslip-${month.replace(/\s+/g, "-")}.pdf`;
      return await signedUrl("payslips", path, SIGNED_URL_TTL_EMAIL, {
        download: fileName,
      });
    } catch {
      return null;
    }
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

  /**
   * Email employees in the run their own payslip. `month` e.g. "June 2026".
   * Pass `staffIds` to restrict the send to a subset (e.g. resending to selected
   * employees); omit it to email everyone in the run.
   */
  async sendApprovedPayslips(
    runId: string,
    month: string,
    staffIds?: string[],
  ): Promise<PayslipEmailResult[]> {
    const detail = await payrollRunService.getDetail(runId);
    const only = staffIds && staffIds.length > 0 ? new Set(staffIds) : null;
    const items = only ? detail.items.filter((i) => only.has(i.staffId)) : detail.items;
    const contacts = await this.contactsFor(items.map((i) => i.staffId));
    const periodLabel = `${detail.periodStart} – ${detail.periodEnd}`;
    const results: PayslipEmailResult[] = [];

    for (const item of items) {
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
        // Direct PDF download link (falls back to the in-app page on failure).
        const pdfUrl = await this.uploadPayslipPdf(item, detail, month);
        const res = await emailService.sendTemplateEmail({
          templateId: "salary-slip",
          to: { email: contact.email, name: item.staffName },
          params: {
            employeeName: item.staffName ?? "Team Member",
            month,
            netSalary: formatINR(item.netSalary),
            periodLabel,
            downloadUrl: pdfUrl ?? this.mySalaryUrl(contact.role),
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
