// ──────────────────────────────────────────────────────────────────────────────
// MULTI-TENANT DOCUMENT BRANDING
//
// The single branding path for every printable document Smart ARK produces.
// Consumers import from here, never from the individual files, so the internal
// layout can change without touching payroll or fees.
//
// See docs/DYNAMIC_DOCUMENT_BRANDING.md for the audit and the architecture.
// ──────────────────────────────────────────────────────────────────────────────

export type { DocumentBranding, ReceiptTheme } from "./documentBranding.types";

export {
  documentBrandingService,
  resolveDocumentBranding,
  invalidateDocumentBranding,
  NEUTRAL_DOCUMENT_BRANDING,
} from "./documentBranding.service";

export { useDocumentBranding, DOCUMENT_BRANDING_KEY } from "./useDocumentBranding";

export {
  buildReceiptTheme,
  readableOn,
  ensureContrast,
  contrastRatio,
  relativeLuminance,
  isHexColor,
  SYSTEM_RECEIPT_PALETTE,
  AA_CONTRAST,
} from "./receiptTheme";

export { amountInWords } from "./amountInWords";

export {
  AmountBand,
  DocumentBody,
  DocumentFooter,
  DocumentFrame,
  DocumentGrid,
  DocumentHeader,
  HeaderMeta,
  LineRow,
  MetaCell,
  OrgMark,
  SectionTitle,
  TotalRule,
} from "./DocumentShell";

// Separate module so DocumentShell.tsx exports components only — mixing a
// helper in breaks React Fast Refresh for every component in that file.
export { monogramOf } from "./monogram";

export { ReceiptBrandingPreview } from "./ReceiptBrandingPreview";
