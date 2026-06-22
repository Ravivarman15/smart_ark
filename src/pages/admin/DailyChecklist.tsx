import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import {
  ClipboardCheck, Sun, BookOpen, Heart, Users, DollarSign, Calendar,
  MessageSquare, Moon, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Printer, RotateCcw, Clock, User, Pen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CheckItem {
  id: string;
  label: string;
  sub?: CheckItem[];
}

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  color: string;       // Tailwind border/text color variant
  items: CheckItem[];
}

// ── Checklist Data ─────────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    id: "start",
    icon: Sun,
    title: "Start-of-Day",
    color: "amber",
    items: [
      { id: "s1", label: "Checked previous day student attendance in all groups" },
      { id: "s2", label: "Checked transition / movement defaulters marked" },
      { id: "s3", label: "Follow-up completed for any missing updates" },
      { id: "s4", label: "Verified today's class schedule" },
      { id: "s5", label: "Verified teacher allocation for all batches" },
      { id: "s6", label: "Confirmed class details updated in all relevant groups" },
    ],
  },
  {
    id: "academic",
    icon: BookOpen,
    title: "Academic & Test Control",
    color: "blue",
    items: [
      { id: "a1", label: "Identified students with low scores in previous day tests" },
      {
        id: "a2", label: "Retest allocated with:", sub: [
          { id: "a2a", label: "Date & time" },
          { id: "a2b", label: "Assigned teacher" },
        ],
      },
      { id: "a3", label: "Retest supervision confirmed (no free flow)" },
      { id: "a4", label: "Instructed teachers to collect answer papers" },
      { id: "a5", label: "Confirmed correction timeline (within 24–28 hours)" },
      { id: "a6", label: "Verified marks checked & updated" },
      { id: "a7", label: "Test details (portion/date) communicated to teachers" },
      { id: "a8", label: "Test marks recorded and shared after evaluation" },
    ],
  },
  {
    id: "attendance",
    icon: Heart,
    title: "Student Attendance & Care",
    color: "rose",
    items: [
      { id: "c1", label: "Checked students on leave > 3 days" },
      { id: "c2", label: "Parents contacted and reason updated" },
      { id: "c3", label: "Verified students attending extra classes" },
      { id: "c4", label: "Teacher check-in confirmed till student departure" },
      {
        id: "c5", label: "Healthy Snacks Programme:", sub: [
          { id: "c5a", label: "Students fed within 15 mins of entry" },
          { id: "c5b", label: "Latecomers handled and responsibility assigned" },
        ],
      },
    ],
  },
  {
    id: "staff",
    icon: Users,
    title: "Staff Management",
    color: "purple",
    items: [
      { id: "st1", label: "Staff attendance updated for previous day" },
      {
        id: "st2", label: "Daily reminder message sent in group:", sub: [
          { id: "st2a", label: "Teacher ↔ Batch allocation" },
          { id: "st2b", label: "Class responsibilities" },
        ],
      },
    ],
  },
  {
    id: "fees",
    icon: DollarSign,
    title: "Fees & Admissions",
    color: "green",
    items: [
      { id: "f1", label: "Fees collection status reviewed" },
      { id: "f2", label: "Pending fee follow-ups done" },
      { id: "f3", label: "Progress aligned with 90% target by 7th" },
      {
        id: "f4", label: "Minimum 10 admission calls completed:", sub: [
          { id: "f4a", label: "Enquiries" },
          { id: "f4b", label: "Follow-ups" },
          { id: "f4c", label: "Conversions logged" },
        ],
      },
    ],
  },
  {
    id: "weekly",
    icon: Calendar,
    title: "Weekly / Planning Tracking",
    color: "cyan",
    items: [
      { id: "w1", label: "Weekly planner submissions tracked" },
      { id: "w2", label: "Worksheet distribution details updated" },
    ],
  },
  {
    id: "meetings",
    icon: MessageSquare,
    title: "Meetings & Reporting",
    color: "indigo",
    items: [
      { id: "m1", label: "Minutes of Meeting recorded (same day)" },
      { id: "m2", label: "Previous MoM action points reviewed" },
      { id: "m3", label: "Discussion held with Branch Incharge (if applicable)" },
    ],
  },
  {
    id: "eod",
    icon: Moon,
    title: "End-of-Day (Mandatory Before Leaving)",
    color: "slate",
    items: [
      { id: "e1", label: "All tasks cross-verified" },
      { id: "e2", label: "Daily work-done report submitted" },
      { id: "e3", label: "No pending student / staff issue left unresolved" },
    ],
  },
];

// Flatten all item IDs (including sub-items)
function flattenIds(sections: Section[]): string[] {
  const ids: string[] = [];
  for (const sec of sections) {
    for (const item of sec.items) {
      ids.push(item.id);
      if (item.sub) for (const s of item.sub) ids.push(s.id);
    }
  }
  return ids;
}
const ALL_IDS = flattenIds(SECTIONS);

