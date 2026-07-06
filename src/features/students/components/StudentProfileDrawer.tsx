import { useState, type ReactNode } from "react";
import {
  CalendarCheck,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  IdCard,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeeReceiptDialog, type ReceiptData } from "@/features/fee";
import { RiskBadge, StatusBadge } from "./RiskBadge";
import { StudentAvatar } from "./StudentAvatar";
import { StudentPerformancePanel, StudentFeesPanel } from "./StudentInsightsPanels";
import { useStudentRecordSummary } from "../hooks/useStudentRecordSummary";
import { useStudentInsights, type ReceiptRow } from "../hooks/useStudentInsights";
import { generateStudent360, type Report360Format } from "../services/student360.service";
import { openReportWindow, closeReportWindow } from "@/lib/reportWindow";
import { formatDate, formatDateTime } from "../utils/helpers";
import type { Student } from "../types/student.types";

interface Props {
  student: Student | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (student: Student) => void;
  /** RBAC: gate the record download / print actions. */
  canDownload?: boolean;
}

const qrUrl = (text: string, size = 120) =>
  `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(text)}`;

const phoneDigits = (v?: string): string => (v ?? "").replace(/[^\d]/g, "");

const InfoRow = ({ label, value }: { label: string; value?: ReactNode }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-border/30 last:border-0">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="text-foreground text-right break-words min-w-0">{value || "—"}</span>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="glass-card p-4">
    <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-2">
      {title}
    </h3>
    {children}
  </div>
);

