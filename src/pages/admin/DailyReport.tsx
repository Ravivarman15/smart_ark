import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import {
    Activity, CheckCircle2, Users, GraduationCap, RotateCcw,
    DollarSign, Phone, AlertTriangle, Send, RefreshCw, Clock, FileText,
    Calendar, Eye, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReportData {
    date: string;
    ihi: number;
    violations: number;
    checklist: { done: number; total: number };
    retests: { pending: number; completed: number };
    fees: { collected: number; pending: number };
    teacherAttendance: { onTime: number; late: number; absent: number };
    admissions: { walkIns: number; calls: number; conversions: number };
    studentAttendance: { present: number; absent: number; total: number };
}

interface ReportLog {
    id: string;
    date: string;
    sent_at: string;
    trigger_type: string;
    status: string;
    report_data: ReportData | null;
}

const DailyReport: React.FC = () => {
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [reportHistory, setReportHistory] = useState<ReportLog[]>([]);
    const [viewingHistory, setViewingHistory] = useState<string | null>(null);
    const reportCardRef = useRef<HTMLDivElement>(null);

    // Fetch report data directly from Supabase tables (client-side)
    const fetchReportData = async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split("T")[0];

            // Parallel queries for all report sections
            const [
                ihiRes,
                violationsRes,
                checklistRes,
                pendingRetestsRes,
                completedRetestsRes,
                feeRes,
                teacherAttRes,
                admissionRes,
                studentAttRes,
            ] = await Promise.all([
                supabase.from("ihi_trend").select("ihi").order("created_at", { ascending: false }).limit(1),
                supabase.from("violations").select("id", { count: "exact" }).eq("date", today).eq("resolved", false),
                supabase.from("admin_checklist").select("completed").eq("date", today),
                supabase.from("retests").select("id", { count: "exact", head: true }).eq("status", "pending"),
                supabase.from("retests").select("id", { count: "exact", head: true }).eq("status", "completed"),
                supabase.from("fee_transactions").select("amount, paid").eq("date", today),
                supabase.from("teacher_attendance").select("status").eq("date", today),
                supabase.from("admission_calls").select("is_walkin, status").eq("date", today),
                supabase.from("student_attendance").select("status").eq("date", today),
            ]);

            const latestIhi = ihiRes.data?.[0]?.ihi || 0;
            const checklistTotal = checklistRes.data?.length || 0;
            const checklistDone = checklistRes.data?.filter((c: any) => c.completed)?.length || 0;
            const feesCollected = feeRes.data?.filter((f: any) => f.paid)?.reduce((s: number, f: any) => s + Number(f.amount), 0) || 0;
            const feesPending = feeRes.data?.filter((f: any) => !f.paid)?.reduce((s: number, f: any) => s + Number(f.amount), 0) || 0;
            const onTime = teacherAttRes.data?.filter((t: any) => t.status === "on_time")?.length || 0;
            const late = teacherAttRes.data?.filter((t: any) => t.status === "late")?.length || 0;
            const absent = teacherAttRes.data?.filter((t: any) => t.status === "absent")?.length || 0;
            const walkIns = admissionRes.data?.filter((a: any) => a.is_walkin)?.length || 0;
            const calls = admissionRes.data?.filter((a: any) => !a.is_walkin)?.length || 0;
            const conversions = admissionRes.data?.filter((a: any) => a.status === "converted")?.length || 0;
            const studentPresent = studentAttRes.data?.filter((s: any) => s.status === "present")?.length || 0;
            const studentAbsent = studentAttRes.data?.filter((s: any) => s.status === "absent")?.length || 0;
            const studentTotal = studentAttRes.data?.length || 0;

            setReportData({
                date: today,
                ihi: latestIhi,
                violations: violationsRes.count || 0,
                checklist: { done: checklistDone, total: checklistTotal },
                retests: { pending: pendingRetestsRes.count || 0, completed: completedRetestsRes.count || 0 },
                fees: { collected: feesCollected, pending: feesPending },
                teacherAttendance: { onTime: onTime, late: late, absent: absent },
                admissions: { walkIns, calls, conversions },
                studentAttendance: { present: studentPresent, absent: studentAbsent, total: studentTotal },
            });
        } catch (err: any) {
            console.error("Report data error:", err);
            toast.error("Failed to load report data");
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const { data, error } = await supabase
                .from("daily_report_log")
                .select("*")
                .order("date", { ascending: false })
                .limit(14);
            if (!error && data) {
                setReportHistory(data as unknown as ReportLog[]);
            }
        } catch (err) {
            console.error("History fetch error:", err);
        }
    };

    useEffect(() => {
        fetchReportData();
        fetchHistory();
    }, []);

    const handleSendReport = async () => {
        setSending(true);
        try {
            const { data, error } = await supabase.functions.invoke("send-daily-report", {
                body: { trigger_type: "manual" },
            });
            if (error) throw error;
            if (data?.alreadySent) {
                toast.info("Daily report was already sent today.");
            } else if (data?.success) {
                toast.success("Daily report sent to WhatsApp!");
                fetchHistory();
            } else {
                toast.error("Report saved but WhatsApp send failed: " + (data?.message || "unknown error"));
                fetchHistory();
            }
        } catch (err: any) {
            console.error("Send error:", err);
            toast.error("Failed to send daily report.");
        } finally {
            setSending(false);
        }
    };

    const buildReportText = (d: ReportData) => {
        return `ARK EDUCATION - Daily Report
Date: ${d.date}

IHI Score: ${d.ihi}/100

Admin Checklist: ${d.checklist.done}/${d.checklist.total} completed

Teacher Attendance:
  On-time: ${d.teacherAttendance.onTime}
  Late: ${d.teacherAttendance.late}
  Absent: ${d.teacherAttendance.absent}

Student Attendance:
  Present: ${d.studentAttendance.present}/${d.studentAttendance.total}
  Absent: ${d.studentAttendance.absent}

Retests:
  Pending: ${d.retests.pending}
  Completed: ${d.retests.completed}

Fees:
  Collected today: Rs.${d.fees.collected.toLocaleString()}
  Pending: Rs.${d.fees.pending.toLocaleString()}

Admissions:
  Calls: ${d.admissions.calls} | Walk-ins: ${d.admissions.walkIns}
  Conversions: ${d.admissions.conversions}

Active Violations: ${d.violations}`;
    };

    const handleDownload = () => {
        const d = displayData;
        if (!d) return;

        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pw = pdf.internal.pageSize.getWidth();
        const margin = 18;
        const contentW = pw - margin * 2;
        let y = 0;

        // ─── Colors ────────────────────────────────────
        const navy = [15, 30, 55] as const;
        const gold = [245, 190, 15] as const;
        const white = [255, 255, 255] as const;
        const lightGray = [240, 242, 245] as const;
        const darkText = [30, 40, 60] as const;
        const mutedText = [120, 130, 150] as const;
        const green = [34, 170, 80] as const;
        const red = [220, 60, 60] as const;
        const orange = [240, 160, 30] as const;

        // ─── Header Bar ───────────────────────────────
        pdf.setFillColor(...navy);
        pdf.rect(0, 0, pw, 38, "F");
        pdf.setFillColor(...gold);
        pdf.rect(0, 38, pw, 2, "F");

        pdf.setTextColor(...white);
        pdf.setFontSize(20);
        pdf.setFont("helvetica", "bold");
        pdf.text("ARK EDUCATION", margin, 17);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.text("Daily Performance Report", margin, 25);

        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        const dateStr = new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
        });
        pdf.text(dateStr, pw - margin, 17, { align: "right" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(`Report Date: ${d.date}`, pw - margin, 25, { align: "right" });

        y = 50;

        // ─── IHI Score Section ─────────────────────────
        pdf.setFillColor(...lightGray);
        pdf.roundedRect(margin, y, contentW, 30, 3, 3, "F");
        pdf.setFontSize(9);
        pdf.setTextColor(...mutedText);
        pdf.text("INSTITUTION HEALTH INDEX", pw / 2, y + 10, { align: "center" });
        pdf.setFontSize(28);
        pdf.setFont("helvetica", "bold");
        const ihiVal = d.ihi;
        if (ihiVal >= 80) pdf.setTextColor(34, 170, 80);
        else if (ihiVal >= 60) pdf.setTextColor(240, 160, 30);
        else pdf.setTextColor(220, 60, 60);
        pdf.text(`${ihiVal}`, pw / 2 - 5, y + 24, { align: "center" });
        pdf.setFontSize(12);
        pdf.setTextColor(...mutedText);
        pdf.text("/100", pw / 2 + 12, y + 24, { align: "center" });
        y += 38;

        // ─── Helper: Draw metric box ───────────────────
        const boxW = (contentW - 8) / 3;
        const boxH = 32;

        const drawBox = (x: number, yPos: number, title: string, lines: { label: string; value: string; color?: readonly [number, number, number] }[]) => {
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(220, 225, 230);
            pdf.roundedRect(x, yPos, boxW, boxH, 2, 2, "FD");
            pdf.setFontSize(7);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(...mutedText);
            pdf.text(title.toUpperCase(), x + 5, yPos + 7);

            let ly = yPos + 14;
            for (const line of lines) {
                pdf.setFontSize(9);
                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(...mutedText);
                pdf.text(line.label, x + 5, ly);
                pdf.setFont("helvetica", "bold");
                const c = line.color || darkText;
                pdf.setTextColor(c[0], c[1], c[2]);
                pdf.text(line.value, x + boxW - 5, ly, { align: "right" });
                ly += 5;
            }
        };

        // ─── Row 1: Checklist, Teachers, Students ──────
        const x1 = margin;
        const x2 = margin + boxW + 4;
        const x3 = margin + (boxW + 4) * 2;

        drawBox(x1, y, "Admin Checklist", [
            { label: "Completed", value: `${d.checklist.done} / ${d.checklist.total}`, color: d.checklist.done === d.checklist.total && d.checklist.total > 0 ? green : orange },
            { label: "Progress", value: d.checklist.total > 0 ? `${Math.round((d.checklist.done / d.checklist.total) * 100)}%` : "0%" },
        ]);

        drawBox(x2, y, "Teacher Attendance", [
            { label: "On-time", value: `${d.teacherAttendance.onTime}`, color: green },
            { label: "Late", value: `${d.teacherAttendance.late}`, color: orange },
            { label: "Absent", value: `${d.teacherAttendance.absent}`, color: red },
        ]);

        drawBox(x3, y, "Student Attendance", [
            { label: "Present", value: `${d.studentAttendance.present} / ${d.studentAttendance.total}`, color: green },
            { label: "Absent", value: `${d.studentAttendance.absent}`, color: d.studentAttendance.absent > 0 ? red : green },
        ]);

        y += boxH + 6;

        // ─── Row 2: Retests, Fees, Admissions ──────────
        drawBox(x1, y, "Retests", [
            { label: "Pending", value: `${d.retests.pending}`, color: d.retests.pending > 0 ? orange : green },
            { label: "Completed", value: `${d.retests.completed}`, color: green },
        ]);

        drawBox(x2, y, "Fee Collection", [
            { label: "Collected", value: `Rs ${d.fees.collected.toLocaleString()}`, color: green },
            { label: "Pending", value: `Rs ${d.fees.pending.toLocaleString()}`, color: d.fees.pending > 0 ? red : green },
        ]);

        drawBox(x3, y, "Admissions", [
            { label: "Calls", value: `${d.admissions.calls}` },
            { label: "Walk-ins", value: `${d.admissions.walkIns}` },
            { label: "Converted", value: `${d.admissions.conversions}`, color: green },
        ]);

        y += boxH + 8;

        // ─── Violations Banner ─────────────────────────
        const hasViolations = d.violations > 0;
        if (hasViolations) { pdf.setFillColor(255, 240, 240); } else { pdf.setFillColor(235, 255, 240); }
        if (hasViolations) { pdf.setDrawColor(220, 60, 60); } else { pdf.setDrawColor(34, 170, 80); }
        pdf.roundedRect(margin, y, contentW, 14, 2, 2, "FD");
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        if (hasViolations) { pdf.setTextColor(220, 60, 60); } else { pdf.setTextColor(34, 170, 80); }
        const violationText = hasViolations ? `${d.violations} Active Violations` : "No Active Violations";
        pdf.text(hasViolations ? "!  " + violationText : "    " + violationText, pw / 2, y + 9, { align: "center" });

        y += 22;

        // ─── Summary Table ─────────────────────────────
        pdf.setFillColor(...navy);
        pdf.roundedRect(margin, y, contentW, 10, 2, 2, "F");
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...white);
        pdf.text("QUICK SUMMARY", pw / 2, y + 7, { align: "center" });
        y += 12;

        const summaryRows = [
            ["IHI Score", `${d.ihi}/100`],
            ["Checklist", `${d.checklist.done}/${d.checklist.total} completed`],
            ["Teachers", `${d.teacherAttendance.onTime} on-time, ${d.teacherAttendance.late} late, ${d.teacherAttendance.absent} absent`],
            ["Students", `${d.studentAttendance.present}/${d.studentAttendance.total} present, ${d.studentAttendance.absent} absent`],
            ["Retests", `${d.retests.pending} pending, ${d.retests.completed} completed`],
            ["Fees", `Rs ${d.fees.collected.toLocaleString()} collected, Rs ${d.fees.pending.toLocaleString()} pending`],
            ["Admissions", `${d.admissions.calls} calls, ${d.admissions.walkIns} walk-ins, ${d.admissions.conversions} converted`],
            ["Violations", `${d.violations} active`],
        ];

        for (let i = 0; i < summaryRows.length; i++) {
            const [label, value] = summaryRows[i];
            const rowColor = i % 2 === 0 ? lightGray : white;
            pdf.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
            pdf.rect(margin, y, contentW, 8, "F");
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(...darkText);
            pdf.text(label, margin + 5, y + 5.5);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(...mutedText);
            pdf.text(value, pw - margin - 5, y + 5.5, { align: "right" });
            y += 8;
        }

        // ─── Footer ────────────────────────────────────
        y += 8;
        pdf.setDrawColor(...gold);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, pw - margin, y);
        y += 6;
        pdf.setFontSize(7);
        pdf.setTextColor(...mutedText);
        pdf.text(`Generated on ${new Date().toLocaleString("en-IN")} | ARK Education Management System`, pw / 2, y, { align: "center" });

        pdf.save(`ARK_Daily_Report_${d.date}.pdf`);
        toast.success("PDF report downloaded!");
    };

    const ihiColor = (val: number) =>
        val >= 80 ? "text-ark-success" : val >= 60 ? "text-ark-warning" : "text-ark-danger";

    const today = new Date().toLocaleDateString("en-IN", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const displayData = viewingHistory
        ? reportHistory.find(r => r.id === viewingHistory)?.report_data || reportData
        : reportData;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-accent mx-auto" />
                    <p className="text-muted-foreground text-sm">Loading report data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2">
                        <FileText className="w-5 h-5 text-accent" /> Daily Report
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">{today}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => { setViewingHistory(null); fetchReportData(); }} className="gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownload} disabled={!displayData} className="gap-1.5">
                        <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                    <Button size="sm" onClick={handleSendReport} disabled={sending} className="gap-1.5">
                        {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {sending ? "Sending..." : "Send to WhatsApp"}
                    </Button>
                </div>
            </div>

            {viewingHistory && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-sm">
                    <Eye className="w-4 h-4 text-accent" />
                    <span className="text-foreground">
                        Viewing report from {reportHistory.find(r => r.id === viewingHistory)?.date}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setViewingHistory(null)} className="ml-auto text-xs">
                        Back to Today
                    </Button>
                </div>
            )}

            {displayData ? (
                <>
                    {/* Report Card */}
                    <div ref={reportCardRef} className="glass-card p-5 md:p-6 space-y-5">
                        {/* Title Bar */}
                        <div className="flex items-center justify-between pb-3 border-b border-border/50">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center">
                                    <Activity className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <p className="font-display font-bold text-foreground text-sm">ARK EDUCATION</p>
                                    <p className="text-[10px] text-muted-foreground">Daily Performance Report</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>{displayData.date}</span>
                            </div>
                        </div>

                        {/* IHI Score */}
                        <div className="text-center py-4 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/30">
                            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Institution Health Index</p>
                            <p className={`text-5xl font-display font-black ${ihiColor(displayData.ihi)}`}>
                                {displayData.ihi}
                                <span className="text-lg text-muted-foreground font-normal">/100</span>
                            </p>
                        </div>

                        {/* Metric Grid — responsive */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {/* Checklist */}
                            <div className="p-4 rounded-xl bg-muted/10 border border-border/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Checklist</span>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                                </div>
                                <p className="text-xl font-display font-bold text-foreground">
                                    {displayData.checklist.done}<span className="text-sm text-muted-foreground font-normal">/{displayData.checklist.total}</span>
                                </p>
                                <div className="w-full bg-muted/30 rounded-full h-1.5">
                                    <div
                                        className="h-1.5 rounded-full bg-accent transition-all"
                                        style={{ width: `${displayData.checklist.total > 0 ? (displayData.checklist.done / displayData.checklist.total) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>

                            {/* Teachers */}
                            <div className="p-4 rounded-xl bg-muted/10 border border-border/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Teachers</span>
                                    <Users className="w-3.5 h-3.5 text-accent" />
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-center">
                                    <div>
                                        <p className="text-sm font-bold text-ark-success">{displayData.teacherAttendance.onTime}</p>
                                        <p className="text-[9px] text-muted-foreground">On-time</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-ark-warning">{displayData.teacherAttendance.late}</p>
                                        <p className="text-[9px] text-muted-foreground">Late</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-ark-danger">{displayData.teacherAttendance.absent}</p>
                                        <p className="text-[9px] text-muted-foreground">Absent</p>
                                    </div>
                                </div>
                            </div>

                            {/* Students */}
                            <div className="p-4 rounded-xl bg-muted/10 border border-border/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Students</span>
                                    <GraduationCap className="w-3.5 h-3.5 text-accent" />
                                </div>
                                <p className="text-xl font-display font-bold text-foreground">
                                    {displayData.studentAttendance.present}<span className="text-sm text-muted-foreground font-normal">/{displayData.studentAttendance.total}</span>
                                </p>
                                <p className="text-[10px] text-muted-foreground">{displayData.studentAttendance.absent} absent</p>
                            </div>

                            {/* Retests */}
                            <div className="p-4 rounded-xl bg-muted/10 border border-border/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Retests</span>
                                    <RotateCcw className="w-3.5 h-3.5 text-accent" />
                                </div>
                                <div className="flex gap-4">
                                    <div>
                                        <p className="text-sm font-bold text-ark-warning">{displayData.retests.pending}</p>
                                        <p className="text-[9px] text-muted-foreground">Pending</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-ark-success">{displayData.retests.completed}</p>
                                        <p className="text-[9px] text-muted-foreground">Done</p>
                                    </div>
                                </div>
                            </div>

                            {/* Fees */}
                            <div className="p-4 rounded-xl bg-muted/10 border border-border/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fees</span>
                                    <DollarSign className="w-3.5 h-3.5 text-accent" />
                                </div>
                                <p className="text-sm font-bold text-ark-success">₹{displayData.fees.collected.toLocaleString()}</p>
                                <p className="text-[10px] text-muted-foreground">Pending: ₹{displayData.fees.pending.toLocaleString()}</p>
                            </div>

                            {/* Admissions */}
                            <div className="p-4 rounded-xl bg-muted/10 border border-border/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Admissions</span>
                                    <Phone className="w-3.5 h-3.5 text-accent" />
                                </div>
                                <div className="flex gap-3">
                                    <div>
                                        <p className="text-sm font-bold text-foreground">{displayData.admissions.calls}</p>
                                        <p className="text-[9px] text-muted-foreground">Calls</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-foreground">{displayData.admissions.walkIns}</p>
                                        <p className="text-[9px] text-muted-foreground">Walk-ins</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-ark-success">{displayData.admissions.conversions}</p>
                                        <p className="text-[9px] text-muted-foreground">Converted</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Violations Banner */}
                        <div className={`flex items-center gap-3 p-3 rounded-lg border ${displayData.violations > 0
                            ? "border-ark-danger/30 bg-ark-danger/5"
                            : "border-ark-success/30 bg-ark-success/5"
                            }`}>
                            <AlertTriangle className={`w-4 h-4 ${displayData.violations > 0 ? "text-ark-danger" : "text-ark-success"}`} />
                            <span className={`text-sm font-medium ${displayData.violations > 0 ? "text-ark-danger" : "text-ark-success"}`}>
                                {displayData.violations > 0
                                    ? `${displayData.violations} Active Violations`
                                    : "No Active Violations ✓"}
                            </span>
                        </div>
                    </div>

                    {/* Text Preview */}
                    {!viewingHistory && (
                        <details className="glass-card">
                            <summary className="p-4 cursor-pointer text-sm font-medium text-foreground flex items-center gap-2 hover:bg-muted/10 rounded-lg">
                                <Send className="w-3.5 h-3.5 text-accent" />
                                WhatsApp Message Preview
                            </summary>
                            <div className="px-4 pb-4">
                                <pre className="bg-[#0b1419] text-[#e9edef] text-xs p-4 rounded-xl font-mono whitespace-pre-wrap leading-relaxed border border-[#233138] max-h-[400px] overflow-y-auto">
                                    {buildReportText(displayData)}
                                </pre>
                            </div>
                        </details>
                    )}
                </>
            ) : (
                <div className="glass-card p-8 text-center">
                    <AlertTriangle className="w-8 h-8 text-ark-warning mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Could not load report data. Please try refreshing.</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={fetchReportData}>
                        <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </Button>
                </div>
            )}

            {/* Report History */}
            <div className="glass-card p-4 md:p-5">
                <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-accent" /> Report History
                </h2>
                {reportHistory.length > 0 ? (
                    <div className="space-y-2">
                        {reportHistory.map((log) => (
                            <button
                                key={log.id}
                                onClick={() => setViewingHistory(viewingHistory === log.id ? null : log.id)}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${viewingHistory === log.id
                                    ? "border-accent/40 bg-accent/5"
                                    : "border-border/50 bg-muted/10 hover:bg-muted/20"
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${log.status === "sent" ? "bg-ark-success" : "bg-ark-danger"}`} />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{log.date}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                            {log.trigger_type === "manual" ? "EOD Completion" : "Scheduled"} · {new Date(log.sent_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                    </div>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${log.status === "sent"
                                    ? "bg-ark-success/10 text-ark-success"
                                    : "bg-ark-danger/10 text-ark-danger"
                                    }`}>
                                    {log.status}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No reports sent yet.</p>
                )}
            </div>
        </div>
    );
};

export default DailyReport;
