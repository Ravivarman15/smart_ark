import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAppData } from "@/contexts/AppDataContext";
import {
  GraduationCap, AlertTriangle, Plus, Edit, Filter, Power,
  Clock, Users, ChevronDown, ChevronUp, Search, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import arkLogo from "@/assets/ark-logo.jpeg";

interface Standard { id: string; name: string; }
interface Batch { id: string; name: string; standard_id: string | null; timing_start: string | null; timing_end: string | null; }
interface CourseType { id: string; name: string; }
interface FeeStructure { id: string; name: string; total_amount: number | null; seat_confirmation_amount: number | null; first_payment_amount: number | null; installment_count: number | null; standard_id: string | null; }
interface StudentRow {
  id: string; name: string; standard_id: string | null; batch_id: string | null;
  course_type_id: string | null; fee_structure_id: string | null;
  spi: number | null; risk_level: string | null; is_active: boolean;
  parent_name: string | null; parent_contact: string | null;
  parent_contact2: string | null; parent_email: string | null;
  date_of_birth: string | null; admission_date: string | null;
  batches?: { name: string } | null;
  standards?: { name: string } | null;
  course_types?: { name: string } | null;
}

const riskColor = (risk: string | null) => {
  if (risk === "high_risk") return "bg-red-100 text-red-700";
  if (risk === "watch") return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
};
const riskLabel = (risk: string | null) => {
  if (risk === "high_risk") return "Critical";
  if (risk === "watch") return "Watch";
  return "Safe";
};

// ─── Async logo preloader ─────────────────────────────────────────────────────
// Loads the ARK logo JPEG into a canvas and returns a base64 data-URI.
// Must be awaited before calling generateStudentListPDF.
const preloadLogo = (): Promise<string | null> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 300; canvas.height = 300;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, 300, 300);
        resolve(canvas.toDataURL("image/jpeg", 0.95));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = arkLogo;
  });

