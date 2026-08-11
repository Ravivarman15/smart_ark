// ─────────────────────────────────────────────────────────────────────────────
// Fee Receipt Delivery — the "zero manual work after collection" orchestrator.
//
// A THIN fee-side glue layer over the EXISTING communication backbone. It does
// not re-implement any engine:
//   • Receipt PDF ......... buildReceipt + receiptToPdfBlob (fee utils)
//   • Storage/link ........ Supabase Storage `receipts` bucket (signed URL)
//   • Gate/channels ....... comms_automation_settings `fee_paid` (default OFF)
//   • WhatsApp ............ renderMessage + aisensyService.enqueue → message_queue
//                           → send-aisensy edge fn (retry/audit/logs)
//   • Email ............... send-email edge fn (Brevo) with the PDF attached
//   • Audit/timeline ...... comms_audit + a message_queue email row (so the
//                           unified timeline/health see the email too)
//
// Contract: BEST-EFFORT. It never throws into the collection mutation — a comms
// failure must never fail (or roll back) a payment. Duplicate-safe: a receipt is
// never re-sent on a channel that already has a non-failed send (unless `force`).
// ─────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { studentsService } from "@/features/students/services";
import { emailService } from "@/features/staff/services/email.service";
import {
  aisensyService,
  commsAuditService,
  commsAutomationSettingsService,
} from "@/features/communication/services";
import {
  asCommsTemplate,
  BUILTIN_TEMPLATES_BY_KEY,
  renderMessage,
} from "@/features/communication/utils/whatsappTemplates";
import { resolveChannels } from "@/features/communication/utils/automationRules";
import { studentFeeService } from "./studentFee.service";
import { buildReceipt, receiptToPdfBlob } from "../utils/receipt";
import { formatINR } from "../utils/feeCalc";
import { orgPath } from "@/lib/orgStorage";

// Was a hardcoded constant. Fee receipts go to every tenant's parents, so
// the sending institution has to be resolved, not assumed.
import { orgContextService } from "@/features/communication/services/orgContext.service";
const RECEIPTS_BUCKET = "receipts";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

export interface DeliverReceiptInput {
  studentFeeId: string;
  receiptNo: string;
  /** This payment's amount. */
  amount: number;
  /** Balance remaining after this payment. */
  amountPending: number;
  /** Running total received to date (for the receipt body). */
  amountReceived?: number;
  paymentMethod: string;
  /** ISO date (yyyy-mm-dd). Defaults to today. */
  date?: string;
  notes?: string;
  actorId?: string;
  /** Bypass the enable gate + duplicate guard (manual Bulk Resend — Phase B). */
  force?: boolean;
}

type ChannelOutcome = "queued" | "sent" | "skipped" | "duplicate" | "failed";

export interface DeliverReceiptResult {
  skipped: boolean;
  reason?: string;
  whatsapp: ChannelOutcome;
  email: ChannelOutcome;
  /** Human-readable reason a channel didn't succeed (surfaced in the UI). */
  whatsappError?: string;
  emailError?: string;
  receiptUrl?: string;
}

