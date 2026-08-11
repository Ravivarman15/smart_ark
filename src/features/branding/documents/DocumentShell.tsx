import React from "react";
import { monogramOf } from "./monogram";
import type { DocumentBranding, ReceiptTheme } from "./documentBranding.types";

// ──────────────────────────────────────────────────────────────────────────────
// DOCUMENT SHELL — the chrome shared by every printable document
//
// SalarySlip.tsx and FeeReceiptDialog.tsx contained byte-identical copies of the
// header band, the section titles, the row primitives, the amount band and the
// signature block. Making branding dynamic in two copies means making every
// future change twice, and the second copy is the one that gets forgotten.
//
// This is NOT a second document engine. It is the one engine, written once.
//
// ┌── WHY INLINE STYLES AND NOT TAILWIND ──────────────────────────────────┐
// │ These components render in three contexts:                             │
// │   1. the on-screen dialog          — has the app stylesheet            │
// │   2. a print window built from outerHTML  — has NO stylesheet          │
// │   3. an off-screen html2canvas host       — has NO stylesheet          │
// │                                                                        │
// │ A class-based document renders unstyled in exactly the two contexts    │
// │ that matter most: the printed page and the emailed PDF. Inline styles  │
// │ survive the copy. This constraint predates the change and is kept.     │
// └────────────────────────────────────────────────────────────────────────┘
//
// Every component here takes its colours from a resolved `ReceiptTheme`, never
// from a raw branding field. That is what makes "a tenant cannot make its own
// document unreadable" structural: the unreadable combination is not reachable
// from this API.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The organization's mark.
 *
 * With a logo, the logo. Without one, a MONOGRAM of the tenant's own initials —
 * never a default image, because the only default image available would be
 * another tenant's. `crossOrigin="anonymous"` is required for html2canvas to
 * rasterise a remote logo instead of tainting the canvas.
 */
export const OrgMark: React.FC<{ branding: DocumentBranding; theme: ReceiptTheme }> = ({
  branding,
  theme,
}) => {
  const box: React.CSSProperties = {
    width: 56,
    height: 56,
    flexShrink: 0,
    borderRadius: 10,
    background: "#fff",
  };

  if (branding.logoUrl) {
    return (
      <img
        src={branding.logoUrl}
        alt={branding.organizationName}
        crossOrigin="anonymous"
        style={{ ...box, objectFit: "cover", padding: 3 }}
      />
    );
  }

  return (
    <div
      style={{
        ...box,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.primaryOnWhite,
        fontSize: 18,
        fontWeight: 800,
        letterSpacing: 0.5,
      }}
    >
      {monogramOf(branding.organizationName)}
    </div>
  );
};

/**
 * The coloured band across the top: mark, organization identity, and a
 * right-hand column the caller fills with document-specific metadata.
 *
 * `documentType` is the pill — "Payment Receipt", "Salary Slip".
 */
export const DocumentHeader: React.FC<{
  branding: DocumentBranding;
  theme: ReceiptTheme;
  documentType: string;
  meta: React.ReactNode;
}> = ({ branding, theme, documentType, meta }) => {
  // Phone and website share a line, joined only when both exist — otherwise a
  // tenant with a phone and no website prints a dangling "Phone: 123  |".
  const contact = [branding.phone && `Phone: ${branding.phone}`, branding.website]
    .filter(Boolean)
    .join("  |  ");

  return (
    <div
      style={{
        background: theme.headerGradient,
        color: theme.onPrimary,
        padding: "20px 26px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <OrgMark branding={branding} theme={theme} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 19,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {branding.organizationName}
          </div>
          {branding.address ? (
            <div style={{ fontSize: 11.5, color: theme.onPrimaryMuted, marginTop: 2 }}>
              {branding.address}
            </div>
          ) : null}
          {contact ? (
            <div style={{ fontSize: 11.5, color: theme.onPrimaryMuted }}>{contact}</div>
          ) : null}
          {branding.taxId ? (
            <div style={{ fontSize: 11.5, color: theme.onPrimaryMuted }}>
              GSTIN: {branding.taxId}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div
          style={{
            display: "inline-block",
            background: theme.onPrimaryFill,
            border: `1px solid ${theme.onPrimaryBorder}`,
            padding: "5px 14px",
            borderRadius: 6,
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {documentType}
        </div>
        <div style={{ marginTop: 8, color: theme.onPrimaryMuted }}>{meta}</div>
      </div>
    </div>
  );
};

/** One right-aligned metadata line in the header. */
export const HeaderMeta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11.5 }}>{children}</div>
);

/** An uppercase section heading with the brand rule beneath it. */
export const SectionTitle: React.FC<{ theme: ReceiptTheme; children: string }> = ({
  theme,
  children,
}) => (
  <div
    style={{
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: 700,
      // primaryOnWhite, not primary: this text sits on the page, so a pale
      // brand colour is darkened until it is legible. The header band above
      // still uses the tenant's actual choice.
      color: theme.primaryOnWhite,
      borderBottom: `2px solid ${theme.primaryOnWhite}`,
      paddingBottom: 4,
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);

/** A label/value pair inside a metadata block. */
export const MetaCell: React.FC<{ theme: ReceiptTheme; label: string; value: string }> = ({
  theme,
  label,
  value,
}) => (
  <div
    style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}
  >
    <span style={{ color: theme.muted, flexShrink: 0, marginRight: 8 }}>{label}</span>
    <span
      style={{ fontWeight: 600, color: theme.ink, textAlign: "right", wordBreak: "break-word" }}
    >
      {value}
    </span>
  </div>
);

/** A money line: label (with optional qualifier) on the left, amount on the right. */
export const LineRow: React.FC<{
  theme: ReceiptTheme;
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  accent?: string;
}> = ({ theme, label, value, sub, strong, accent }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      padding: "5px 0",
      fontSize: 12.5,
    }}
  >
    <span style={{ color: strong ? theme.ink : theme.muted, fontWeight: strong ? 700 : 400 }}>
      {label}
      {sub ? <span style={{ color: theme.faint, fontWeight: 400 }}> · {sub}</span> : null}
    </span>
    <span style={{ fontWeight: strong ? 700 : 600, color: accent ?? theme.ink }}>{value}</span>
  </div>
);

/** A rule above a totals row, matching both original documents. */
export const TotalRule: React.FC<{ theme: ReceiptTheme; children: React.ReactNode }> = ({
  theme,
  children,
}) => (
  <div style={{ borderTop: `1px solid ${theme.line}`, marginTop: 6, paddingTop: 2 }}>{children}</div>
);

/** The two-column grid both documents use for their metadata and money blocks. */
export const DocumentGrid: React.FC<{ children: React.ReactNode; marginBottom?: number }> = ({
  children,
  marginBottom,
}) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, marginBottom }}>
    {children}
  </div>
);