// Color helpers — all mapped to brand tokens
const colorMap: Record<string, { border: string; bg: string; icon: string; badge: string; check: string }> = {
  amber:  { border: "border-accent/30",        bg: "bg-accent/5",          icon: "text-accent",           badge: "bg-accent/15 text-accent",          check: "bg-accent border-accent" },
  blue:   { border: "border-ark-success/30",   bg: "bg-ark-success/5",     icon: "text-ark-success",      badge: "bg-ark-success/15 text-ark-success", check: "bg-ark-success border-ark-success" },
  rose:   { border: "border-ark-danger/30",    bg: "bg-ark-danger/5",      icon: "text-ark-danger",       badge: "bg-ark-danger/15 text-ark-danger",   check: "bg-ark-danger border-ark-danger" },
  purple: { border: "border-border",           bg: "bg-muted/20",          icon: "text-muted-foreground", badge: "bg-muted/40 text-foreground",        check: "bg-foreground border-foreground" },
  green:  { border: "border-ark-success/30",   bg: "bg-ark-success/5",     icon: "text-ark-success",      badge: "bg-ark-success/15 text-ark-success", check: "bg-ark-success border-ark-success" },
  cyan:   { border: "border-accent/30",        bg: "bg-accent/5",          icon: "text-accent",           badge: "bg-accent/15 text-accent",          check: "bg-accent border-accent" },
  indigo: { border: "border-border",           bg: "bg-muted/20",          icon: "text-muted-foreground", badge: "bg-muted/40 text-foreground",        check: "bg-foreground border-foreground" },
  slate:  { border: "border-ark-warning/30",   bg: "bg-ark-warning/5",     icon: "text-ark-warning",      badge: "bg-ark-warning/15 text-ark-warning", check: "bg-ark-warning border-ark-warning" },
};

