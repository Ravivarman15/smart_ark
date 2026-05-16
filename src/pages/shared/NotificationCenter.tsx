import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare, Bell, Calendar, RotateCcw, ShieldAlert,
  Users, Send, Plus, X, Phone, User, Loader2, CheckCircle2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalisePhone, CAMPAIGNS } from "@/lib/aisensyApi";

// ── Auto-SMS config (left column) ─────────────────────────────────────────────
const notificationTypes = [
  { id: "welcome",      label: "Inquiry Welcome SMS to Student",  icon: Users,       defaultMessage: "Welcome to ARK Academy! Your registration has been completed successfully." },
  { id: "birthday",     label: "Birthday Wish SMS",               icon: Calendar,    defaultMessage: "Dear Student, ARK Academy wishes you a very Happy Birthday! Have a great year ahead!" },
  { id: "attendance",   label: "Student Attendance SMS",          icon: ShieldAlert, defaultMessage: "Dear Parent, your ward was marked absent today at ARK Academy." },
  { id: "fee-reminder", label: "Fee Reminder SMS",                icon: Bell,        defaultMessage: "Dear Parent, a gentle reminder that your fee installment of ₹X is due today." },
  { id: "fee-received", label: "Fee Received Intimation",         icon: MessageSquare, defaultMessage: "We have received your fee payment of ₹X. Thank you!" },
  { id: "exam-alert",   label: "Exam Alert SMS",                  icon: RotateCcw,   defaultMessage: "Reminder: The term exams start next week. Best of luck!" }
];

// ── Types ──────────────────────────────────────────────────────────────────────
interface RecipientEntry {
  phone: string;
  name:  string;
  group: "parents" | "staff" | "custom";
}

