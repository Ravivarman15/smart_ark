import { BaseService } from "@/shared/services";
import { sendWhatsApp, CAMPAIGNS } from "@/lib/aisensyApi";

// ─────────────────────────────────────────────────────────────────────────────
// Staff notifications — shift/timing changes and "payslip ready" alerts.
//
// Routes through the existing AiSensy broadcast campaign (single {{1}} variable
// = full message text) via the send-whatsapp edge function. Entirely
// best-effort: a missing mobile number or an offline edge function never blocks
// a payroll write. Returns a per-recipient result so the UI can surface a
// "sent N of M" summary.
// ─────────────────────────────────────────────────────────────────────────────

export interface NotifyResult {
  staffId: string;
  staffName?: string;
  channel: "whatsapp";
  sent: boolean;
  message: string;
}

class PayrollNotifyService extends BaseService {
  private async resolveContact(
    staffId: string,
  ): Promise<{ name?: string; mobile?: string } | null> {
    const { data } = await this.db
      .from("profiles")
      .select("name, mobile")
      .eq("id", staffId)
      .maybeSingle();
    if (!data) return null;
    const r = data as { name?: string; mobile?: string };
    return { name: r.name, mobile: r.mobile };
  }

  /** Notify a staff member their working hours changed. */
  async notifyShiftChange(args: {
    staffId: string;
    startTime: string;
    endTime: string;
  }): Promise<NotifyResult> {
    const contact = await this.resolveContact(args.staffId);
    const base: NotifyResult = {
      staffId: args.staffId,
      staffName: contact?.name,
      channel: "whatsapp",
      sent: false,
      message: "No mobile number on file",
    };
    if (!contact?.mobile) return base;
    const text =
      `Dear ${contact.name ?? "Team Member"},\n\n` +
      `Your working hours have been updated.\n\n` +
      `New Shift:\n${args.startTime} – ${args.endTime}\n\n` +
      `ARK Learning Arena`;
    const res = await sendWhatsApp({
      campaignName: CAMPAIGNS.BROADCAST,
      destination: contact.mobile,
      recipientName: contact.name ?? "Staff",
      templateParams: [text],
    });
    return { ...base, sent: res.success, message: res.message };
  }

  /** Notify a staff member their salary for the period has been approved. */
  async notifySalaryApproved(args: {
    staffId: string;
    period: string;
    netSalary: string;
  }): Promise<NotifyResult> {
    const contact = await this.resolveContact(args.staffId);
    const base: NotifyResult = {
      staffId: args.staffId,
      staffName: contact?.name,
      channel: "whatsapp",
      sent: false,
      message: "No mobile number on file",
    };
    if (!contact?.mobile) return base;
    const text =
      `Dear ${contact.name ?? "Team Member"},\n\n` +
      `Your salary for ${args.period} has been approved.\n\n` +
      `Net Salary: ${args.netSalary}\n\n` +
      `Your payslip is now available in the ARK app.\n\nARK Learning Arena`;
    const res = await sendWhatsApp({
      campaignName: CAMPAIGNS.BROADCAST,
      destination: contact.mobile,
      recipientName: contact.name ?? "Staff",
      templateParams: [text],
    });
    return { ...base, sent: res.success, message: res.message };
  }

  /** Notify a staff member their payslip / salary is ready. */
  async notifyPayslip(args: {
    staffId: string;
    period: string;
    netSalary: string;
  }): Promise<NotifyResult> {
    const contact = await this.resolveContact(args.staffId);
    const base: NotifyResult = {
      staffId: args.staffId,
      staffName: contact?.name,
      channel: "whatsapp",
      sent: false,
      message: "No mobile number on file",
    };
    if (!contact?.mobile) return base;
    const text =
      `Dear ${contact.name ?? "Team Member"},\n\n` +
      `Your salary for ${args.period} has been processed.\n\n` +
      `Net Salary: ${args.netSalary}\n\n` +
      `Your payslip is now available in the ARK app.\n\nARK Learning Arena`;
    const res = await sendWhatsApp({
      campaignName: CAMPAIGNS.BROADCAST,
      destination: contact.mobile,
      recipientName: contact.name ?? "Staff",
      templateParams: [text],
    });
    return { ...base, sent: res.success, message: res.message };
  }
}

export const payrollNotifyService = new PayrollNotifyService();
