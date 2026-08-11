import React from "react";
import { buildReceiptTheme } from "./receiptTheme";
import { amountInWords } from "./amountInWords";
import {
  AmountBand,
  DocumentBody,
  DocumentFooter,
  DocumentFrame,
  DocumentGrid,
  DocumentHeader,
  HeaderMeta,
  LineRow,
  MetaCell,
  SectionTitle,
  TotalRule,
} from "./DocumentShell";
import type { DocumentBranding } from "./documentBranding.types";

// ──────────────────────────────────────────────────────────────────────────────
// LIVE RECEIPT PREVIEW
//
// Built from the SAME DocumentShell primitives as the real receipt, so what a
// tenant approves in Settings is what its parents receive. A preview drawn with
// its own simplified markup is a preview that drifts, and the first time it
// drifts someone ships a colour that looked fine in Settings and is unreadable
// on the actual document.
//
// The organization values are REAL — resolved branding, passed in by the page.
// Only the transaction is illustrative (a sample student and amount), and it is
// labelled as such rather than presented as a genuine record.
// ──────────────────────────────────────────────────────────────────────────────

/** An obviously-illustrative payment. Not a real student, and it does not read like one. */
const SAMPLE = {
  receiptNo: "REC-PREVIEW",
  date: new Date().toISOString().slice(0, 10),
  studentName: "Sample Student",
  batchName: "Class & Batch",
  amount: 5000,
  paidToDate: 5000,
  pending: 50000,
  method: "Cash",
};

export const ReceiptBrandingPreview: React.FC<{
  branding: DocumentBranding;
  /** Live colour overrides from the unsaved form, so the preview updates as the tenant types. */
  overrides?: Partial<
    Pick<
      DocumentBranding,
      "receiptPrimaryColor" | "receiptSecondaryColor" | "receiptAccentColor"
    >
  >;
}> = ({ branding, overrides }) => {
  const effective: DocumentBranding = { ...branding, ...overrides };
  const theme = buildReceiptTheme(effective);
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <DocumentFrame theme={theme} domId="receipt-branding-preview">
      <DocumentHeader
        branding={effective}
        theme={theme}
        documentType="Payment Receipt"
        meta={
          <>
            <HeaderMeta>Receipt No: {SAMPLE.receiptNo}</HeaderMeta>
            <HeaderMeta>Date: {SAMPLE.date}</HeaderMeta>
          </>
        }
      />

      <DocumentBody>
        <DocumentGrid marginBottom={18}>
          <div>
            <SectionTitle theme={theme}>Student Details</SectionTitle>
            <MetaCell theme={theme} label="Student Name" value={SAMPLE.studentName} />
            <MetaCell theme={theme} label="Class & Batch" value={SAMPLE.batchName} />
          </div>
          <div>
            <SectionTitle theme={theme}>Payment Information</SectionTitle>
            <MetaCell theme={theme} label="Payment Method" value={SAMPLE.method} />
            <MetaCell theme={theme} label="Notes" value="—" />
          </div>
        </DocumentGrid>

        <DocumentGrid>
          <div>
            <SectionTitle theme={theme}>Fee Payment Details</SectionTitle>
            <LineRow theme={theme} label="Tuition / Program Fee Payment" value={inr(SAMPLE.amount)} />
            <LineRow theme={theme} label="Total Paid Till Date" value={inr(SAMPLE.paidToDate)} />
            <TotalRule theme={theme}>
              <LineRow theme={theme} label="Subtotal Paid" value={inr(SAMPLE.amount)} strong />
            </TotalRule>
          </div>
          <div>
            <SectionTitle theme={theme}>Balance Information</SectionTitle>
            <LineRow
              theme={theme}
              label="Remaining Balance"
              value={inr(SAMPLE.pending)}
              accent={theme.danger}
              strong
            />
          </div>
        </DocumentGrid>

        <AmountBand
          theme={theme}
          caption="Amount Paid"
          words={amountInWords(SAMPLE.amount)}
          amount={inr(SAMPLE.amount)}
        />

        <DocumentFooter
          branding={effective}
          theme={theme}
          documentNoun="receipt"
          module="Fees"
        />
      </DocumentBody>
    </DocumentFrame>
  );
};