const QuickTile = ({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) => (
  <div className="rounded-lg border border-border/50 px-3 py-2 text-center">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold mt-0.5 ${tone}`}>{value}</p>
  </div>
);

export const StudentProfileDrawer = ({
  student,
  open,
  onOpenChange,
  onEdit,
  canDownload = true,
}: Props) => {
  const [showId, setShowId] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [reporting, setReporting] = useState<Report360Format | null>(null);
  const { data: summary, isLoading: summaryLoading } = useStudentRecordSummary(
    student?.id,
    open,
  );
  const { data: insights, isLoading: insightsLoading } = useStudentInsights(
    student?.id,
    open,
  );

  if (!student) return null;
  const s = student;

  const viewReceipt = (r: ReceiptRow) =>
    setReceipt({
      receiptNo: r.receiptNo ?? "—",
      studentName: s.name,
      batchName: s.batch,
      amount: r.amount,
      paymentMethod: r.method,
      date: r.date,
      amountReceivedToDate: insights?.fee?.received,
      amountPending: insights?.fee?.pending,
      notes: r.notes,
    });

  const callNumber = phoneDigits(s.parentContact || s.studentContact);
  const waNumber = phoneDigits(s.parentContact || s.studentContact);
  const attendance = summary?.attendance;
  const fee = summary?.fee;

  // Student 360° report — gathers every section asynchronously, never blocks UI.
  const runReport = async (format: Report360Format) => {
    if (reporting) return;
    // For PDF / Print the report opens in a new window. It must be opened NOW,
    // synchronously inside the click, or the popup blocker rejects it once the
    // async data gathering below finishes. Excel downloads a file — no window.
    const win = format === "xlsx" ? null : openReportWindow();
    if (format !== "xlsx" && !win) return; // popup blocked — toast already shown
    setReporting(format);
    const toastId = toast.loading("Generating Student 360° report…");
    try {
      await generateStudent360(s, format, win);
      toast.success("Student 360° report ready", { id: toastId });
    } catch (err) {
      closeReportWindow(win);
      toast.error(err instanceof Error ? err.message : "Report failed", { id: toastId });
    } finally {
      setReporting(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col gap-0"
        // hide the radix description-missing warning; we set our own a11y title
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">{s.name} — student profile</SheetTitle>
        {/* ── Sticky header ───────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-background border-b border-border/50 px-5 py-4">
          <div className="flex items-start gap-3 pr-8">
            <StudentAvatar name={s.name} imageUrl={s.profileImageUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-display font-semibold text-foreground truncate">
                  {s.name}
                </h2>
                <RiskBadge risk={s.risk} />
                <StatusBadge active={s.active} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.rollNumber ? `#${s.rollNumber} · ` : ""}
                {s.standardName || "No standard"} · {s.batch || "No batch"}
              </p>
            </div>
          </div>

          {/* Quick contact actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              disabled={!callNumber}
              asChild={!!callNumber}
            >
              {callNumber ? (
                <a href={`tel:${callNumber}`}>
                  <Phone className="w-3.5 h-3.5" /> Call
                </a>
              ) : (
                <span>
                  <Phone className="w-3.5 h-3.5" /> Call
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
              disabled={!waNumber}
              asChild={!!waNumber}
            >
              {waNumber ? (
                <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </a>
              ) : (
                <span>
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setShowId((v) => !v)}
            >
              <IdCard className="w-3.5 h-3.5" /> ID Card
            </Button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Quick status tiles */}
          <div className="grid grid-cols-3 gap-2">
            <QuickTile
              label="Attendance"
              value={
                summaryLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
                ) : attendance ? (
                  `${attendance.percent}%`
                ) : (
                  "—"
                )
              }
              tone={
                attendance
                  ? attendance.percent >= 75
                    ? "text-emerald-600"
                    : attendance.percent >= 50
                      ? "text-amber-600"
                      : "text-red-600"
                  : ""
              }
            />
            <QuickTile
              label="Fee Status"
              value={summaryLoading ? "…" : fee ? fee.status : "—"}
              tone={
                fee ? (fee.status === "Paid" ? "text-emerald-600" : "text-amber-600") : ""
              }
            />
            <QuickTile label="SPI" value={s.spi || "—"} />
          </div>

          {/* ID card preview (toggle) */}
          {showId && (
            <div className="rounded-xl border border-border bg-gradient-to-br from-accent/10 to-background p-4 flex items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <StudentAvatar name={s.name} imageUrl={s.profileImageUrl} size="lg" />
                <img
                  src={qrUrl(s.id, 72)}
                  alt="Student QR"
                  width={72}
                  height={72}
                  className="rounded bg-white p-1"
                />
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-display font-semibold text-base truncate">{s.name}</p>
                <p className="text-muted-foreground">{s.standardName || "—"}</p>
                <p className="text-muted-foreground">Batch: {s.batch || "—"}</p>
                <p className="text-muted-foreground">Roll: {s.rollNumber || "—"}</p>
                {s.enrolmentNo && (
                  <p className="text-muted-foreground">Enrol: {s.enrolmentNo}</p>
                )}
              </div>
            </div>
          )}

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="fees">Fees</TabsTrigger>
            </TabsList>

            <TabsContent value="performance" className="mt-4">
              <StudentPerformancePanel insights={insights} loading={insightsLoading} />
            </TabsContent>

            <TabsContent value="fees" className="mt-4">
              <StudentFeesPanel
                fee={insights?.fee}
                loading={insightsLoading}
                onView={viewReceipt}
              />
            </TabsContent>

            <TabsContent value="profile" className="mt-4 space-y-4">
          <Section title="Personal Information">
            <InfoRow label="Gender" value={s.gender} />
            <InfoRow label="Date of Birth" value={s.dateOfBirth ? formatDate(s.dateOfBirth) : ""} />
            <InfoRow label="Blood Group" value={s.bloodGroup} />
            <InfoRow label="Category" value={s.category} />
            <InfoRow label="Group" value={s.groupName} />
          </Section>

          <Section title="Academic Information">
            <InfoRow label="Standard" value={s.standardName} />
            <InfoRow label="Course Type" value={s.courseTypeName} />
            <InfoRow label="Batch" value={s.batch} />
            <InfoRow label="Campus" value={s.campus} />
            <InfoRow label="Admission Date" value={s.dateOfJoining ? formatDate(s.dateOfJoining) : ""} />
            <InfoRow label="Roll Number" value={s.rollNumber} />
            <InfoRow label="Enrollment No" value={s.enrolmentNo} />
            <InfoRow label="GR Number" value={s.grNo} />
            <InfoRow label="Biometric ID" value={s.biometricId} />
          </Section>

          <Section title="Parent / Guardian">
            <InfoRow label="Father Name" value={s.parentName} />
            <InfoRow label="Father Mobile" value={s.parentContact} />
            <InfoRow label="Father Email" value={s.parentEmail} />
            <InfoRow label="Mother Name" value={s.motherName} />
            <InfoRow label="Mother Mobile" value={s.motherContact} />
            <InfoRow label="Mother Email" value={s.motherEmail} />
            <InfoRow label="Guardian" value={s.guardianName} />
            <InfoRow label="Guardian Relation" value={s.guardianRelation} />
            <InfoRow label="Guardian Contact" value={s.guardianContact} />
          </Section>

          <Section title="Contact Information">
            <InfoRow label="Student Mobile" value={s.studentContact} />
            <InfoRow label="Student Email" value={s.studentEmail} />
            <InfoRow label="Address" value={s.address} />
            <InfoRow label="City" value={s.city} />
            <InfoRow label="State" value={s.state} />
          </Section>

          <Section title="Timeline">
            <ol className="relative border-l border-border/60 ml-1 space-y-3 py-1">
              {[
                s.createdAt && {
                  icon: <GraduationCap className="w-3 h-3" />,
                  label: "Admission created",
                  detail: formatDateTime(s.createdAt),
                },
                s.dateOfJoining && {
                  icon: <CalendarCheck className="w-3 h-3" />,
                  label: "Admission date",
                  detail: formatDate(s.dateOfJoining),
                },
                s.batch && {
                  icon: <GraduationCap className="w-3 h-3" />,
                  label: "Batch assigned",
                  detail: s.batch,
                },
                fee && {
                  icon: <CreditCard className="w-3 h-3" />,
                  label: "Fee assigned",
                  detail: `${fee.status} · pending ${fee.pending}`,
                },
                attendance && attendance.total > 0 && {
                  icon: <CalendarCheck className="w-3 h-3" />,
                  label: "Attendance recorded",
                  detail: `${attendance.total} days · ${attendance.percent}%`,
                },
                summary?.exam && {
                  icon: <GraduationCap className="w-3 h-3" />,
                  label: "Exam history",
                  detail: `${summary.exam.count} results`,
                },
              ]
                .filter(Boolean)
                .map((item, i) => {
                  const it = item as { icon: ReactNode; label: string; detail: string };
                  return (
                    <li key={i} className="ml-4">
                      <span className="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        {it.icon}
                      </span>
                      <p className="text-sm font-medium text-foreground">{it.label}</p>
                      <p className="text-xs text-muted-foreground">{it.detail}</p>
                    </li>
                  );
                })}
            </ol>
          </Section>

          <Section title="System Information">
            <InfoRow label="Student ID" value={<span className="font-mono text-xs">{s.id}</span>} />
            <InfoRow label="Username" value={s.username} />
            <InfoRow label="Status" value={s.active ? "Active" : "Inactive"} />
            <InfoRow label="Created" value={s.createdAt ? formatDateTime(s.createdAt) : ""} />
          </Section>

          <Section title="Student QR">
            <div className="flex flex-col items-center gap-1 py-1">
              <img
                src={qrUrl(s.id, 120)}
                alt={`QR for ${s.name}`}
                width={120}
                height={120}
                className="rounded bg-white p-2"
              />
              <p className="text-[11px] text-muted-foreground">
                Scan for attendance kiosk verification
              </p>
            </div>
          </Section>
            </TabsContent>
          </Tabs>
        </div>

        {/* Receipt viewer (print / download inside) */}
        <FeeReceiptDialog receipt={receipt} onOpenChange={(o) => !o && setReceipt(null)} />

        {/* ── Sticky footer actions ───────────────────────────────────── */}
        <div className="sticky bottom-0 z-10 bg-background border-t border-border/50 px-5 py-3 flex flex-wrap items-center justify-end gap-2">
          {onEdit && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEdit(s)}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {canDownload && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={!!reporting}
                onClick={() => runReport("print")}
              >
                {reporting === "print" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Printer className="w-3.5 h-3.5" />
                )}{" "}
                Print
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5" disabled={!!reporting}>
                    {reporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}{" "}
                    360° Report
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => runReport("pdf")}>
                    <FileText className="w-3.5 h-3.5 mr-2" /> PDF (A4)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runReport("xlsx")}>
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runReport("print")}>
                    <Printer className="w-3.5 h-3.5 mr-2" /> Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