// ─── Professional PDF Generator (Portrait A4) ────────────────────────────────
//  Portrait A4 · 210 × 297 mm · 14 mm margins = 182 mm usable width
//  Two-line rows: student name bold (L1) + parent name muted (L2)
// ─────────────────────────────────────────────────────────────────────────────
const generateStudentListPDF = (
  students: StudentRow[],
  standards: Standard[],
  allBatches: Batch[],
  courseTypes: CourseType[],
  filterStandard: string,
  filterRisk: string,
  search: string,
  logoData: string | null   // pre-loaded base64 JPEG from preloadLogo()
) => {
  // ── Document ────────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW  = 210;
  const PH  = 297;
  const ML  = 14;
  const MR  = 14;
  const CW  = PW - ML - MR;   // 182 mm

  type RGB = [number, number, number];
  const C: Record<string, RGB> = {
    navy:    [14, 42, 100],
    navyMd:  [28, 60, 150],
    blue:    [37, 99, 235],
    blueBg:  [219, 234, 254],
    gold:    [180, 140, 40],
    green:   [21, 128, 61],
    greenBg: [220, 252, 231],
    amber:   [161, 98, 7],
    amberBg: [254, 243, 199],
    red:     [185, 28, 28],
    redBg:   [254, 226, 226],
    dark:    [15, 15, 20],
    gray6:   [55, 65, 81],
    gray5:   [107, 114, 128],
    gray2:   [229, 231, 235],
    gray1:   [245, 247, 250],
    white:   [255, 255, 255],
  };

  const safe  = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const trunc = (s: string, maxW: number) => doc.splitTextToSize(s, maxW)[0] as string;
  const now   = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const total = students.length;

  const filterLabel = () => {
    const parts: string[] = [];
    if (filterStandard !== "all") {
      const std = standards.find(s => s.id === filterStandard);
      if (std) parts.push("Class: " + std.name);
    }
    if (filterRisk !== "all") parts.push("Risk: " + riskLabel(filterRisk === "critical" ? "high_risk" : filterRisk));
    if (search) parts.push("Search: \"" + search + "\"");
    return parts.length > 0 ? parts.join("  ·  ") : "All Active Students";
  };

  const riskStyle = (r: string | null): { fg: RGB; bg: RGB } => {
    if (r === "high_risk") return { fg: C.red,   bg: C.redBg   };
    if (r === "watch")     return { fg: C.amber, bg: C.amberBg };
    return                       { fg: C.green, bg: C.greenBg  };
  };

  // ── Layout ──────────────────────────────────────────────────────────────────
  const HEADER_H = 32;   // taller to accommodate logo
  const BAND_H   =  8;
  const SUMM_H   = 18;
  const TH_H     =  8;
  const ROW_H    = 12;
  const FOOTER_H =  9;
  const CONTENT_START = HEADER_H + BAND_H + SUMM_H + 3;
  const BOTTOM_Y      = PH - FOOTER_H - 2;

  const p1Cap  = Math.max(1, Math.floor((BOTTOM_Y - CONTENT_START - TH_H) / ROW_H));
  const pNCap  = Math.max(1, Math.floor((BOTTOM_Y - HEADER_H - BAND_H - 2 - TH_H) / ROW_H));
  const extra  = total - p1Cap > 0 ? Math.ceil((total - p1Cap) / pNCap) : 0;
  const tPages = 1 + extra;

  // ── Column definitions ───────────────────────────────────────────────────────
  //  # | Student (name+parent) | Class·Batch | Contact | SPI | Risk  | Joined
  //  7    58                     38            30        13    22       14   = 182
  const COLS = [
    { hdr: "#",              w: 10, align: "center" as const },
    { hdr: "STUDENT",        w: 55, align: "left"   as const },
    { hdr: "CLASS & BATCH",  w: 38, align: "left"   as const },
    { hdr: "CONTACT",        w: 30, align: "left"   as const },
    { hdr: "SPI",            w: 13, align: "center" as const },
    { hdr: "RISK",           w: 22, align: "center" as const },
    { hdr: "JOINED",         w: 14, align: "center" as const },
  ];
  const COL_X: number[] = [];
  let cx = ML;
  COLS.forEach(c => { COL_X.push(cx); cx += c.w; });

  // ── drawHeader ───────────────────────────────────────────────────────────────
  const drawHeader = (pg: number) => {
    // Full-width navy background
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, PW, HEADER_H, "F");

    // Right-side lighter accent block for depth
    doc.setFillColor(...C.navyMd);
    doc.triangle(PW - 55, 0, PW, 0, PW, HEADER_H, "F");

    // ── Logo image (or coloured fallback box) ─────────────────────────────────
    const LOGO_SZ = 24;   // mm — square logo
    const LOGO_X  = ML;
    const LOGO_Y  = (HEADER_H - LOGO_SZ) / 2;

    if (logoData) {
      // White circle background behind logo for clean look
      doc.setFillColor(...C.white);
      doc.roundedRect(LOGO_X - 1, LOGO_Y - 1, LOGO_SZ + 2, LOGO_SZ + 2, 2, 2, "F");
      doc.addImage(logoData, "JPEG", LOGO_X, LOGO_Y, LOGO_SZ, LOGO_SZ);
    } else {
      // Fallback: navy-blue initials box
      doc.setFillColor(...C.blue);
      doc.roundedRect(LOGO_X, LOGO_Y, LOGO_SZ, LOGO_SZ, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...C.white);
      doc.text("ARK", LOGO_X + LOGO_SZ / 2, LOGO_Y + 14, { align: "center" });
    }

    // ── School name + tagline ─────────────────────────────────────────────────
    const TEXT_X = ML + LOGO_SZ + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...C.white);
    doc.text("ARK LEARNING ARENA", TEXT_X, 12);

    // Gold underline accent below school name
    doc.setFillColor(...C.gold);
    doc.rect(TEXT_X, 14, 72, 0.8, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(190, 210, 250);
    doc.text("Student Management System  ·  Confidential Document", TEXT_X, 20);

    // ── Right block: date + page ──────────────────────────────────────────────
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(200, 218, 255);
    doc.text("Generated: " + dateStr, PW - MR, 11, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.text("Page " + pg + " / " + tPages, PW - MR, 20, { align: "right" });
  };

  // ── drawBand ─────────────────────────────────────────────────────────────────
  const drawBand = () => {
    const y = HEADER_H;
    doc.setFillColor(...C.blueBg);
    doc.rect(0, y, PW, BAND_H, "F");
    doc.setFillColor(...C.blue);
    doc.rect(0, y, 5, BAND_H, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...C.navy);
    doc.text("STUDENT LIST REPORT", ML + 1.5, y + 5.8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.navyMd);
    doc.text(
      filterLabel() + "   |   " + total + " student" + (total !== 1 ? "s" : ""),
      PW - MR, y + 5.8, { align: "right" }
    );
  };

  // ── drawSummary ───────────────────────────────────────────────────────────────
  const drawSummary = () => {
    const y = HEADER_H + BAND_H + 2;
    type Card = { label: string; val: string; fg: RGB; bg: RGB; stripe: RGB };
    const crit  = students.filter(s => s.risk_level === "high_risk").length;
    const watch = students.filter(s => s.risk_level === "watch").length;
    const safe2 = students.filter(s => !s.risk_level || s.risk_level === "safe").length;
    const cards: Card[] = [
      { label: "TOTAL",   val: String(total),  fg: C.navy,  bg: C.blueBg,  stripe: C.navy  },
      { label: "SAFE",    val: String(safe2),  fg: C.green, bg: C.greenBg, stripe: C.green },
      { label: "WATCH",   val: String(watch),  fg: C.amber, bg: C.amberBg, stripe: C.amber },
      { label: "CRITICAL",val: String(crit),   fg: C.red,   bg: C.redBg,   stripe: C.red   },
    ];
    const cw = (CW - 9) / 4;
    cards.forEach((card, i) => {
      const x = ML + i * (cw + 3);
      doc.setFillColor(...card.bg);
      doc.roundedRect(x, y, cw, SUMM_H, 2, 2, "F");
      doc.setFillColor(...card.stripe);
      doc.roundedRect(x, y, 4, SUMM_H, 2, 2, "F");
      doc.rect(x + 2.5, y, 1.5, SUMM_H, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...card.fg);
      doc.text(card.val, x + cw / 2 + 1, y + 10.5, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.setTextColor(...card.fg);
      doc.text(card.label, x + cw / 2 + 1, y + 15.5, { align: "center" });
    });
  };

  // ── drawTHead ────────────────────────────────────────────────────────────────
  const drawTHead = (y: number): number => {
    doc.setFillColor(...C.navy);
    doc.rect(ML, y, CW, TH_H, "F");
    // Top gold accent stripe
    doc.setFillColor(...C.gold);
    doc.rect(ML, y, CW, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    COLS.forEach((col, i) => {
      const tx = col.align === "center"
        ? COL_X[i] + col.w / 2
        : COL_X[i] + 2.5;
      doc.text(col.hdr, tx, y + 5.8, { align: col.align });
    });
    return y + TH_H;
  };

  // ── drawSep ──────────────────────────────────────────────────────────────────
  const drawSep = (y: number) => {
    doc.setDrawColor(...C.gray2);
    doc.setLineWidth(0.3);
    doc.line(ML, y, PW - MR, y);
  };

  // ── drawWatermark ────────────────────────────────────────────────────────────
  const drawWatermark = () => {
    try {
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.035 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(65);
      doc.setTextColor(10, 30, 100);
      doc.text("CONFIDENTIAL", PW / 2, PH / 2 + 20, { align: "center", angle: 45 });
      doc.restoreGraphicsState();
    } catch (_) { /* GState unsupported in this jsPDF build */ }
  };

  // ── drawRow ──────────────────────────────────────────────────────────────────
  const drawRow = (s: StudentRow, idx: number, y: number) => {
    const rs    = riskStyle(s.risk_level);
    const isAlt = idx % 2 === 1;

    if (isAlt) {
      doc.setFillColor(...C.gray1);
      doc.rect(ML, y, CW, ROW_H, "F");
    }

    // Left risk accent bar (3 mm wide)
    doc.setFillColor(...rs.fg);
    doc.rect(ML, y, 3, ROW_H, "F");

    // Data prep
    const stdName  = standards.find(st => st.id === (s as any).standard_id)?.name || "";
    const batchObj = allBatches.find(b => b.id === s.batch_id);
    const batchNm  = (s.batches as any)?.name || batchObj?.name || "—";
    const timing   = batchObj?.timing_start && batchObj?.timing_end
      ? batchObj.timing_start + "–" + batchObj.timing_end : "";
    const contact  = s.parent_contact || s.parent_contact2 || "—";
    const spi      = Number(s.spi) || 0;
    const spiClr: RGB = spi >= 75 ? C.green : spi >= 55 ? C.amber : C.red;
    const joinedDate = s.admission_date
      ? new Date(s.admission_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
      : "—";

    const L1 = y + 4.5;   // line 1 baseline (student name)
    const L2 = y + 9.2;   // line 2 baseline (parent name)

    // Col 0 — serial
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.gray5);
    doc.text(String(idx + 1), COL_X[0] + COLS[0].w / 2, L1 + 1, { align: "center" });

    // Col 1 — student name (L1 bold) + parent name (L2 muted)
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...C.dark);
    doc.text(trunc(s.name, COLS[1].w - 5), COL_X[1] + 2.5, L1);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...C.gray5);
    doc.text(trunc(safe(s.parent_name), COLS[1].w - 5), COL_X[1] + 2.5, L2);

    // Col 2 — class (L1 bold) + batch & timing (L2 muted)
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...C.dark);
    doc.text(trunc(stdName || batchNm, COLS[2].w - 4), COL_X[2] + 2.5, L1);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.gray5);
    const batchLine = stdName ? trunc(batchNm + (timing ? "  " + timing : ""), COLS[2].w - 4) : timing || "—";
    doc.text(batchLine, COL_X[2] + 2.5, L2);

    // Col 3 — contact
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.navyMd);
    doc.text(trunc(contact, COLS[3].w - 4), COL_X[3] + 2.5, L1 + 1);

    // Col 4 — SPI (coloured, bold, large)
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...spiClr);
    doc.text(spi > 0 ? String(spi) : "—", COL_X[4] + COLS[4].w / 2, L1 + 1.5, { align: "center" });

    // Col 5 — risk badge
    const bw = 16, bh = 6;
    const bx = COL_X[5] + (COLS[5].w - bw) / 2;
    const by = y + (ROW_H - bh) / 2;
    doc.setFillColor(...rs.bg);
    doc.roundedRect(bx, by, bw, bh, 1.5, 1.5, "F");
    doc.setDrawColor(...rs.fg); doc.setLineWidth(0.3);
    doc.roundedRect(bx, by, bw, bh, 1.5, 1.5, "S");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...rs.fg);
    doc.text(riskLabel(s.risk_level), COL_X[5] + COLS[5].w / 2, by + 4, { align: "center" });

    // Col 6 — joined date
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.gray6);
    doc.text(joinedDate, COL_X[6] + COLS[6].w / 2, L1 + 1, { align: "center" });

    // Row divider
    doc.setDrawColor(...C.gray2); doc.setLineWidth(0.18);
    doc.line(ML, y + ROW_H, ML + CW, y + ROW_H);
  };

  // ── drawFooter ───────────────────────────────────────────────────────────────
  const drawFooter = (pg: number) => {
    const fy = PH - FOOTER_H;
    doc.setDrawColor(...C.navy); doc.setLineWidth(0.6);
    doc.line(ML, fy, PW - MR, fy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.gray6);
    doc.text("ARK Learning Arena  ·  Confidential — For Authorised Internal Use Only", ML, fy + 5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...C.navy);
    doc.text("Page " + pg + " / " + tPages, PW - MR, fy + 5, { align: "right" });
  };

  // ── Render pages ─────────────────────────────────────────────────────────────
  // Page 1
  drawHeader(1);
  drawBand();
  drawSummary();
  drawSep(HEADER_H + BAND_H + SUMM_H + 2);
  drawWatermark();
  let tableY = drawTHead(CONTENT_START);
  students.slice(0, p1Cap).forEach((s, i) => { drawRow(s, i, tableY); tableY += ROW_H; });
  drawFooter(1);

  // Continuation pages
  let rendered = p1Cap;
  for (let p = 2; p <= tPages; p++) {
    doc.addPage();
    drawHeader(p);
    drawBand();
    drawWatermark();
    drawSep(HEADER_H + BAND_H + 2);
    let py = drawTHead(HEADER_H + BAND_H + 4);
    const slice = students.slice(rendered, rendered + pNCap);
    slice.forEach((s, i) => { drawRow(s, rendered + i, py); py += ROW_H; });
    rendered += slice.length;
    drawFooter(p);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  const slug    = filterLabel().replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_").slice(0, 40);
  const dateFmt = now.toISOString().split("T")[0];
  doc.save("ARK_StudentList_" + slug + "_" + dateFmt + ".pdf");
};

