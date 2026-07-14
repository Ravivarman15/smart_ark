import { AppError } from "@/shared/services";

// ─────────────────────────────────────────────────────────────────────────────
// File → plain text, for AI question extraction.
//
// This is the ONLY place that knows about file formats. Everything downstream
// (the edge function, the review screen, the bank) works on text.
//
// Supported: PDF (digital), DOCX, XLSX/XLS, CSV, and pasted text.
//
// Deliberately NOT supported, with an honest error instead of silent garbage:
//   • Scanned / image-only PDFs — there is no text layer to read and no OCR in
//     this stack. We detect the empty text layer and say so.
//   • Legacy .doc (Word 97-2003) — a binary format no browser can parse.
//
// Every parser is lazy-imported so a teacher who only uploads CSVs never pays
// for the PDF/DOCX bundles.
// ─────────────────────────────────────────────────────────────────────────────

export type PaperFileType = "pdf" | "docx" | "xlsx" | "csv" | "text";

export interface ExtractedFileText {
  text: string;
  fileType: PaperFileType;
  /** Pages (PDF) or sheets (Excel) — surfaced in the upload progress UI. */
  pageCount?: number;
}

/** 25 MB — above this, extraction in the browser tab becomes hostile. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const EXT_TO_TYPE: Record<string, PaperFileType> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  csv: "csv",
  txt: "text",
};

/** Classify by extension. Throws a human-readable error for what we can't read. */
export function classifyFile(file: File): PaperFileType {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "doc") {
    throw AppError.validation("Legacy .doc files can't be read. Open it in Word and 'Save As' .docx, then upload again.",
    );
  }
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"].includes(ext)) {
    throw AppError.validation("Image files aren't supported. Upload the paper as a PDF, DOCX, Excel or CSV file.",
    );
  }

  const type = EXT_TO_TYPE[ext];
  if (!type) {
    throw AppError.validation(`Unsupported file type ".${ext}". Upload a PDF, DOCX, XLSX or CSV file.`,
    );
  }
  return type;
}

export async function extractFileText(file: File): Promise<ExtractedFileText> {
  if (file.size > MAX_FILE_BYTES) {
    throw AppError.validation(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. The limit is 25 MB — split the paper and upload it in parts.`,
    );
  }

  const fileType = classifyFile(file);

  switch (fileType) {
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    case "xlsx":
      return extractSpreadsheet(file);
    case "csv":
    case "text":
      return { text: await file.text(), fileType };
  }
}

// ── PDF ─────────────────────────────────────────────────────────────────────
async function extractPdf(file: File): Promise<ExtractedFileText> {
  const pdfjs = await import("pdfjs-dist");
  // Vite resolves the worker to a real URL at build time; without this pdf.js
  // falls back to running on the main thread and locks the tab on big papers.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push(pageText);
  }

  const text = pages.join("\n\n");

  // A scanned paper parses fine and yields (almost) nothing — the pages are
  // images. Fail loudly rather than sending an empty string to the model.
  if (text.replace(/\s/g, "").length < 40) {
    throw AppError.validation(`No text could be read from "${file.name}". This looks like a scanned PDF (the pages are images, not text). Upload a digital PDF or a DOCX instead.`,
    );
  }

  return { text, fileType: "pdf", pageCount: doc.numPages };
}

// ── DOCX ────────────────────────────────────────────────────────────────────
async function extractDocx(file: File): Promise<ExtractedFileText> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  const text = value.trim();

  if (text.replace(/\s/g, "").length < 40) {
    throw AppError.validation(`No text could be read from "${file.name}". If the questions are images inside the document, they can't be extracted.`,
    );
  }
  return { text, fileType: "docx" };
}

// ── Excel / CSV ─────────────────────────────────────────────────────────────
// Every sheet is flattened to CSV. The AI reads a marks/answer-key column just
// as well as it reads prose, so no separate column-mapping step is needed —
// and a structured sheet naturally extracts at very high confidence.
async function extractSpreadsheet(file: File): Promise<ExtractedFileText> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });

  const sheets = wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    return wb.SheetNames.length > 1 ? `--- Sheet: ${name} ---\n${csv}` : csv;
  }).filter((s) => s.trim().length > 0);

  const text = sheets.join("\n\n");
  if (text.replace(/\s/g, "").length < 40) {
    throw AppError.validation(`"${file.name}" appears to be empty.`);
  }

  return { text, fileType: "xlsx", pageCount: wb.SheetNames.length };
}
