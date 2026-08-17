import { BaseService } from "@/shared/services";
import { emailService } from "@/features/staff/services/email.service";
import { signedUrl, SIGNED_URL_TTL_EMAIL } from "@/lib/storageUrl";
import { blobToBase64 } from "@/lib/base64";
import { payrollRunService } from "./payrollRun.service";
import { generatePayslipPdfBlob } from "../utils/payslipPdf";
import { formatINR } from "../utils/payrollCalc";
import type { PayrollItem, PayrollRun } from "../types/payroll.types";
import { orgPath } from "@/lib/orgStorage";

// ─────────────────────────────────────────────────────────────────────────────
// PAYSLIP EMAIL AUTOMATION
//
// After Management approves a run, every employee is emailed THEIR OWN branded
// salary slip.
//
// ┌── THE PDF IS ATTACHED, NOT ONLY LINKED ────────────────────────────────┐
// │ It used to be link-only: render the slip → upload to the `payslips`    │
// │ bucket → email a signed URL. When any step of that failed the code     │
// │ substituted a link to the in-app My Salary page and said nothing, so   │
// │ a button labelled "Download Payslip" opened a LOGIN SCREEN. The        │
// │ recipient is an employee reading mail on a phone; they do not have a   │
// │ session, and nothing in the email admitted the file was missing.       │
// │                                                                        │
// │ The PDF is now ATTACHED to the message, the way the fee receipt        │
// │ already is (send-email → Brevo `attachment`). An attachment needs no   │
// │ login, never expires, survives forwarding and works offline — it is    │
// │ strictly better than any link, and it removes the dependency on        │
// │ storage being reachable at send time.                                  │
// │                                                                        │
// │ The signed download link is still generated as a convenience, but it   │
// │ is now INDEPENDENT: a storage failure costs the button, not the file.  │
// └────────────────────────────────────────────────────────────────────────┘
//
// ┌── NO SILENT DEGRADATION ───────────────────────────────────────────────┐
// │ The old `catch { return null }` destroyed the only evidence of why the │
// │ payslip was missing, and the result row still said "sent". Every       │
// │ failure now carries a reason: it is logged, returned per employee, and │
// │ shown to the approver. The EMAIL also stops lying — when there is no   │
// │ file, the button is labelled for what it does and says a sign-in is    │
// │ needed.                                                                │
// └────────────────────────────────────────────────────────────────────────┘
//
// Routes through the shared `send-email` edge function (Brevo) via the existing
// emailService gateway, so the API key stays server-side and only the registered
// `salary-slip` template can be rendered.
//
// Entirely best-effort and per-recipient: one missing email never blocks the
// approval or the other sends. Returns a result row per employee so the UI can
// surface a "sent N of M" summary.
// ─────────────────────────────────────────────────────────────────────────────

/** How the employee can actually obtain their PDF. */
export type PayslipDelivery = "attached" | "linked" | "unavailable";

export interface PayslipEmailResult {
  staffId: string;
  staffName?: string;
  email?: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  /**
   * `attached`    — the PDF is in the message (may also be linked).
   * `linked`      — too large to attach; the signed download link carries it.
   * `unavailable` — no PDF at all; the email points at My Salary and says so.
   */
  pdf: PayslipDelivery;
  /** Why the PDF is degraded. Present whenever `pdf` is not "attached". */
  pdfError?: string;
}

/**
 * One sentence for the approver when a payslip went out degraded, or null when
 * every recipient got their PDF.
 *
 * Exists so "sent 5/5" can never be the whole story again. The count answers
 * "did the mail leave", which is not the question an approver is actually
 * asking — that question is "does my employee have their payslip".
 */
export const summarisePayslipDelivery = (
  results: PayslipEmailResult[],
): string | null => {
  const degraded = results.filter((r) => r.status === "sent" && r.pdf !== "attached");
  if (degraded.length === 0) return null;
  const reason = degraded.find((r) => r.pdfError)?.pdfError;
  const noun = degraded.length === 1 ? "email" : "emails";
  return (
    `${degraded.length} ${noun} sent without the payslip attached` +
    (reason ? ` — ${reason}.` : ".")
  );
};

interface ProfileContact {
  email?: string;
  role?: string;
}

/**
 * Brevo accepts a 10 MB message; base64 inflates a file by ~4/3. A payslip is
 * a single rasterised A4 page and lands well under this, so exceeding it means
 * something is wrong — the cap keeps a runaway render from failing the SEND
 * rather than just the attachment.
 */
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

const ROLE_PATHS = ["management", "admin", "coordinator", "teacher"];

/** What the render + upload produced, and what it could not. */
interface PayslipArtifact {
  /** base64 PDF for the message attachment. */
  attachment?: string;
  /** Signed, forced-download storage URL for the button. */
  url?: string;
  /** Human-readable reason something is missing. Never silently absent. */
  error?: string;
}