// ─── Main Component ───────────────────────────────────────────────────────────
const StudentControl: React.FC = () => {
  const { user } = useAuth();
  const { refreshData } = useAppData();

  // Lookup data
  const [standards, setStandards] = useState<Standard[]>([]);
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  // Student list
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<StudentRow | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  // Form state
  const emptyForm = {
    name: "", standard_id: "", batch_id: "", course_type_id: "", fee_structure_id: "",
    parent_name: "", parent_contact: "", parent_contact2: "", parent_email: "",
    date_of_birth: "", admission_date: new Date().toISOString().split("T")[0],
    spi: "0", risk_level: "safe",
  };
  const [form, setForm] = useState(emptyForm);

  // UI
  const [filterStandard, setFilterStandard] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [showBatchOverview, setShowBatchOverview] = useState(false);

  // Derived: batches filtered by selected standard
  const filteredBatches = form.standard_id
    ? allBatches.filter(b => b.standard_id === form.standard_id)
    : allBatches;

  // Derived: fee structures filtered by selected standard
  const filteredFeeStructures = form.standard_id
    ? feeStructures.filter(f => !f.standard_id || f.standard_id === form.standard_id)
    : feeStructures;

  const load = async () => {
    setLoading(true);
    const [{ data: std }, { data: bat }, { data: ct }, { data: fs }, { data: stud, error: studErr }] = await Promise.all([
      supabase.from("standards").select("id, name").order("display_order"),
      // select("*") — works even if standard_id column not yet in DB
      (supabase as any).from("batches").select("*").order("name"),
      supabase.from("course_types").select("id, name").order("name"),
      // select("*") — works even if payment schedule columns not yet in DB
      (supabase as any).from("fee_structures").select("*").eq("is_active", true),
      // Only join batches(name) (existing FK). Avoid standards/course_types joins
      // which require NEW FK columns — those fail before the SQL migration runs.
      supabase.from("students")
        .select("*, batches(name)")
        .eq("is_active", true)
        .order("name"),
    ]);
    if (studErr) toast.error("Failed to load students: " + studErr.message);
    setStandards(std || []);
    setAllBatches((bat || []) as Batch[]);
    setCourseTypes(ct || []);
    setFeeStructures((fs || []) as FeeStructure[]);
    setStudents((stud || []) as StudentRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Reset batch/fee structure when standard changes
  useEffect(() => {
    if (form.standard_id) {
      setForm(prev => ({ ...prev, batch_id: "", fee_structure_id: "" }));
    }
  }, [form.standard_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, standard_id: standards[0]?.id || "" });
    setDialogOpen(true);
  };

  const openEdit = (s: StudentRow) => {
    setEditingId(s.id);
    setForm({
      name: s.name, standard_id: s.standard_id || "",
      batch_id: s.batch_id || "", course_type_id: s.course_type_id || "",
      fee_structure_id: s.fee_structure_id || "",
      parent_name: s.parent_name || "", parent_contact: s.parent_contact || "",
      parent_contact2: s.parent_contact2 || "", parent_email: s.parent_email || "",
      date_of_birth: s.date_of_birth || "", admission_date: s.admission_date || new Date().toISOString().split("T")[0],
      spi: s.spi?.toString() || "0",
      risk_level: s.risk_level === "high_risk" ? "critical" : s.risk_level || "safe",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Student name is required");
    if (!form.parent_name.trim()) return toast.error("Parent name is required");
    if (!form.parent_contact.trim() && !form.parent_contact2.trim()) return toast.error("At least one parent contact is required");

    setSaving(true);
    try {
      const dbRisk = form.risk_level === "critical" ? "high_risk" : form.risk_level;
      const payload: any = {
        name: form.name.trim(),
        standard_id: form.standard_id || null,
        batch_id: form.batch_id || null,
        course_type_id: form.course_type_id || null,
        fee_structure_id: form.fee_structure_id || null,
        parent_name: form.parent_name || null,
        parent_contact: form.parent_contact || null,
        parent_contact2: form.parent_contact2 || null,
        parent_email: form.parent_email || null,
        date_of_birth: form.date_of_birth || null,
        admission_date: form.admission_date || null,
        spi: parseFloat(form.spi) || 0,
        risk_level: dbRisk,
        is_active: true,
      };

      if (editingId) {
        // Update existing student — use (as any) since new columns may not exist yet
        let { error } = await (supabase as any).from("students").update(payload).eq("id", editingId);
        if (error?.message?.includes("does not exist") || error?.message?.includes("schema cache")) {
          // Migration not yet run — retry with only base columns
          const { standard_id, course_type_id, fee_structure_id, parent_contact2, ...basePayload } = payload;
          const res = await supabase.from("students").update(basePayload).eq("id", editingId);
          error = res.error;
        }
        if (error) {
          if (error.message.includes("row-level security")) return toast.error("Permission denied — contact admin");
          return toast.error("Failed to update: " + error.message);
        }

        // Update student_fees record if fee structure changed
        if (form.fee_structure_id) {
          const selectedFee = feeStructures.find(f => f.id === form.fee_structure_id);
          const selectedBatch = allBatches.find(b => b.id === form.batch_id);
          if (selectedFee) {
            await supabase.from("student_fees").update({
              fee_structure_id: form.fee_structure_id,
              total_amount: selectedFee.total_amount || 0,
              seat_confirmation_amount: selectedFee.seat_confirmation_amount || 0,
              first_payment_amount: selectedFee.first_payment_amount || 0,
              installment_count: selectedFee.installment_count || 2,
              batch_name: selectedBatch?.name || "",
            }).eq("student_id", editingId);
          }
        }

        toast.success("Student updated");
      } else {
        // Insert new student — use (as any) since new columns may not exist yet
        let { data, error } = await (supabase as any).from("students").insert(payload).select().single();
        if (error?.message?.includes("does not exist") || error?.message?.includes("schema cache")) {
          // Migration not yet run — retry with only base columns
          const { standard_id, course_type_id, fee_structure_id, parent_contact2, ...basePayload } = payload;
          const res = await (supabase as any).from("students").insert(basePayload).select().single();
          data = res.data;
          error = res.error;
        }
        if (error) {
          if (error.message.includes("row-level security")) return toast.error("Permission denied — contact admin");
          return toast.error("Failed to add student: " + error.message);
        }

        // Auto-create student_fees record
        if (data && form.fee_structure_id) {
          const selectedFee = feeStructures.find(f => f.id === form.fee_structure_id);
          const selectedBatch = allBatches.find(b => b.id === form.batch_id);
          if (selectedFee) {
            const totalAmt = selectedFee.total_amount || 0;
            const { error: feeErr } = await supabase.from("student_fees").insert({
              student_id: data.id,
              fee_structure_id: form.fee_structure_id,
              student_name: form.name.trim(),
              batch_name: selectedBatch?.name || "",
              total_amount: totalAmt,
              seat_confirmation_amount: selectedFee.seat_confirmation_amount || 0,
              first_payment_amount: selectedFee.first_payment_amount || 0,
              installment_count: selectedFee.installment_count || 2,
              discount_amount: 0,
              amount_received: 0,
              amount_pending: totalAmt,
              status: "pending",
              created_by: user?.profileId || null,
            });
            if (feeErr) {
              // Silently skip if student_fees table doesn't exist yet (run SQL migration to enable)
              if (!feeErr.message?.includes("does not exist") && !feeErr.message?.includes("schema cache")) {
                console.error("Fee record error:", feeErr);
                toast.warning("Student saved but fee record failed: " + feeErr.message);
              }
            }
          }
        } else if (data) {
          toast.warning("Student added without a fee structure — assign one later in Fee Management");
        }

        toast.success("Student added successfully");
      }

      setDialogOpen(false);
      await load();
      refreshData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (s: StudentRow) => {
    const { error } = await supabase.from("students").update({ is_active: false, deactivation_reason: "Deactivated by admin" }).eq("id", s.id);
    if (error) return toast.error("Failed to deactivate: " + error.message);
    toast.success(`${s.name} deactivated`);
    setDeactivateTarget(null);
    await load();
    refreshData();
  };

  // Filtered list
  const filtered = students.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchStd = filterStandard === "all" || s.standard_id === filterStandard;
    const matchRisk = filterRisk === "all" || (filterRisk === "critical" ? s.risk_level === "high_risk" : s.risk_level === filterRisk);
    return matchSearch && matchStd && matchRisk;
  });

  const handleDownloadPDF = async () => {
    if (filtered.length === 0) {
      toast.error("No students to export — adjust your filters");
      return;
    }
    setDownloadingPDF(true);
    try {
      const logoData = await preloadLogo();
      generateStudentListPDF(filtered, standards, allBatches, courseTypes, filterStandard, filterRisk, search, logoData);
      toast.success(`PDF exported — ${filtered.length} student${filtered.length !== 1 ? "s" : ""} included`);
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message);
    } finally {
      setDownloadingPDF(false);
    }
  };

  // Selected fee structure preview
  const selectedFeePreview = feeStructures.find(f => f.id === form.fee_structure_id);
  const previewInstallment = selectedFeePreview
    ? (() => {
        const total = selectedFeePreview.total_amount || 0;
        const seat = selectedFeePreview.seat_confirmation_amount || 0;
        const first = selectedFeePreview.first_payment_amount || 0;
        const count = selectedFeePreview.installment_count || 2;
        const remaining = total - seat - first;
        return { total, seat, first, remaining, perInst: count > 0 ? Math.round(remaining / count) : 0, count };
      })()
    : null;

  // Batch overview
  const batchCounts = allBatches.map(b => ({
    ...b,
    enrolled: students.filter(s => s.batch_id === b.id).length,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Student Control</h1>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Student</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="metric-card border-red-300/30">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Critical</span>
          <p className="text-3xl font-display font-bold text-red-600">{students.filter(s => s.risk_level === "high_risk").length}</p>
        </div>
        <div className="metric-card border-yellow-300/30">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Watch</span>
          <p className="text-3xl font-display font-bold text-yellow-600">{students.filter(s => s.risk_level === "watch").length}</p>
        </div>
        <div className="metric-card border-green-300/30">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Active</span>
          <p className="text-3xl font-display font-bold text-green-600">{students.length}</p>
        </div>
      </div>

      {/* Batch overview */}
      <div className="glass-card p-4">
        <button onClick={() => setShowBatchOverview(v => !v)} className="flex items-center justify-between w-full text-left">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" /> Batch Seat Overview
          </h2>
          {showBatchOverview ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showBatchOverview && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-in fade-in duration-200">
            {batchCounts.map(b => (
              <div key={b.id} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="font-medium text-sm text-foreground">{b.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {b.timing_start && b.timing_end ? `${b.timing_start} – ${b.timing_end}` : "No timing"}
                </p>
                <p className="text-lg font-bold text-accent mt-1">{b.enrolled} <span className="text-xs font-normal text-muted-foreground">students</span></p>
              </div>
            ))}
            {batchCounts.length === 0 && <p className="col-span-4 text-sm text-muted-foreground text-center py-4">No batches found. Add batches in Setup → Class/Batch.</p>}
          </div>
        )}
      </div>

      {/* Filters + Download */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-background/50" />
        </div>
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select value={filterStandard} onChange={e => setFilterStandard(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground">
          <option value="all">All Classes</option>
          {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground">
          <option value="all">All Risk</option>
          <option value="high_risk">Critical</option>
          <option value="watch">Watch</option>
          <option value="safe">Safe</option>
        </select>

        {/* Download PDF Button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2 ml-auto border-accent/40 text-accent hover:bg-accent/10"
          onClick={handleDownloadPDF}
          disabled={downloadingPDF || filtered.length === 0 || loading}
          title={filtered.length === 0 ? "No students match the filter" : `Download ${filtered.length} student${filtered.length !== 1 ? "s" : ""} as PDF`}
        >
          <Download className="w-3.5 h-3.5" />
          {downloadingPDF ? "Generating…" : `Download PDF (${filtered.length})`}
        </Button>
      </div>

      {/* Student Table */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-accent" /> Student List ({filtered.length})
        </h2>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 text-muted-foreground font-medium">Student</th>
                  <th className="pb-3 text-muted-foreground font-medium">Class</th>
                  <th className="pb-3 text-muted-foreground font-medium">Batch</th>
                  <th className="pb-3 text-muted-foreground font-medium">Course Type</th>
                  <th className="pb-3 text-muted-foreground font-medium">SPI</th>
                  <th className="pb-3 text-muted-foreground font-medium">Risk</th>
                  <th className="pb-3 text-muted-foreground font-medium">Joined</th>
                  <th className="pb-3 text-muted-foreground font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="py-3">
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">{s.parent_name || "—"}</p>
                    </td>
                    <td className="py-3 text-muted-foreground text-xs">{standards.find(st => st.id === (s as any).standard_id)?.name || "—"}</td>
                    <td className="py-3 text-muted-foreground text-xs">{(s.batches as any)?.name || "—"}</td>
                    <td className="py-3 text-muted-foreground text-xs">{courseTypes.find(ct => ct.id === (s as any).course_type_id)?.name || "—"}</td>
                    <td className="py-3 font-bold text-sm">{s.spi ?? "—"}</td>
                    <td className="py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${riskColor(s.risk_level)}`}>{riskLabel(s.risk_level)}</span>
                    </td>
                    <td className="py-3 text-muted-foreground text-xs">{s.admission_date || "—"}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="w-3.5 h-3.5" /></Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeactivateTarget(s)}>
                          <Power className="w-3 h-3" /> Deactivate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No students match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={open => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This will mark the student as inactive. Their records will be preserved but they won't appear in active lists.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deactivateTarget && handleDeactivate(deactivateTarget)}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Student" : "Add New Student"}</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">

            {/* Academic Placement */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Academic Placement</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Class (Standard) *</label>
                  <select value={form.standard_id} onChange={e => setForm({ ...form, standard_id: e.target.value, batch_id: "", fee_structure_id: "" })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">-- Select Class --</option>
                    {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Class / Batch</label>
                  <select value={form.batch_id} onChange={e => setForm({ ...form, batch_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">-- Select Batch --</option>
                    {filteredBatches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}{b.timing_start ? ` (${b.timing_start}–${b.timing_end})` : ""}
                      </option>
                    ))}
                    {filteredBatches.length === 0 && form.standard_id && (
                      <option disabled>No batches linked to this class</option>
                    )}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Course Type</label>
                  <select value={form.course_type_id} onChange={e => setForm({ ...form, course_type_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">-- Select Course Type --</option>
                    {courseTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fee Structure</label>
                  <select value={form.fee_structure_id} onChange={e => setForm({ ...form, fee_structure_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="">-- Select Fee Structure --</option>
                    {filteredFeeStructures.map(f => <option key={f.id} value={f.id}>{f.name} (₹{f.total_amount?.toLocaleString()})</option>)}
                  </select>
                </div>
              </div>

              {/* Fee Preview */}
              {previewInstallment && (
                <div className="mt-3 bg-accent/5 border border-accent/20 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground"><span>Total Fee</span><span className="font-medium text-foreground">₹{previewInstallment.total.toLocaleString()}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Seat Confirmation</span><span>₹{previewInstallment.seat.toLocaleString()}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>First Payment</span><span>₹{previewInstallment.first.toLocaleString()}</span></div>
                  <div className="flex justify-between font-semibold text-foreground border-t border-border/40 pt-1">
                    <span>{previewInstallment.count} Installments of</span>
                    <span>≈ ₹{previewInstallment.perInst.toLocaleString()} each</span>
                  </div>
                </div>
              )}
            </div>

            {/* Student Info */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Student Details</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Student Name *</label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date of Birth</label>
                    <Input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date of Joining</label>
                    <Input type="date" value={form.admission_date} onChange={e => setForm({ ...form, admission_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">SPI (0–100)</label>
                    <Input type="number" value={form.spi} onChange={e => setForm({ ...form, spi: e.target.value })} placeholder="e.g. 75" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Risk Level</label>
                    <select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                      <option value="safe">Safe</option>
                      <option value="watch">Watch</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Parent Details */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Parent / Guardian Details</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Parent Name *</label>
                  <Input value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} placeholder="Parent / Guardian name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact 1 *</label>
                    <Input value={form.parent_contact} onChange={e => setForm({ ...form, parent_contact: e.target.value })} placeholder="+91 98765 43210" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact 2</label>
                    <Input value={form.parent_contact2} onChange={e => setForm({ ...form, parent_contact2: e.target.value })} placeholder="+91 98765 43211" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Parent Email</label>
                  <Input type="email" value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} placeholder="parent@gmail.com" />
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Student"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentControl;
