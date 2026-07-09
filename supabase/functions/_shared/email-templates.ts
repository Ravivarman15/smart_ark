// ── Reusable transactional email templates ──────────────────────────────────
//
// Server-side HTML email rendering. Every transactional email the platform
// sends is built here so branding, layout and tone stay consistent.
//
// ARCHITECTURE
//   • Branding        — per-branch override map merged over a default. A
//                       multi-branch deployment passes `branch` and gets its
//                       own org name / colours / support contact.
//   • baseLayout()    — the shared responsive HTML shell (header band, body
//                       card, footer). All inline CSS — required for email
//                       clients (Gmail/Outlook strip <style> blocks).
//   • renderEmail()   — the registry dispatcher. Add a new `case` here to ship
//                       a new template id.
//
// CURRENT TEMPLATES
//   • staff-welcome          — new-staff onboarding + credentials
//   • staff-password-reset   — branded password reset link
//   • generic-notice         — title + paragraphs + optional CTA button
//
// FUTURE TEMPLATES (same pattern — add an id + a render function)
//   • student-welcome        — student / parent app onboarding
//   • fee-reminder           — fee due / overdue reminders
//   • exam-notification      — exam schedule + result notifications
// ─────────────────────────────────────────────────────────────────────────────

// ── Branding ────────────────────────────────────────────────────────────────
export interface Branding {
  orgName: string;
  productName: string;
  /** Header band background. */
  primaryColor: string;
  /** CTA button background. */
  accentColor: string;
  /** Optional logo image URL — falls back to a text wordmark when absent. */
  logoUrl?: string;
  supportEmail: string;
  supportPhone?: string;
  websiteUrl?: string;
}

export const DEFAULT_BRANDING: Branding = {
  orgName: "The Ark Tuition",
  productName: "Ark ERP",
  primaryColor: "#0f2942",
  accentColor: "#2563eb",
  supportEmail: "support@thearktuition.com",
  supportPhone: "",
  websiteUrl: "https://thearktuition.com",
};

// Per-branch overrides — merged over DEFAULT_BRANDING. Add a branch by adding
// a key here; unknown / missing branch keys fall back to the default.
export const BRANDING_BY_BRANCH: Record<string, Partial<Branding>> = {
  // "north-campus": { orgName: "The Ark Tuition — North", primaryColor: "#1e3a5f" },
};

/** Resolve the branding for a branch, merged over the default. */
export const getBranding = (branch?: string): Branding => ({
  ...DEFAULT_BRANDING,
  ...(branch ? BRANDING_BY_BRANCH[branch] ?? {} : {}),
});

// ── Shared HTML shell ───────────────────────────────────────────────────────
const esc = (s: string): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface LayoutParams {
  branding: Branding;
  /** Pre-header / preview text shown in the inbox list. */
  preheader: string;
  /** Inner HTML — already escaped/trusted by the template. */
  bodyHtml: string;
}

const baseLayout = ({ branding, preheader, bodyHtml }: LayoutParams): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(branding.orgName)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,41,66,0.12);">
  <tr>
    <td style="background:${branding.primaryColor};padding:28px 32px;text-align:center;">
      ${
        branding.logoUrl
          ? `<img src="${esc(branding.logoUrl)}" alt="${esc(branding.orgName)}" height="40" style="display:inline-block;" />`
          : `<div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${esc(branding.orgName)}</div>`
      }
      <div style="color:#cbd5e1;font-size:12px;margin-top:4px;letter-spacing:1px;text-transform:uppercase;">${esc(branding.productName)}</div>
    </td>
  </tr>
  <tr><td style="padding:32px;color:#1e293b;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
  <tr>
    <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;">
      Need help? Contact us at
      <a href="mailto:${esc(branding.supportEmail)}" style="color:${branding.accentColor};text-decoration:none;">${esc(branding.supportEmail)}</a>${
  branding.supportPhone ? ` &nbsp;|&nbsp; ${esc(branding.supportPhone)}` : ""
}
      <br />
      <span style="color:#94a3b8;">&copy; ${new Date().getFullYear()} ${esc(branding.orgName)}. All rights reserved.</span>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