class PayrollEmailService extends BaseService {
  /** Deep link to the recipient's OWN My Salary page — the last-resort link. */
  private mySalaryUrl(role?: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const seg = role && ROLE_PATHS.includes(role) ? role : "teacher";
    return `${origin}/${seg}/payroll/my-salary`;
  }

  private fileName(month: string): string {
    return `Payslip-${month.replace(/\s+/g, "-")}.pdf`;
  }

  /**
   * Render the employee's payslip once, then derive both deliverables from it.
   *
   * The attachment is produced FIRST and the upload cannot invalidate it. That
   * ordering is the fix: previously a storage or signing failure discarded a
   * perfectly good PDF that was already in memory.
   *
   * Phase 0 security hardening: the `payslips` bucket used to be PUBLIC and this
   * used getPublicUrl(). A public Supabase bucket is readable by anyone on the
   * internet holding the URL — no auth, no RLS, no expiry — so every salary slip
   * ever emailed stayed permanently exposed. "The path is two random UUIDs" is
   * obscurity, not access control: URLs leak through forwarded mail,
   * mail-scanner logs and browser history. The link is signed and expires after
   * 30 days; that window is deliberately long because recipients open payroll
   * mail weeks late, and finite-and-revocable beats permanent-and-public.
   */
  private async buildArtifact(
    item: PayrollItem,
    run: PayrollRun,
    month: string,
  ): Promise<PayslipArtifact> {
    let blob: Blob;
    try {
      blob = await generatePayslipPdfBlob(item, run);
    } catch (e) {
      // The whole document is gone — there is nothing to attach OR to link.
      const reason = `payslip PDF could not be generated (${(e as Error).message})`;
      console.error("[payrollEmail]", item.staffId, reason);
      return { error: reason };
    }

    const out: PayslipArtifact = {};

    if (blob.size <= MAX_ATTACHMENT_BYTES) {
      try {
        out.attachment = await blobToBase64(blob);
      } catch (e) {
        out.error = `payslip could not be attached (${(e as Error).message})`;
        console.error("[payrollEmail]", item.staffId, out.error);
      }
    } else {
      out.error = `payslip too large to attach (${Math.round(blob.size / 1024)} KB)`;
    }

    // Storage is a convenience, not the delivery mechanism. Failing here must
    // not cost the employee a payslip that is already in the message.
    try {
      const path = orgPath(`${run.id}/${item.id}.pdf`);
      const up = await this.db.storage
        .from("payslips")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);

      const url = await signedUrl("payslips", path, SIGNED_URL_TTL_EMAIL, {
        download: this.fileName(month),
      });
      if (!url) throw new Error("the uploaded payslip could not be signed");
      out.url = url;
    } catch (e) {
      const reason = `payslip download link unavailable (${(e as Error).message})`;
      console.error("[payrollEmail]", item.staffId, reason);
      out.error = out.error ? `${out.error}; ${reason}` : reason;
    }

    return out;
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
    const fileName = this.fileName(month);
    const results: PayslipEmailResult[] = [];

    for (const item of items) {
      const contact = contacts.get(item.staffId);
      const base: PayslipEmailResult = {
        staffId: item.staffId,
        staffName: item.staffName,
        email: contact?.email,
        status: "skipped",
        pdf: "unavailable",
      };
      if (!contact?.email) {
        results.push({ ...base, error: "No email on file" });
        continue;
      }
      try {
        const artifact = await this.buildArtifact(item, detail, month);
        const pdf: PayslipDelivery = artifact.attachment
          ? "attached"
          : artifact.url
            ? "linked"
            : "unavailable";

        const res = await emailService.sendTemplateEmail({
          templateId: "salary-slip",
          to: { email: contact.email, name: item.staffName },
          params: {
            employeeName: item.staffName ?? "Team Member",
            month,
            netSalary: formatINR(item.netSalary),
            periodLabel,
            downloadUrl: artifact.url ?? this.mySalaryUrl(contact.role),
            // The template must know whether the button downloads a file or
            // opens the app, or it goes back to labelling a login page
            // "Download Payslip".
            downloadIsFile: Boolean(artifact.url),
            pdfAttached: Boolean(artifact.attachment),
          },
          attachment: artifact.attachment
            ? [{ name: fileName, content: artifact.attachment }]
            : undefined,
        });
        results.push({
          ...base,
          status: res.status,
          error: res.error,
          pdf,
          pdfError: artifact.error,
        });
      } catch (e) {
        results.push({ ...base, status: "failed", error: (e as Error).message });
      }
    }
    return results;
  }
}

export const payrollEmailService = new PayrollEmailService();