// ── Sub-item Checkbox ─────────────────────────────────────────────────────────
const SubItem: React.FC<{ item: CheckItem; checked: boolean; onChange: () => void; color: string }> = ({ item, checked, onChange, color }) => {
  const c = colorMap[color];
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-2 ml-6 py-1.5 px-2 rounded-lg w-full text-left transition-all hover:bg-muted/20 group"
    >
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? c.check : "border-muted-foreground/50 group-hover:border-muted-foreground"}`}>
        {checked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>}
      </div>
      <span className={`text-xs ${checked ? "line-through text-muted-foreground" : "text-muted-foreground"}`}>{item.label}</span>
    </button>
  );
};

// ── Main Item Checkbox ────────────────────────────────────────────────────────
const CheckRow: React.FC<{
  item: CheckItem; checked: boolean; onChange: () => void; color: string;
  checkedSub?: Record<string, boolean>; onChangeSub?: (id: string) => void;
}> = ({ item, checked, onChange, color, checkedSub, onChangeSub }) => {
  const c = colorMap[color];
  const allSubDone = item.sub ? item.sub.every(s => checkedSub?.[s.id]) : true;

  return (
    <div>
      <button
        onClick={onChange}
        className="flex items-center gap-3 py-2.5 px-3 rounded-lg w-full text-left transition-all hover:bg-muted/20 group"
      >
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? c.check : "border-muted-foreground/40 group-hover:border-muted-foreground"}`}>
          {checked && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>}
        </div>
        <span className={`text-sm flex-1 ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {item.label}
        </span>
        {item.sub && !allSubDone && <span className="text-[10px] text-muted-foreground">{item.sub.filter(s => checkedSub?.[s.id]).length}/{item.sub.length}</span>}
      </button>
      {item.sub && item.sub.map(sub => (
        <SubItem key={sub.id} item={sub} checked={!!checkedSub?.[sub.id]} onChange={() => onChangeSub?.(sub.id)} color={color} />
      ))}
    </div>
  );
};

// ── Section Card ──────────────────────────────────────────────────────────────
const SectionCard: React.FC<{
  section: Section;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
}> = ({ section, checked, onToggle }) => {
  const [open, setOpen] = useState(true);
  const c = colorMap[section.color];

  // Count all items including sub-items
  const allIds: string[] = [];
  for (const item of section.items) {
    allIds.push(item.id);
    if (item.sub) allIds.push(...item.sub.map(s => s.id));
  }
  const doneCount = allIds.filter(id => checked[id]).length;
  const totalCount = allIds.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const done = doneCount === totalCount;

  return (
    <div className={`glass-card border ${done ? "border-ark-success/30" : c.border} transition-all duration-300`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 w-full p-4 md:p-5 text-left"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.bg} border ${c.border}`}>
          <section.icon className={`w-4 h-4 ${done ? "text-ark-success" : c.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-semibold text-foreground text-sm">{section.title}</h2>
            {done && <CheckCircle2 className="w-4 h-4 text-ark-success" />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-32">
              <div
                className={`h-full rounded-full transition-all duration-500 ${done ? "bg-ark-success" : pct >= 50 ? "bg-accent" : "bg-ark-warning"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`text-xs font-medium ${done ? "text-ark-success" : "text-muted-foreground"}`}>
              {doneCount}/{totalCount}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${done ? "bg-ark-success/20 text-ark-success" : c.badge}`}>
            {pct}%
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 md:px-5 pb-4 space-y-0.5 border-t border-border/40 pt-3 animate-in fade-in slide-in-from-top-2 duration-150">
          {section.items.map(item => (
            <CheckRow
              key={item.id}
              item={item}
              checked={!!checked[item.id]}
              onChange={() => onToggle(item.id)}
              color={section.color}
              checkedSub={checked}
              onChangeSub={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const DailyChecklist: React.FC = () => {
  const { dailyChecklistState, toggleDailyChecklist, signOffDailyChecklist, resetDailyChecklist } = useAppData();
  const confirm = useConfirm();
  const { checked, signName, signTime, signedOff, date: dateKey } = dailyChecklistState;
  
  const today = new Date(dateKey).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const toggle = (id: string) => toggleDailyChecklist(id);

  const resetAll = async () => {
    if (
      !(await confirm({
        type: "warning",
        title: "Reset Checklist",
        description: "Reset all checklist items for today? This cannot be undone.",
        confirmText: "Reset",
      }))
    )
      return;
    resetDailyChecklist();
    toast.success("Checklist reset");
  };

  // Stats
  const totalItems = ALL_IDS.length;
  const doneItems = ALL_IDS.filter(id => checked[id]).length;
  const pct = Math.round((doneItems / totalItems) * 100);
  const allDone = doneItems === totalItems;

  // Section completion counts
  const sectionStats = SECTIONS.map(sec => {
    const allIds: string[] = [];
    for (const item of sec.items) {
      allIds.push(item.id);
      if (item.sub) allIds.push(...item.sub.map(s => s.id));
    }
    const done = allIds.filter(id => checked[id]).length;
    return { done, total: allIds.length };
  });
  const sectionsComplete = sectionStats.filter(s => s.done === s.total).length;

  const handleSignOff = () => {
    const rawSignName = (document.getElementById("sign-name") as HTMLInputElement)?.value;
    if (!rawSignName?.trim()) return toast.error("Enter your name to sign off");
    if (!allDone) return toast.error("Complete all checklist items before signing off");
    const t = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    signOffDailyChecklist(rawSignName.trim(), t);
    toast.success(`Day signed off by ${rawSignName.trim()} at ${t}`);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-accent" /> Daily Admin Checklist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{today}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={resetAll}>
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => window.print()}>
            <Printer className="w-3 h-3" /> Print
          </Button>
        </div>
      </div>

      {/* Overall Progress */}
      <div className={`glass-card p-4 md:p-5 border transition-all ${allDone ? "border-ark-success/50" : "border-accent/30"}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-foreground">Overall Progress</p>
            <p className="text-xs text-muted-foreground">{sectionsComplete}/{SECTIONS.length} sections complete</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-display font-bold ${allDone ? "text-ark-success" : "text-accent"}`}>{pct}%</p>
            <p className="text-xs text-muted-foreground">{doneItems}/{totalItems} items</p>
          </div>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${allDone ? "bg-ark-success" : pct >= 70 ? "bg-accent" : pct >= 40 ? "bg-ark-warning" : "bg-ark-danger"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Section pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {SECTIONS.map((sec, i) => {
            const { done, total } = sectionStats[i];
            const c = colorMap[sec.color];
            const secDone = done === total;
            return (
              <span key={sec.id} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${secDone ? "bg-ark-success/15 text-ark-success border-ark-success/30" : c.badge + " " + c.border}`}>
                {secDone ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                {sec.title.split(" ")[0]}
              </span>
            );
          })}
        </div>
      </div>

      {/* Checklist Sections */}
      {SECTIONS.map(sec => (
        <SectionCard key={sec.id} section={sec} checked={checked} onToggle={toggle} />
      ))}

      {/* Admin Sign-Off */}
      <div className={`glass-card p-4 md:p-5 border transition-all ${signedOff ? "border-ark-success/50" : "border-border"}`}>
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Pen className="w-4 h-4 text-accent" /> Admin Sign-Off
        </h2>

        {signedOff ? (
          <div className="p-4 rounded-lg bg-ark-success/10 border border-ark-success/30 text-center animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="w-8 h-8 text-ark-success mx-auto mb-2" />
            <p className="font-semibold text-ark-success">Day Successfully Closed</p>
            <p className="text-sm text-muted-foreground mt-1">Signed off by <strong>{signName}</strong> at {signTime}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{dateKey}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1"><User className="w-3 h-3" /> Name</label>
                <Input
                  id="sign-name"
                  defaultValue={signName}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Date</label>
                <Input value={dateKey} readOnly className="text-muted-foreground" />
              </div>
            </div>

            {!allDone && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-ark-danger/10 border border-ark-danger/30">
                <AlertCircle className="w-4 h-4 text-ark-danger flex-shrink-0 mt-0.5" />
                <p className="text-xs text-ark-danger">
                  <strong>{totalItems - doneItems} items</strong> remain incomplete. Complete all sections before signing off.
                </p>
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={handleSignOff}
              disabled={!allDone}
              variant={allDone ? "default" : "outline"}
            >
              <CheckCircle2 className="w-4 h-4" />
              {allDone ? "Sign Off & Close Day" : `Complete all items to sign off (${doneItems}/${totalItems})`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyChecklist;