const ctaButton = (label: string, url: string, color: string): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="border-radius:8px;background:${color};">
      <a href="${esc(url)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td></tr>
  </table>`;

const credentialRow = (label: string, value: string): string =>
  `<tr>
    <td style="padding:8px 0;color:#64748b;font-size:13px;width:140px;">${esc(label)}</td>
    <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;font-family:'Courier New',monospace;">${esc(value)}</td>
  </tr>`;

// ── Template params ─────────────────────────────────────────────────────────
export interface StaffWelcomeParams {
  staffName: string;
  roleLabel: string;
  loginEmail: string;
  loginUrl: string;
  /** Provide ONE of these — a temp password OR a setup link. */
  tempPassword?: string;
  setupLink?: string;
  /** Optional extra detail e.g. "Department: Academics". */
  departmentLabel?: string;
}

export interface PasswordResetParams {
  staffName: string;
  loginEmail: string;
  loginUrl: string;
  /** New temporary password set by the reset. */
  tempPassword: string;
}

export interface GenericNoticeParams {
  recipientName?: string;
  heading: string;
  /** Body paragraphs — each rendered as a <p>. */
  paragraphs: string[];
  cta?: { label: string; url: string };
}

export interface SalarySlipParams {
  employeeName: string;
  /** e.g. "June 2026". */
  month: string;
  /** Pre-formatted net salary, e.g. "₹25,950". */
  netSalary: string;
  /** Pay-period label, e.g. "01 Jun 2026 – 30 Jun 2026". */
  periodLabel: string;
  /** Deep link to the employee's own My Salary page (their slip only). */
  downloadUrl: string;
}

export interface FeeReceiptParams {
  studentName: string;
  admissionNo?: string;
  className?: string;
  section?: string;
  receiptNo: string;
  /** Pre-formatted collected amount, e.g. "₹5,000". */
  amount: string;
  paymentMethod: string;
  /** Pre-formatted pending balance, e.g. "₹0". */
  pendingBalance: string;
  /** Collection date label, e.g. "09 Jul 2026". */
  collectionDate: string;
  /** Secure receipt download link (also attached as PDF). Optional. */
  receiptUrl?: string;
  /** Recipient name for the greeting (parent / guardian / student). */
  recipientName?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ── Template: staff-welcome ─────────────────────────────────────────────────
const renderStaffWelcome = (
  p: StaffWelcomeParams,
  b: Branding,
): RenderedEmail => {
  const subject = `Welcome to ${b.orgName} — Your ${b.productName} account is ready`;

  const credentialsBlock = p.tempPassword
    ? `<p style="margin:16px 0 8px;">Use the credentials below to sign in for the first time:</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;margin:8px 0;">
         ${credentialRow("Login email", p.loginEmail)}
         ${credentialRow("Password", p.tempPassword)}
       </table>
       ${ctaButton("Log in to " + b.productName, p.loginUrl, b.accentColor)}`
    : `<p style="margin:16px 0 8px;">Click the secure link below to set your password and activate your account:</p>
       ${ctaButton("Set up my account", p.setupLink ?? p.loginUrl, b.accentColor)}
       <p style="margin:8px 0;color:#64748b;font-size:13px;">Login email: <strong>${esc(p.loginEmail)}</strong></p>`;

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Welcome aboard, ${esc(p.staffName)}!</h1>
    <p style="margin:0 0 4px;">An account has been created for you at <strong>${esc(b.orgName)}</strong>.</p>
    <p style="margin:0 0 4px;color:#475569;">
      Role: <strong>${esc(p.roleLabel)}</strong>${
    p.departmentLabel ? ` &nbsp;|&nbsp; ${esc(p.departmentLabel)}` : ""
  }
    </p>
    ${credentialsBlock}
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;margin:20px 0;color:#713f12;font-size:13px;">
      <strong>Security first:</strong> ${
        p.tempPassword
          ? "This password works straight away. After you log in you can set your own from Settings &rarr; Change Password."
          : "This setup link is single-use and expires soon. Do not share it with anyone."
      } ${esc(b.orgName)} staff will never ask you for your password.
    </div>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
      If you were not expecting this email, please contact us at
      <a href="mailto:${esc(b.supportEmail)}" style="color:${b.accentColor};">${esc(b.supportEmail)}</a>.
    </p>`;

  const text = [
    `Welcome aboard, ${p.staffName}!`,
    ``,
    `An account has been created for you at ${b.orgName}.`,
    `Role: ${p.roleLabel}`,
    ``,
    p.tempPassword
      ? `Login email: ${p.loginEmail}\nPassword: ${p.tempPassword}\nLog in: ${p.loginUrl}`
      : `Login email: ${p.loginEmail}\nSet up your account: ${p.setupLink ?? p.loginUrl}`,
    ``,
    p.tempPassword
      ? `Security: this password works straight away. After logging in you can set your own from Settings > Change Password.`
      : `Security: this setup link is single-use and expires soon.`,
    ``,
    `Need help? ${b.supportEmail}`,
    `© ${new Date().getFullYear()} ${b.orgName}`,
  ].join("\n");

  return {
    subject,
    text,
    html: baseLayout({
      branding: b,
      preheader: `Your ${b.productName} account is ready — sign in to get started.`,
      bodyHtml,
    }),
  };
};

