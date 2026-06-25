import { createElement } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { SlipBody } from "../components/SalarySlip";
import type { PayrollItem, PayrollRun } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Headless payslip → PDF Blob.
//
// Renders the SAME branded <SlipBody> the on-screen slip dialog uses into a
// hidden, off-screen container, rasterises it with html2canvas and wraps it in
// an A4 jsPDF — identical output to the in-app "Download PDF", but produced in
// the background at approval time so the file can be uploaded + emailed as a
// direct download link. Browser-only (uses the DOM + react-dom/client).
// ─────────────────────────────────────────────────────────────────────────────

const waitForImages = (root: HTMLElement, timeoutMs = 4000): Promise<void> =>
  new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const slip = root.querySelector("#payroll-slip");
      const imgs = Array.from(root.querySelectorAll("img"));
      const ready = imgs.every((img) => img.complete && img.naturalWidth > 0);
      if (slip && ready) resolve();
      else if (Date.now() - start > timeoutMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

export const generatePayslipPdfBlob = async (
  item: PayrollItem,
  run: PayrollRun,
): Promise<Blob> => {
  if (typeof document === "undefined") {
    throw new Error("Payslip PDF generation requires a browser environment.");
  }

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "760px";
  host.style.background = "#ffffff";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(createElement(SlipBody, { item, run }));
    await waitForImages(host);

    const node = (host.querySelector("#payroll-slip") as HTMLElement) ?? host;
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 28;
    const w = pageW - margin * 2;
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, w, h);
    return pdf.output("blob");
  } finally {
    root.unmount();
    host.remove();
  }
};
