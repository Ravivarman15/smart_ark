// ── Rasterised-document → PDF page ──────────────────────────────────────────
//
// Fee receipts and payslips are produced by rendering the SAME branded React
// body the screen shows, rasterising it with html2canvas and wrapping the
// bitmap in a one-page A4 PDF. That design is deliberate — one document, one
// look, no second HTML implementation to drift.
//
// ┌── WHY THIS HELPER EXISTS ──────────────────────────────────────────────┐
// │ All four call sites did this:                                          │
// │                                                                        │
// │     pdf.addImage(canvas.toDataURL("image/png"), "PNG", ...)            │
// │                                                                        │
// │ A full-page A4 raster at scale 2 is ~1520 × 2150 px. Encoded as        │
// │ LOSSLESS PNG and embedded in a PDF created without compression, one    │
// │ single-page receipt measured **4.8 MB** on the live system (payslips   │
// │ 5.4 MB). For a document that is a logo, a table and nine lines of      │
// │ text.                                                                  │
// │                                                                        │
// │ That size was not merely wasteful, it broke delivery outright:         │
// │                                                                        │
// │  • EMAIL. The receipt is attached to the send-email request as base64, │
// │    which adds a further ~33% — a ~6.5 MB JSON body uploaded from the   │
// │    browser for every fee collection. When that upload was dropped the  │
// │    client saw "Failed to send a request to the Edge Function", which   │
// │    is what the failed rows in message_queue actually are.              │
// │                                                                        │
// │  • STORAGE. The same blob is uploaded to the private `receipts`        │
// │    bucket for the signed download link.                                │
// │                                                                        │
// │ JPEG at quality 0.85 plus jsPDF's own deflate takes the same page to   │
// │ roughly 150–250 KB — around 20× smaller. At scale 2 the bitmap is      │
// │ ~190 DPI, so JPEG artefacts are invisible in print and on screen, and  │
// │ the page is still a faithful raster of the branded body.               │
// └────────────────────────────────────────────────────────────────────────┘
//
// Anything that rasterises a branded document MUST go through here, so a new
// document type cannot reintroduce the multi-megabyte page.

/** Raster quality/size knobs, shared so every document behaves identically. */
export const DOCUMENT_RASTER = {
  /** html2canvas scale — ~190 DPI on A4, the resolution the bodies were tuned at. */
  scale: 2,
  /** JPEG quality. 0.85 is visually lossless for flat, text-heavy documents. */
  quality: 0.85,
} as const;

/** The html2canvas options every branded document is captured with. */
export const documentCanvasOptions = {
  scale: DOCUMENT_RASTER.scale,
  backgroundColor: "#ffffff",
  useCORS: true,
} as const;

/** Minimal structural types — avoids importing jsPDF/html2canvas just for types. */
interface RasterCanvas {
  width: number;
  height: number;
  toDataURL: (type?: string, quality?: number) => string;
}

interface PdfLike {
  internal: { pageSize: { getWidth: () => number } };
  addImage: (
    data: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
    alias?: string,
    compression?: string,
  ) => void;
}

/**
 * Draw `canvas` onto `pdf` as a single margin-inset A4 page.
 *
 * Returns the drawn height so a caller can decide about overflow; every
 * current document is one page by construction.
 */
export const addRasterPage = (
  pdf: PdfLike,
  canvas: RasterCanvas,
  margin = 28,
): number => {
  const w = pdf.internal.pageSize.getWidth() - margin * 2;
  const h = (canvas.height * w) / canvas.width;
  pdf.addImage(
    canvas.toDataURL("image/jpeg", DOCUMENT_RASTER.quality),
    "JPEG",
    margin,
    margin,
    w,
    h,
    undefined,
    // jsPDF deflates the embedded stream. Combined with JPEG this is what
    // turns a ~5 MB page into a ~200 KB one.
    "FAST",
  );
  return h;
};

/**
 * The jsPDF constructor options for a branded document. `compress` is the half
 * of the saving that JPEG alone does not give.
 */
export const documentPdfOptions = {
  unit: "pt",
  format: "a4",
  compress: true,
} as const;