const firstNonEmpty = (...vals: (string | undefined | null)[]): string | undefined => {
  for (const v of vals) {
    if (v && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
};

const formatDate = (iso?: string): string => {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return iso ?? "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

class FeeReceiptDeliveryService extends BaseService {
  /**
   * Render + upload the receipt PDF to the private `receipts` bucket and return
   * a signed download URL and a base64 copy (for the email attachment). Returns
   * empty on any failure — delivery still proceeds without the attachment/link.
   */
  private async buildAndStorePdf(
    r: {
      amount: number;
      paymentMethod: string;
      paymentDate: string;
      receiptNo: string;
      notes?: string;
      amountReceived: number;
      amountPending: number;
      studentName?: string;
      batchName?: string;
    },
    studentFeeId: string,
    receiptNo: string,
  ): Promise<{ signedUrl?: string; base64?: string }> {
    try {
      const receipt = buildReceipt(
        {
          studentName: r.studentName,
          batchName: r.batchName,
          amountReceived: r.amountReceived,
          amountPending: r.amountPending,
        },
        {
          amount: r.amount,
          paymentMethod: r.paymentMethod,
          paymentDate: r.paymentDate,
          receiptNo: r.receiptNo,
          notes: r.notes,
        },
      );
      // The org name is no longer threaded through here: receiptToPdfBlob
      // resolves the FULL document branding itself (logo, address, colours,
      // signatory), from the same session cache orgContextService uses. Passing
      // a name would have branded only one line of a document whose every other
      // line was still hardcoded.
      const blob = await receiptToPdfBlob(receipt);
      const safeReceipt = receiptNo.replace(/[^a-zA-Z0-9_-]/g, "_");
      const path = orgPath(`${studentFeeId}/${safeReceipt}.pdf`);
      const up = await this.db.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      const base64 = await blobToBase64(blob).catch(() => undefined);
      if (up.error) return { base64 };
      const signed = await this.db.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL, { download: `Receipt-${safeReceipt}.pdf` });
      return { signedUrl: signed.data?.signedUrl, base64 };
    } catch {
      return {};
    }
  }

  /**
   * Which channels already have a NON-failed send for this receipt. Reads
   * message_queue by (context_type='fee_receipt', payload.receipt_no). Degrades
   * to "nothing sent" on any error so a lookup failure never blocks delivery.
   */
  private async alreadySent(receiptNo: string): Promise<{ whatsapp: boolean; email: boolean }> {
    try {
      const res = await this.db
        .from("message_queue" as never)
        .select("channel, status")
        .eq("context_type", "fee_receipt")
        .eq("payload->>receipt_no", receiptNo)
        .limit(50);
      if (res.error) return { whatsapp: false, email: false };
      const rows = (res.data as unknown as Array<{ channel: string; status: string }>) ?? [];
      const live = (ch: string) =>
        rows.some((r) => r.channel === ch && r.status !== "failed" && r.status !== "cancelled");
      return { whatsapp: live("whatsapp"), email: live("email") };
    } catch {
      return { whatsapp: false, email: false };
    }
  }

  /** Best-effort email audit row in message_queue so it shows in timeline/health. */
  private async logEmail(
    studentFeeId: string,
    studentId: string | undefined,
    receiptNo: string,
    recipientName: string | undefined,
    email: string,
    status: "sent" | "failed",
    error?: string,
  ): Promise<void> {
    try {
      await this.db.from("message_queue" as never).insert({
        channel: "email",
        provider: "brevo",
        template: "fee_receipt",
        template_key: "fee_receipt",
        recipient_name: recipientName ?? null,
        recipient_phone: null,
        recipient_student_id: studentId ?? null,
        payload: { receipt_no: receiptNo, email, __body: "Fee receipt email" },
        context_type: "fee_receipt",
        context_id: studentFeeId,
        status,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        last_error: error ?? null,
      } as never);
    } catch {
      /* best-effort — the email already sent regardless of the audit row */
    }
  }

  /**
   * Send the receipt email. Tries the branded `fee-receipt` template first; if
   * the DEPLOYED send-email function predates it ("Unknown templateId"), falls
   * back to the always-present `generic-notice` so the receipt still delivers
   * (details in the body + a Download CTA). Returns a plain ok/error.
   */
  private async sendReceiptEmail(
    to: { email: string; name?: string },
    branded: Record<string, unknown>,
    fallback: Record<string, unknown>,
    attachment?: { name: string; content: string }[],
  ): Promise<{ ok: boolean; error?: string }> {
    const interpret = (res: { status: string; error?: string }): { ok: boolean; error?: string } =>
      res.status === "sent"
        ? { ok: true }
        : {
            ok: false,
            error:
              res.error ??
              (res.status === "skipped"
                ? "Email service not configured — set BREVO_API_KEY + SENDER_EMAIL secrets."
                : "Email rejected by the provider."),
          };
    try {
      return interpret(
        await emailService.sendTemplateEmail({ templateId: "fee-receipt", to, params: branded, attachment }),
      );
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/unknown template/i.test(msg)) return { ok: false, error: msg };
      // Deployed send-email is older than the fee-receipt template — fall back to
      // generic-notice but STILL attach the branded PDF so the receipt rides along.
      try {
        return interpret(
          await emailService.sendTemplateEmail({ templateId: "generic-notice", to, params: fallback, attachment }),
        );
      } catch (e2) {
        return { ok: false, error: (e2 as Error).message };
      }
    }
  }

  /**
   * Deliver the receipt for one collected payment over the configured channels.
   * Safe to call fire-and-forget from the collection hook.
   */
  async deliverReceipt(input: DeliverReceiptInput): Promise<DeliverReceiptResult> {
    const result: DeliverReceiptResult = { skipped: false, whatsapp: "skipped", email: "skipped" };
    try {
      // 1. Channel selection. The receipt is ALWAYS sent immediately on a
      // collection / resend — the `fee_paid` toggle only chooses the channels
      // (defaults to both). It never blocks delivery, so a receipt can never go
      // out silently un-sent.
      const setting = await commsAutomationSettingsService.get("fee_paid");
      const channels = setting.channel ? resolveChannels(setting.channel) : ["whatsapp", "email"];

      // 2. Resolve the fee + student (contacts, class/section, admission no).
      const fee = await studentFeeService.getById(input.studentFeeId);
      const student = await studentsService.getById(fee.studentId).catch(() => null);

      const parentName = firstNonEmpty(
        student?.parentName,
        student?.guardianName,
        student?.motherName,
        fee.studentName,
      );
      const className = firstNonEmpty(student?.standardName, fee.batchName);
      const section = student?.section;
      const admissionNo = firstNonEmpty(student?.enrolmentNo, student?.grNo, student?.rollNumber);

      const email = firstNonEmpty(student?.parentEmail, student?.motherEmail, student?.studentEmail);
      const phone = firstNonEmpty(student?.parentContact, student?.guardianContact, student?.studentContact);
      const date = input.date ?? new Date().toISOString().slice(0, 10);

      // 3. Receipt PDF → storage (signed link) + base64 (email attachment).
      const { signedUrl, base64 } = await this.buildAndStorePdf(
        {
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentDate: formatDate(date),
          receiptNo: input.receiptNo,
          notes: input.notes,
          amountReceived: input.amountReceived ?? 0,
          amountPending: input.amountPending,
          studentName: fee.studentName,
          batchName: fee.batchName,
        },
        input.studentFeeId,
        input.receiptNo,
      );
      result.receiptUrl = signedUrl;

      // 4. Duplicate guard — never re-send a receipt on a channel already served.
      const sent = input.force ? { whatsapp: false, email: false } : await this.alreadySent(input.receiptNo);

      // 5. WhatsApp — enqueue via the existing engine and drain it IMMEDIATELY.
      if (channels.includes("whatsapp")) {
        if (sent.whatsapp) {
          result.whatsapp = "duplicate";
        } else if (!phone) {
          result.whatsapp = "skipped";
          result.whatsappError = "No WhatsApp number on file (parent / guardian / student).";
        } else {
          const template = asCommsTemplate(BUILTIN_TEMPLATES_BY_KEY.fee_receipt);
          const rendered = renderMessage(template, {
            branch_name: (await orgContextService.vars()).org_name,
            parent_name: parentName ?? fee.studentName ?? "",
            student_name: fee.studentName ?? "",
            class: className ?? "",
            receipt_no: input.receiptNo,
            amount_paid: (Number(input.amount) || 0).toLocaleString("en-IN"),
            pending_balance: (Number(input.amountPending) || 0).toLocaleString("en-IN"),
            receipt_url: signedUrl ?? "",
          });
          // Receipts are transactional — send NOW, never defer for quiet hours.
          const enq = await aisensyService.enqueue({
            channel: "whatsapp",
            rendered,
            contextType: "fee_receipt",
            contextId: input.studentFeeId,
            recipient: {
              kind: "guardian",
              name: parentName ?? fee.studentName,
              phone,
              studentId: fee.studentId,
            },
            createdBy: input.actorId,
          });
          if (enq.queued > 0) {
            result.whatsapp = "queued";
            // Drain the just-queued row immediately (server-to-server).
            const disp = await aisensyService.dispatchViaEdge({ limit: 1 });
            if (!disp.dispatched) {
              result.whatsappError = `Queued, but the WhatsApp sender didn't run (${disp.reason ?? "send-aisensy unreachable"}). Deploy send-aisensy + set AISENSY_API_KEY.`;
            }
          } else {
            result.whatsapp = "failed";
            result.whatsappError =
              enq.invalid[0]?.reason ?? "WhatsApp message rejected (invalid number or empty body).";
          }
        }
      }

      // 6. Email — branded receipt with the PDF attached.
      if (channels.includes("email")) {
        if (sent.email) {
          result.email = "duplicate";
        } else if (!email) {
          result.email = "skipped";
          result.emailError = "No email address on file (parent / mother / student).";
        } else {
          const branded = {
            studentName: fee.studentName ?? "",
            admissionNo,
            className,
            section,
            receiptNo: input.receiptNo,
            amount: formatINR(input.amount),
            paymentMethod: input.paymentMethod,
            pendingBalance: formatINR(input.amountPending),
            collectionDate: formatDate(date),
            receiptUrl: signedUrl,
            recipientName: parentName,
          };
          const fallback = {
            recipientName: parentName,
            heading: `${(await orgContextService.vars()).org_name} Fee Payment Receipt`,
            paragraphs: [
              `Dear ${parentName ?? "Parent"}, we have received your fee payment for ${fee.studentName ?? "your ward"}.`,
              `Receipt No: ${input.receiptNo}`,
              `Amount Paid: ${formatINR(input.amount)}`,
              `Payment Method: ${input.paymentMethod}`,
              `Pending Balance: ${formatINR(input.amountPending)}`,
              `Collection Date: ${formatDate(date)}`,
              "Thank you.",
            ],
            ...(signedUrl ? { cta: { label: "Download Receipt (PDF)", url: signedUrl } } : {}),
          };
          const out = await this.sendReceiptEmail(
            { email, name: parentName },
            branded,
            fallback,
            base64 ? [{ name: `Receipt-${input.receiptNo}.pdf`, content: base64 }] : undefined,
          );
          result.email = out.ok ? "sent" : "failed";
          if (!out.ok) result.emailError = out.error;
          await this.logEmail(
            input.studentFeeId,
            fee.studentId,
            input.receiptNo,
            parentName,
            email,
            out.ok ? "sent" : "failed",
            out.error,
          );
        }
      }

      // 7. Audit the automation outcome.
      await commsAuditService.log({
        entityType: "automation",
        entityId: input.studentFeeId,
        action: "send",
        actorId: input.actorId,
        payload: {
          event: "fee_paid",
          receiptNo: input.receiptNo,
          whatsapp: result.whatsapp,
          email: result.email,
          channel: setting.channel,
        },
      });

      return result;
    } catch (e) {
      // Automation must never break the collection.
      // eslint-disable-next-line no-console
      console.warn("[feeReceiptDelivery] failed", (e as Error).message);
      return { ...result, skipped: true, reason: "error" };
    }
  }
}

export const feeReceiptDeliveryService = new FeeReceiptDeliveryService();