/**
 * The filled band carrying the headline figure — "Amount Paid" / "Net Salary
 * Payable" — with the amount in words beneath the caption.
 */
export const AmountBand: React.FC<{
  theme: ReceiptTheme;
  caption: string;
  words: string;
  amount: string;
}> = ({ theme, caption, words, amount }) => (
  <div
    style={{
      marginTop: 18,
      background: theme.amountGradient,
      color: theme.onPrimary,
      borderRadius: 10,
      padding: "14px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 16,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: theme.onPrimaryMuted,
        }}
      >
        {caption}
      </div>
      <div style={{ fontSize: 11.5, color: theme.onPrimaryMuted, marginTop: 3, maxWidth: 360 }}>
        {words}
      </div>
    </div>
    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0 }}>{amount}</div>
  </div>
);

/**
 * Disclaimer on the left, signature block on the right.
 *
 * `attribution` is the product's own sign-off — tenant-neutral by default and
 * replaced entirely when the organization sets `document_footer_note`. It never
 * carries a tenant's name, which is what "Generated by ARK ERP · Payroll" did
 * on every organization's payslip.
 */
export const DocumentFooter: React.FC<{
  branding: DocumentBranding;
  theme: ReceiptTheme;
  documentNoun: string;
  module: string;
}> = ({ branding, theme, documentNoun, module }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 34,
      gap: 20,
    }}
  >
    <div style={{ fontSize: 10.5, color: theme.faint, lineHeight: 1.7 }}>
      <div>• This is a computer-generated {documentNoun}.</div>
      <div>• No physical signature is required.</div>
      <div style={{ marginTop: 8, fontStyle: "italic", color: theme.muted, fontWeight: 500 }}>
        {branding.footerNote || `Generated by Smart ARK · ${module}`}
      </div>
    </div>
    <div style={{ textAlign: "center", flexShrink: 0 }}>
      <div style={{ width: 170, borderBottom: `1px solid ${theme.faint}`, marginBottom: 6 }} />
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.ink }}>Authorized Signatory</div>
      {/* The resolver already defaults this to the organization name, but the
          component must be total on its own: the settings preview and any
          future caller can hand it a DocumentBranding built by other means,
          and a blank line under "Authorized Signatory" reads as a broken
          document rather than an unconfigured one. */}
      <div style={{ fontSize: 10.5, color: theme.faint }}>
        {branding.authorizedSignatory || branding.organizationName}
      </div>
    </div>
  </div>
);

/** The outer card: white page, hairline border, rounded corners, clipped band. */
export const DocumentFrame: React.FC<{
  theme: ReceiptTheme;
  domId: string;
  innerRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}> = ({ theme, domId, innerRef, children }) => (
  <div
    ref={innerRef}
    id={domId}
    style={{
      background: "#ffffff",
      color: theme.ink,
      fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
      width: "100%",
      padding: 0,
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${theme.line}`,
      borderRadius: 14,
    }}
  >
    {children}
  </div>
);

/** The padded body beneath the header band. */
export const DocumentBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ padding: "20px 26px 24px" }}>{children}</div>
);
