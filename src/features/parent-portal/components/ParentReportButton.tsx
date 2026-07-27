// ── Parent Portal — report download ──────────────────────────────────────────
//
// Reuses generateStudent360 verbatim — the same 12-section dossier staff
// generate. A parent-specific report generator would drift from the staff one
// within a release, and a parent quoting a number staff cannot reproduce is
// exactly the failure mode to avoid.
//
// WINDOW HANDLING: the report opens a print window. `openReportWindow()` must
// be called SYNCHRONOUSLY inside the click handler — opening it after the
// `await` returns null under popup blockers, which is the app-wide blank-print
// bug this helper exists to prevent. See src/lib/reportWindow.ts.

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { generateStudent360 } from "@/features/students/services";
import { closeReportWindow, openReportWindow } from "@/lib/reportWindow";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { parentAuditService } from "../services/parentAudit.service";
import type { Student } from "@/features/students/types";

export const ParentReportButton = ({
  student,
  label = "Download report",
}: {
  student: Student;
  label?: string;
}) => {
  const { parent } = useAuth();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (busy) return;
    // Synchronous — must happen before any await.
    const win = openReportWindow();
    if (!win) return; // blocked; openReportWindow already told the user
    setBusy(true);
    try {
      await generateStudent360(student, "pdf", win);
      if (parent) {
        void parentAuditService.log({
          parentAccountId: parent.accountId,
          studentId: student.id,
          event: "download_report",
          detail: "student_360_pdf",
        });
      }
    } catch (e) {
      closeReportWindow(win);
      toast.error(`Could not generate the report: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {busy ? "Preparing…" : label}
    </button>
  );
};