// ── Template: staff-password-reset ──────────────────────────────────────────
// Self-contained: the reset issues a NEW temporary password and emails it
// directly. No recovery link — so there is no Supabase Auth Site-URL redirect
// to misconfigure, and exactly one branded email is sent.
const renderPasswordReset = (
  p: PasswordResetParams,
  b: Branding,
): RenderedEmail => {
  const subject = `Your ${b.productName} password has been reset`;
  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Your password was reset</h1>
    <p style="margin:0 0 4px;">Hi ${esc(p.staffName)}, an administrator has reset the password for your <strong>${esc(b.productName)}</strong> account.</p>
    <p style="margin:16px 0 8px;">Sign in with the password below:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;margin:8px 0;">
      ${credentialRow("Login email", p.loginEmail)}
      ${credentialRow("Password", p.tempPassword)}
    </table>
    ${ctaButton("Log in to " + b.productName, p.loginUrl, b.accentColor)}
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;margin:20px 0;color:#713f12;font-size:13px;">
      <strong>Security first:</strong> this password works straight away. After you log in you can set your own from Settings &rarr; Change Password. ${esc(b.orgName)} staff will never ask you for your password.
    </div>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
      If you did not expect this, contact us at
      <a href="mailto:${esc(b.supportEmail)}" style="color:${b.accentColor};">${esc(b.supportEmail)}</a>.
    </p>`;
  const text = [
    `Your ${b.productName} password was reset`,
    ``,
    `Hi ${p.staffName}, an administrator reset your password.`,
    ``,
    `Login email: ${p.loginEmail}`,
    `Password: ${p.tempPassword}`,
    `Log in: ${p.loginUrl}`,
    ``,
    `Security: this password works straight away. After logging in you can set your own from Settings > Change Password.`,
    `Need help? ${b.supportEmail}`,
  ].join("\n");
  return {
    subject,
    text,
    html: baseLayout({
      branding: b,
      preheader: `Your ${b.productName} password has been reset.`,
      bodyHtml,
    }),
  };
};

// ── Template: generic-notice ────────────────────────────────────────────────
const renderGenericNotice = (
  p: GenericNoticeParams,
  b: Branding,
): RenderedEmail => {
  const paras = p.paragraphs
    .map((t) => `<p style="margin:0 0 12px;">${esc(t)}</p>`)
    .join("");
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${esc(p.heading)}</h1>
    ${p.recipientName ? `<p style="margin:0 0 12px;">Hi ${esc(p.recipientName)},</p>` : ""}
    ${paras}
    ${p.cta ? ctaButton(p.cta.label, p.cta.url, b.accentColor) : ""}`;
  const text = [
    p.heading,
    "",
    p.recipientName ? `Hi ${p.recipientName},` : "",
    ...p.paragraphs,
    p.cta ? `\n${p.cta.label}: ${p.cta.url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    subject: p.heading,
    text,
    html: baseLayout({ branding: b, preheader: p.heading, bodyHtml }),
  };
};

// ── Template: salary-slip ───────────────────────────────────────────────────
// Sent to EACH employee after Management approves the monthly payroll. The email
// itself reveals only the recipient's own figures; the full itemised PDF is
// downloaded in-app via the secure CTA (each user can only see their own slip).
const renderSalarySlip = (p: SalarySlipParams, b: Branding): RenderedEmail => {
  const subject = `Salary Slip - ${p.month}`;
  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Your salary slip for ${esc(p.month)}</h1>
    <p style="margin:0 0 12px;">Hi ${esc(p.employeeName)},</p>
    <p style="margin:0 0 16px;">Your salary for <strong>${esc(p.month)}</strong> has been approved and processed. Here is your summary:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;margin:8px 0 4px;">
      ${credentialRow("Pay period", p.periodLabel)}
      <tr>
        <td style="padding:10px 0;color:#64748b;font-size:13px;width:140px;">Net salary</td>
        <td style="padding:10px 0;color:#0f172a;font-size:18px;font-weight:800;">${esc(p.netSalary)}</td>
      </tr>
    </table>
    ${ctaButton("Download Payslip", p.downloadUrl, b.accentColor)}
    <p style="margin:8px 0;color:#64748b;font-size:13px;">
      Click the button above to download your detailed payslip (PDF).
    </p>
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin:20px 0;color:#065f46;font-size:13px;">
      This is a confidential document intended only for ${esc(p.employeeName)}. If you believe you received this in error, please contact us.
    </div>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
      Questions about your pay? Contact us at
      <a href="mailto:${esc(b.supportEmail)}" style="color:${b.accentColor};">${esc(b.supportEmail)}</a>.
    </p>`;
  const text = [
    `Salary Slip - ${p.month}`,
    ``,
    `Hi ${p.employeeName},`,
    `Your salary for ${p.month} has been approved and processed.`,
    ``,
    `Pay period: ${p.periodLabel}`,
    `Net salary: ${p.netSalary}`,
    ``,
    `Download your detailed payslip: ${p.downloadUrl}`,
    ``,
    `This is a confidential document intended only for you.`,
    `Need help? ${b.supportEmail}`,
    `© ${new Date().getFullYear()} ${b.orgName}`,
  ].join("\n");
  return {
    subject,
    text,
    html: baseLayout({
      branding: b,
      preheader: `Your salary slip for ${p.month} — net ${p.netSalary}.`,
      bodyHtml,
    }),
  };
};

// ── Template: fee-receipt ───────────────────────────────────────────────────
// Sent automatically after every successful fee collection. Branded receipt with
// the full payment detail; the PDF receipt is attached to the email (and linked
// via the secure download button when a signed URL is available).
const renderFeeReceipt = (p: FeeReceiptParams, b: Branding): RenderedEmail => {
  const subject = "ARK Learning Arena Fee Payment Receipt";
  const detail = (label: string, value: string): string =>
    `<tr>
      <td style="padding:8px 0;color:#64748b;font-size:13px;width:160px;">${esc(label)}</td>
      <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;">${esc(value)}</td>
    </tr>`;
  const classLine = [p.className, p.section].filter(Boolean).join(" · ");
  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Fee Payment Receipt</h1>
    <p style="margin:0 0 12px;">Dear ${esc(p.recipientName || "Parent")}, thank you — we have received your fee payment for <strong>${esc(p.studentName)}</strong>. Your official receipt is below${p.receiptUrl ? " and attached as a PDF" : ""}.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;margin:8px 0 4px;">
      ${detail("Student", p.studentName)}
      ${p.admissionNo ? detail("Admission No", p.admissionNo) : ""}
      ${classLine ? detail("Class / Section", classLine) : ""}
      ${detail("Receipt No", p.receiptNo)}
      ${detail("Payment Method", p.paymentMethod)}
      ${detail("Collection Date", p.collectionDate)}
      <tr>
        <td style="padding:12px 0 4px;color:#64748b;font-size:13px;">Amount Paid</td>
        <td style="padding:12px 0 4px;color:#065f46;font-size:18px;font-weight:800;">${esc(p.amount)}</td>
      </tr>
      ${detail("Pending Balance", p.pendingBalance)}
    </table>
    ${p.receiptUrl ? ctaButton("Download Receipt (PDF)", p.receiptUrl, b.accentColor) : ""}
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin:20px 0;color:#065f46;font-size:13px;">
      Thank you for your payment. This is a computer-generated receipt and does not require a signature.
    </div>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
      Questions about this payment? Contact us at
      <a href="mailto:${esc(b.supportEmail)}" style="color:${b.accentColor};">${esc(b.supportEmail)}</a>${b.supportPhone ? ` or ${esc(b.supportPhone)}` : ""}.
    </p>`;
  const text = [
    `ARK Learning Arena — Fee Payment Receipt`,
    ``,
    `Dear ${p.recipientName || "Parent"}, we have received your fee payment for ${p.studentName}.`,
    ``,
    `Student: ${p.studentName}`,
    p.admissionNo ? `Admission No: ${p.admissionNo}` : "",
    classLine ? `Class / Section: ${classLine}` : "",
    `Receipt No: ${p.receiptNo}`,
    `Payment Method: ${p.paymentMethod}`,
    `Collection Date: ${p.collectionDate}`,
    `Amount Paid: ${p.amount}`,
    `Pending Balance: ${p.pendingBalance}`,
    p.receiptUrl ? `\nDownload receipt: ${p.receiptUrl}` : "",
    ``,
    `Thank you. Need help? ${b.supportEmail}`,
    `© ${new Date().getFullYear()} ${b.orgName}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return {
    subject,
    text,
    html: baseLayout({
      branding: b,
      preheader: `Receipt ${p.receiptNo} — ${p.amount} received for ${p.studentName}.`,
      bodyHtml,
    }),
  };
};

// ── Registry dispatcher ─────────────────────────────────────────────────────
export type EmailTemplateId =
  | "staff-welcome"
  | "staff-password-reset"
  | "generic-notice"
  | "salary-slip"
  | "fee-receipt";

export const KNOWN_TEMPLATES: EmailTemplateId[] = [
  "staff-welcome",
  "staff-password-reset",
  "generic-notice",
  "salary-slip",
  "fee-receipt",
];

/**
 * Render a registered template. Throws on an unknown id so the generic
 * `send-email` function can never be coerced into sending arbitrary HTML.
 */
export const renderEmail = (
  templateId: EmailTemplateId,
  params: Record<string, unknown>,
  branch?: string,
): RenderedEmail => {
  const branding = getBranding(branch);
  switch (templateId) {
    case "staff-welcome":
      return renderStaffWelcome(params as unknown as StaffWelcomeParams, branding);
    case "staff-password-reset":
      return renderPasswordReset(params as unknown as PasswordResetParams, branding);
    case "generic-notice":
      return renderGenericNotice(params as unknown as GenericNoticeParams, branding);
    case "salary-slip":
      return renderSalarySlip(params as unknown as SalarySlipParams, branding);
    case "fee-receipt":
      return renderFeeReceipt(params as unknown as FeeReceiptParams, branding);
    default:
      throw new Error(`Unknown email template: ${templateId}`);
  }
};