// ── Main Component ─────────────────────────────────────────────────────────────
const NotificationCenter: React.FC = () => {

  // Auto-SMS settings state
  const [enabledNotifications, setEnabledNotifications] = useState<Record<string, boolean>>({
    welcome: true, birthday: false, attendance: true,
    "fee-reminder": true, "fee-received": true, "exam-alert": false,
  });
  const [recipients, setRecipients] = useState<Record<string, { student: boolean; father: boolean; mother: boolean }>>({
    welcome:      { student: true,  father: false, mother: false },
    birthday:     { student: true,  father: false, mother: false },
    attendance:   { student: false, father: true,  mother: true  },
    "fee-reminder":{ student: false, father: true,  mother: false },
    "fee-received":{ student: false, father: true,  mother: false },
    "exam-alert": { student: true,  father: true,  mother: false },
  });

  // Broadcast state
  const [broadcastMsg, setBroadcastMsg]     = useState("");
  const [selectParents, setSelectParents]   = useState(false);
  const [selectStaff, setSelectStaff]       = useState(false);
  const [customInput, setCustomInput]       = useState("");
  const [customNumbers, setCustomNumbers]   = useState<{ phone: string; label: string }[]>([]);
  const [dbRecipients, setDbRecipients]     = useState<RecipientEntry[]>([]);
  const [loadingDb, setLoadingDb]           = useState(false);
  const [sending, setSending]               = useState(false);
  const [sendProgress, setSendProgress]     = useState<{ done: number; total: number } | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch parents + staff from DB whenever those toggles are switched on ─────
  useEffect(() => {
    if (!selectParents && !selectStaff) return;
    (async () => {
      setLoadingDb(true);
      const entries: RecipientEntry[] = [];

      if (selectParents) {
        const { data } = await supabase
          .from("students")
          .select("name, parent_contact, parent_contact_1, parent_contact_2, parent_name")
          .eq("is_active", true);

        for (const s of data || []) {
          const label = s.parent_name || `Parent of ${s.name}`;
          const phones = [s.parent_contact, s.parent_contact_1, s.parent_contact_2]
            .filter(Boolean) as string[];
          // deduplicate within this student
          const seen = new Set<string>();
          for (const ph of phones) {
            const norm = normalisePhone(ph);
            if (!seen.has(norm)) { seen.add(norm); entries.push({ phone: norm, name: label, group: "parents" }); }
          }
        }
      }

      if (selectStaff) {
        const { data } = await supabase
          .from("profiles")
          .select("name, phone, role")
          .eq("is_active", true)
          .not("phone", "is", null);

        for (const p of data || []) {
          if (p.phone) entries.push({ phone: normalisePhone(p.phone), name: p.name, group: "staff" });
        }
      }

      setDbRecipients(entries);
      setLoadingDb(false);
    })();
  }, [selectParents, selectStaff]);

  // Clear DB recipients for deselected groups
  useEffect(() => {
    setDbRecipients(prev => prev.filter(r =>
      (r.group === "parents" && selectParents) ||
      (r.group === "staff"   && selectStaff)
    ));
  }, [selectParents, selectStaff]);

  // ── Compute final unique list ─────────────────────────────────────────────────
  const allRecipients: RecipientEntry[] = (() => {
    const seen = new Set<string>();
    const out: RecipientEntry[] = [];
    const push = (r: RecipientEntry) => {
      if (!seen.has(r.phone)) { seen.add(r.phone); out.push(r); }
    };
    dbRecipients.forEach(push);
    customNumbers.forEach(n => push({ phone: normalisePhone(n.phone), name: n.label, group: "custom" }));
    return out;
  })();

  // ── Add custom number ────────────────────────────────────────────────────────
  const addCustomNumber = () => {
    const raw = customInput.trim();
    if (!raw) return;
    // Accept comma/newline separated list
    const parts = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const added: { phone: string; label: string }[] = [];
    for (const part of parts) {
      const digits = part.replace(/[^0-9]/g, "");
      if (digits.length < 10) { toast.error(`Invalid number: ${part}`); continue; }
      if (customNumbers.some(n => n.phone === part)) continue;
      added.push({ phone: part, label: `+${digits.length === 10 ? "91" : ""}${digits}` });
    }
    if (added.length) {
      setCustomNumbers(prev => [...prev, ...added]);
      setCustomInput("");
      customInputRef.current?.focus();
    }
  };

  const removeCustom = (phone: string) =>
    setCustomNumbers(prev => prev.filter(n => n.phone !== phone));

  // ── Send broadcast ────────────────────────────────────────────────────────────
  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return toast.error("Please enter a message");
    if (allRecipients.length === 0) return toast.error("Select at least one recipient group or add a number");

    setSending(true);
    setSendProgress({ done: 0, total: allRecipients.length });

    let successCount = 0;
    const failedNames: string[] = [];
    let lastError = "";

    for (let i = 0; i < allRecipients.length; i++) {
      const r = allRecipients[i];
      try {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            campaignName:   CAMPAIGNS.BROADCAST,
            destination:    r.phone,
            recipientName:  r.name,
            templateParams: [broadcastMsg],
          },
        });
        if (error) {
          lastError = error.message || "Edge function error";
          failedNames.push(r.name);
        } else if (!data?.success) {
          lastError = data?.message || "Unknown AiSensy error";
          failedNames.push(r.name);
        } else {
          successCount++;
        }
      } catch (e: unknown) {
        lastError = (e as Error)?.message || "Network error";
        failedNames.push(r.name);
      }
      setSendProgress({ done: i + 1, total: allRecipients.length });
    }

    setSending(false);
    setSendProgress(null);

    const failCount = allRecipients.length - successCount;
    if (failCount === 0) {
      toast.success(`Broadcast sent to ${successCount} recipient${successCount !== 1 ? "s" : ""}!`);
    } else if (successCount === 0) {
      toast.error(`Send failed for all ${failCount} recipients. Last error: ${lastError}`, { duration: 8000 });
    } else {
      toast.warning(`${successCount} sent, ${failCount} failed (${failedNames.slice(0, 3).join(", ")}${failedNames.length > 3 ? "..." : ""}).`);
    }

    if (successCount > 0) setBroadcastMsg("");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Notification Center</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Auto-SMS settings ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card mb-4">
            <div className="p-4 bg-ark-warning/10 border-b border-border/50 rounded-t-xl text-sm text-ark-warning font-medium">
              NOTE: Toggle auto-SMS ON and the system will send messages automatically to students or parents.
            </div>
            <div className="divide-y divide-border/50">
              {notificationTypes.map((type) => (
                <div key={type.id} className={`p-5 transition-colors ${enabledNotifications[type.id] ? "bg-card" : "bg-muted/10 opacity-70"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <type.icon className="w-5 h-5 text-accent" />
                      <span className="font-semibold">{type.label}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs font-bold uppercase tracking-wider ${enabledNotifications[type.id] ? "text-ark-success" : "text-muted-foreground"}`}>
                        {enabledNotifications[type.id] ? "Active" : "Muted"}
                      </span>
                      <Switch checked={enabledNotifications[type.id]} onCheckedChange={() => setEnabledNotifications(p => ({ ...p, [type.id]: !p[type.id] }))} />
                    </div>
                  </div>
                  {enabledNotifications[type.id] && (
                    <div className="ml-8 mt-2 space-y-3">
                      <div className="bg-muted/50 p-3 rounded text-sm text-muted-foreground italic border-l-2 border-accent">
                        SMS Format: {type.defaultMessage}
                      </div>
                      <div className="flex items-center gap-4 text-sm mt-2 justify-end">
                        {(["student","father","mother"] as const).map(role => (
                          <label key={role} className="flex items-center gap-1.5 cursor-pointer capitalize">
                            <input type="checkbox"
                              checked={recipients[type.id][role]}
                              onChange={() => setRecipients(p => ({ ...p, [type.id]: { ...p[type.id], [role]: !p[type.id][role] } }))}
                              className="accent-accent"
                            /> To {role.charAt(0).toUpperCase() + role.slice(1)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Broadcast ───────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Broadcast card */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Send className="w-5 h-5 text-accent" /> Broadcast Message
            </h3>

            {/* ── Who to send to ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Send To</p>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/20 transition-colors">
                <input type="checkbox" checked={selectParents} onChange={e => setSelectParents(e.target.checked)} className="accent-accent w-4 h-4" />
                <Users className="w-4 h-4 text-accent" />
                <div className="flex-1">
                  <p className="text-sm font-medium">All Parents</p>
                  <p className="text-xs text-muted-foreground">Parent contact numbers from student records</p>
                </div>
                {loadingDb && selectParents && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                {!loadingDb && selectParents && (
                  <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                    {dbRecipients.filter(r => r.group === "parents").length}
                  </span>
                )}
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/20 transition-colors">
                <input type="checkbox" checked={selectStaff} onChange={e => setSelectStaff(e.target.checked)} className="accent-accent w-4 h-4" />
                <User className="w-4 h-4 text-accent" />
                <div className="flex-1">
                  <p className="text-sm font-medium">All Staff</p>
                  <p className="text-xs text-muted-foreground">Teachers, admins and coordinators</p>
                </div>
                {loadingDb && selectStaff && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                {!loadingDb && selectStaff && (
                  <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                    {dbRecipients.filter(r => r.group === "staff").length}
                  </span>
                )}
              </label>
            </div>

            {/* ── Custom numbers ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Numbers</p>
              <div className="flex gap-2">
                <input
                  ref={customInputRef}
                  type="text"
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomNumber()}
                  placeholder="+91XXXXXXXXXX or multiple separated by comma"
                  className="flex-1 h-9 px-3 rounded-lg border border-border/60 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <Button size="sm" variant="outline" onClick={addCustomNumber} className="shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Number chips */}
              {customNumbers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {customNumbers.map((n) => (
                    <span key={n.phone} className="flex items-center gap-1 text-xs bg-muted/60 border border-border/50 rounded-full px-2.5 py-1">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      {n.label}
                      <button onClick={() => removeCustom(n.phone)} className="ml-0.5 text-muted-foreground hover:text-ark-danger transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Recipient count preview ── */}
            {allRecipients.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20 text-sm">
                <CheckCircle2 className="w-4 h-4 text-accent" />
                <span className="text-foreground font-medium">{allRecipients.length} unique recipient{allRecipients.length !== 1 ? "s" : ""}</span>
                <span className="text-muted-foreground text-xs ml-auto">
                  {[
                    selectParents && `${dbRecipients.filter(r => r.group === "parents").length} parents`,
                    selectStaff   && `${dbRecipients.filter(r => r.group === "staff").length} staff`,
                    customNumbers.length > 0 && `${customNumbers.length} custom`,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}

            {/* ── Message ── */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</p>
              <Textarea
                className="text-sm resize-none h-28"
                placeholder="Type your message here…"
                value={broadcastMsg}
                onChange={e => setBroadcastMsg(e.target.value)}
                maxLength={1000}
              />
              <p className="text-right text-xs text-muted-foreground">{broadcastMsg.length}/1000</p>
            </div>

            {/* ── Send button ── */}
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleBroadcast}
              disabled={sending || allRecipients.length === 0 || !broadcastMsg.trim()}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {sendProgress ? `Sending ${sendProgress.done}/${sendProgress.total}…` : "Sending…"}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send to {allRecipients.length > 0 ? `${allRecipients.length} recipient${allRecipients.length !== 1 ? "s" : ""}` : "recipients"}
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Sends via WhatsApp using AiSensy campaign{" "}
              <code className="bg-muted/60 px-1 rounded text-[10px]">ark_broadcast_alert</code>
            </p>
          </div>

          {/* Capabilities */}
          <div className="glass-card p-5 bg-muted/20">
            <h3 className="font-semibold mb-3">Notification Capabilities</h3>
            <ul className="text-sm space-y-2 text-muted-foreground">
              {[
                "Auto/Manual SMS & WhatsApp",
                "Mobile Push Notifications",
                "Birthday & Welcome Alerts",
                "Fees & Exam Reminders",
                "Targeted Custom Broadcasts",
              ].map(cap => (
                <li key={cap} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-ark-success shrink-0" /> {cap}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const CheckCircle2 = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
  </svg>
);

export default NotificationCenter;
