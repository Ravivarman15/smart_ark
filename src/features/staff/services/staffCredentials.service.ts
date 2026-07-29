// ── Staff credential delivery over WhatsApp ──────────────────────────────────
//
// The EMAIL half already exists and is not touched here: `invite-staff` creates
// the auth user, generates the temporary password and sends the Brevo welcome
// email in one server-side step. Duplicating that client-side would mean two
// emails, or two different passwords.
//
// What was missing is the channel staff actually read. A welcome email that
// lands in spam (or a staff member who gave a Gmail address they check weekly)
// leaves the office reading a password down the phone. This adds WhatsApp on
// top of the existing email, using the credentials the edge function already
// returned — it never regenerates or re-provisions anything.
//
// Delivery goes through the shared credential path (see
// communication/services/credentialWhatsapp.service): the same template
// registry, queue, retry, audit and Communication Timeline as parent logins.
// The only staff-specific thing here is the variable bag.

import { loginUrl } from "../utils/appUrl";
import {
  sendCredentialWhatsapp,
  type CredentialDelivery,
} from "@/features/communication/services/credentialWhatsapp.service";

export type { CredentialDelivery };

export interface SendStaffCredentialsInput {
  staffName: string;
  /** The address the staff member signs in with (auth.users.email). */
  loginEmail: string;
  /** Temporary password as returned by invite-staff — never re-derived. */
  password: string;
  mobile?: string;
  /** Designation preferred over role: "Senior Teacher" reads better than "teacher". */
  role?: string;
  designation?: string;
  /** profiles.id — links the message to the staff member in the timeline. */
  profileId?: string;
  createdBy?: string;
}

/** "teacher" → "Teacher"; a role code in a message to a person reads as a bug. */
const roleLabel = (input: SendStaffCredentialsInput): string => {
  const raw = (input.designation ?? input.role ?? "").trim();
  if (!raw) return "Staff";
  return raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

class StaffCredentialsService {
  /**
   * WhatsApp the credentials to a newly-created (or reset) staff member.
   *
   * Returns a result rather than throwing: a delivery failure must never be
   * reported as a provisioning failure. The account exists and the password is
   * on screen either way — the caller shows the outcome so staff know whether
   * they still have to pass it on manually.
   */
  async sendWhatsapp(input: SendStaffCredentialsInput): Promise<CredentialDelivery> {
    return sendCredentialWhatsapp({
      templateKey: "staff_credentials",
      vars: {
        staff_name: input.staffName,
        role: roleLabel(input),
        login_email: input.loginEmail,
        password: input.password,
        login_url: loginUrl(),
      },
      recipientName: input.staffName,
      mobile: input.mobile,
      recipientKind: "staff",
      contextType: "staff_credentials",
      contextId: input.profileId,
      createdBy: input.createdBy,
    });
  }
}

export const staffCredentialsService = new StaffCredentialsService();
