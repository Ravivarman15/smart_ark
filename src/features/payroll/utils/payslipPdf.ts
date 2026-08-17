import { createElement } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { SlipBody } from "../components/SalarySlip";
import { resolveDocumentBranding } from "@/features/branding/documents";
import type { PayrollItem, PayrollRun } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Headless payslip → PDF Blob.
//
// Renders the SAME branded <SlipBody> the on-screen slip dialog uses into a
// hidden, off-screen container, rasterises it with html2canvas and wraps it in
// an A4 jsPDF — identical output to the in-app "Download PDF", but produced in
// the background at approval time so the file can be uploaded + emailed as a
// direct download link. Browser-only (uses the DOM + react-dom/client).
//
// BRANDING: resolved and AWAITED before the render, deliberately. `SlipBody`
// takes branding as a prop rather than reading a hook, because this off-screen
// root races `waitForImages` — a hook that fetched after mount would rasterise
// an unbranded slip roughly half the time, and the failure would be
// intermittent rather than reproducible. Resolving first makes the first paint
// the correct one.
//
// `resolveDocumentBranding` is session-cached, so a payroll run emailing 200
// payslips performs ONE lookup, not 200.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve once the slip has mounted and its logo has loaded.
 *
 * The deadline is enforced by BOTH a timer and the polling loop, and that is
 * not redundancy. `requestAnimationFrame` does not fire in a backgrounded tab,
 * and the deadline check lives inside the rAF callback — so an approver who
 * switches tabs during a payroll run (the normal thing to do while N employees
 * are emailed one at a time) parked this promise forever. Not slow: never. The
 * send loop awaits it, so the whole run hangs and the approval dialog spins
 * with no error to show.
 *
 * `setTimeout` is throttled in background tabs but still fires, so the timer is
 * the one that has to own the deadline.
 */
export const waitForImages = (root: HTMLElement, timeoutMs = 4000): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      resolve();
    };
    const deadline = setTimeout(finish, timeoutMs);
    const tick = () => {
      if (done) return;
      const slip = root.querySelector("#payroll-slip");
      const imgs = Array.from(root.querySelectorAll("img"));
      const ready = imgs.every((img) => img.complete && img.naturalWidth > 0);
      if (slip && ready) finish();
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

  const branding = await resolveDocumentBranding();

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "760px";
  host.style.background = "#ffffff";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(createElement(SlipBody, { item, run, branding }));
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
