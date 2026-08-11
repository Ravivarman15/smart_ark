import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Phone, Plus, UserPlus, Users, AlertCircle, FileText, CheckCircle2, Link2, ExternalLink, Filter, Bell, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface Enquiry {
  id: string;
  prospect_name: string | null;
  phone: string | null;
  date: string | null;
  status: string | null;
  notes: string | null;
  is_walkin: boolean | null;
  priority: string | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  interested_standard: string | null;
  interested_course: string | null;
  // ── Origin marker. Rows sourced from the new `leads` table are read-only
  // here (they own their own pipeline at /<role>/leads) so their mutate
  // buttons are swapped for a "View in Leads" link. `_source` carries the
  // raw lead source so the type filter can treat landing/meta as web-form.
  _origin?: "enquiry" | "lead";
  _source?: string | null;
}

interface Staff {
  id: string;
  name: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  interested:     { label: "Interested",      color: "bg-blue-100 text-blue-700 border-blue-200" },
  follow_up:      { label: "Follow-up",       color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  converted:      { label: "Converted",       color: "bg-green-100 text-green-700 border-green-200" },
  not_interested: { label: "Not Interested",  color: "bg-red-100 text-red-700 border-red-200" },
  // ── Lead pipeline statuses (from the new `leads` table) ──────────────────
  new:            { label: "New",             color: "bg-blue-100 text-blue-700 border-blue-200" },
  contacted:      { label: "Contacted",       color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  followup:       { label: "Follow-up",       color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  demo_scheduled: { label: "Demo Scheduled",  color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  demo_attended:  { label: "Demo Attended",   color: "bg-purple-100 text-purple-700 border-purple-200" },
  admission:      { label: "Admission",       color: "bg-green-100 text-green-700 border-green-200" },
  closed:         { label: "Closed",          color: "bg-gray-100 text-gray-600 border-gray-200" },
};

// Statuses that count as "won" / "dead" regardless of origin (enquiry vs lead).
const CONVERTED_STATUSES = new Set(["converted", "admission"]);
const DEAD_STATUSES      = new Set(["not_interested", "closed"]);
const isConverted = (s?: string | null) => CONVERTED_STATUSES.has(s || "");
const isClosed    = (s?: string | null) => CONVERTED_STATUSES.has(s || "") || DEAD_STATUSES.has(s || "");

const PRIORITY_MAP: Record<string, string> = {
  high:   "bg-red-100 text-red-600",
  medium: "bg-yellow-100 text-yellow-600",
  low:    "bg-green-100 text-green-600",
};

const EnquiryManagement: React.FC = () => {
  // This organization's own enquiry URL. The slug comes from the caller's own
  // organizations row, which RLS scopes to their tenant — so these buttons
  // cannot hand out another institution's link.
  const [applyUrl, setApplyUrl] = useState("");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("organizations" as never).select("slug").limit(1).maybeSingle();
      const slug = (data as { slug?: string } | null)?.slug;
      if (alive && slug) setApplyUrl(`${window.location.origin}/leads/apply/${slug}`);
    })();
    return () => { alive = false; };
  }, []);
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | "walk-in" | "call" | "web-form">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "converted">("active");

  // New enquiry form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", notes: "", type: "call",
    priority: "medium", interested_standard: "", interested_course: "",
  });
  const [saving, setSaving] = useState(false);

  // Follow-up dialog
  const [followTarget, setFollowTarget] = useState<Enquiry | null>(null);
  const [noteText, setNoteText] = useState("");
  const [followDate, setFollowDate] = useState("");
  const [newStatus, setNewStatus] = useState("follow_up");
  const [savingNote, setSavingNote] = useState(false);

  // Assign dialog
  const [assignTarget, setAssignTarget] = useState<Enquiry | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const load = useCallback(async () => {
    setLoading(true);
    // Pull the legacy enquiries (admission_calls), the new automated leads, and
    // staff in parallel. The `leads` table may not exist yet (migration pending)
    // — its query is wrapped so a missing table degrades to "no leads" instead
    // of breaking the whole page.
    const [{ data: eq }, leadsRes, { data: sp }] = await Promise.all([
      // select("*") is safe before and after migration (returns only existing columns)
      (supabase as any).from("admission_calls")
        .select("*")
        .order("created_at", { ascending: false }),
      (supabase as any).from("leads")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .then((r: any) => r, () => ({ data: null, error: true })),
      supabase.from("profiles").select("id, name").eq("is_active", true).in("role", ["admin", "teacher"]),
    ]);

    const enquiryRows: Enquiry[] = ((eq || []) as Enquiry[]).map(e => ({ ...e, _origin: "enquiry" as const }));

    // Map new-module leads into the shared Enquiry shape (read-only here).
    const leadRows: Enquiry[] = (leadsRes?.data || []).map((l: any): Enquiry => ({
      id: `lead:${l.id}`,
      prospect_name: l.student_name || l.parent_name || "Unknown",
      phone: l.phone ?? null,
      date: l.created_at ? String(l.created_at).split("T")[0] : null,
      status: l.status ?? "new",
      notes: l.notes ?? null,
      is_walkin: l.source === "walk_in",
      priority: l.priority ?? null,
      assigned_to: l.assigned_to ?? null,
      follow_up_date: l.sla_due_at ? String(l.sla_due_at).split("T")[0] : null,
      interested_standard: l.standard ?? null,
      interested_course: l.course ?? null,
      _origin: "lead",
      _source: l.source ?? null,
    }));

    const merged = [...enquiryRows, ...leadRows].sort(
      (a, b) => (b.date || "").localeCompare(a.date || ""),
    );

    setEnquiries(merged);
    setStaff(sp || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // A lead from a landing page / Meta ad counts as a "web-form" enquiry.
  const isWebForm = (e: Enquiry) =>
    e.notes?.includes("web-form") || e._source === "landing" || e._source === "meta_ads";

  const filtered = enquiries.filter(e => {
    if (typeFilter === "walk-in" && !e.is_walkin) return false;
    if (typeFilter === "call" && (e.is_walkin || isWebForm(e))) return false;
    if (typeFilter === "web-form" && !isWebForm(e)) return false;
    if (statusFilter === "active" && isClosed(e.status)) return false;
    if (statusFilter === "converted" && !isConverted(e.status)) return false;
    return true;
  });

  // Metrics — origin-agnostic (an active lead/enquiry is one that isn't won or dead).
  const totalActive    = enquiries.filter(e => !isClosed(e.status)).length;
  const todayCalls     = enquiries.filter(e => e.date === today && !e.is_walkin).length;
  const todayWalkIns   = enquiries.filter(e => e.date === today && e.is_walkin).length;
  const totalConverted = enquiries.filter(e => isConverted(e.status)).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return toast.error("Name and phone are required");
    setSaving(true);
    try {
      const isWalkIn = form.type === "walk-in";

      let { data, error } = await (supabase as any).from("admission_calls").insert({
        prospect_name: form.name.trim(),
        phone: form.phone.trim(),
        date: today,
        status: "interested",
        notes: form.notes,
        is_walkin: isWalkIn,
        priority: form.priority,
        interested_standard: form.interested_standard || null,
        interested_course: form.interested_course || null,
        admin_id: user?.profileId || null,
      }).select().single();

      // If migration not yet run, retry without new columns
      if (error?.message?.includes("does not exist") || error?.message?.includes("schema cache")) {
        const res = await supabase.from("admission_calls").insert({
          prospect_name: form.name.trim(),
          phone: form.phone.trim(),
          date: today,
          status: "interested",
          notes: form.notes,
          is_walkin: isWalkIn,
          admin_id: user?.profileId || null,
        }).select().single();
        data = res.data;
        error = res.error;
      }

      if (error) return toast.error("Failed to save: " + error.message);

      // Create notification for walk-ins
      if (isWalkIn && data) {
        const notifMsg = `Walk-in enquiry: ${form.name.trim()} (${form.phone.trim()})${form.interested_standard ? " — Std: " + form.interested_standard : ""}${form.interested_course ? " | Course: " + form.interested_course : ""}`;
        await supabase.from("notifications").insert({
          type: "walk_in",
          message: notifMsg,
          reference_id: data.id,
          created_by: user?.profileId || null,
        });
      }

      toast.success(`${isWalkIn ? "Walk-in" : "Enquiry"} registered successfully`);
      setForm({ name: "", phone: "", notes: "", type: "call", priority: "medium", interested_standard: "", interested_course: "" });
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!followTarget || !noteText.trim()) return;
    setSavingNote(true);
    try {
      let { error } = await (supabase as any).from("admission_calls").update({
        status: newStatus,
        notes: noteText,
        follow_up_date: followDate || null,
      }).eq("id", followTarget.id);

      // If migration not run, retry without follow_up_date
      if (error?.message?.includes("does not exist") || error?.message?.includes("schema cache")) {
        const res = await supabase.from("admission_calls").update({
          status: newStatus,
          notes: noteText,
        }).eq("id", followTarget.id);
        error = res.error;
      }

      if (error) return toast.error("Failed to save: " + error.message);
      toast.success("Follow-up note saved");
      setFollowTarget(null);
      setNoteText("");
      setFollowDate("");
      await load();
    } finally {
      setSavingNote(false);
    }
  };

  const handleAssign = async (staffId: string) => {
    if (!assignTarget) return;
    const { error } = await (supabase as any).from("admission_calls").update({ assigned_to: staffId }).eq("id", assignTarget.id);
    if (error?.message?.includes("does not exist") || error?.message?.includes("schema cache")) {
      toast.warning("Staff assignment requires the SQL migration to be run first");
    } else {
      toast.success("Enquiry assigned");
    }
    setAssignTarget(null);
    await load();
  };

  const handleApprove = async (e: Enquiry) => {
    if (
      !(await confirm({
        type: "success",
        title: "Convert to admitted student?",
        description: `Convert ${e.prospect_name} to an admitted student?`,
        confirmText: "Convert",
      }))
    )
      return;
    await supabase.from("admission_calls").update({ status: "converted" }).eq("id", e.id);
    toast.success("Enquiry marked as converted");
    await load();
  };

  const handleDelete = async (e: Enquiry) => {
    if (
      !(await confirm({
        type: "danger",
        title: "Delete Enquiry",
        description: `Delete the enquiry for ${e.prospect_name || "this prospect"}? This action cannot be undone.`,
        confirmText: "Delete",
      }))
    )
      return;
    // Lead-origin rows are soft-deleted in the leads table (id is "lead:<uuid>");
    // legacy enquiries are hard-deleted from admission_calls.
    const { error } =
      e._origin === "lead"
        ? await (supabase as any).from("leads")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", e.id.replace(/^lead:/, ""))
        : await (supabase as any).from("admission_calls").delete().eq("id", e.id);

    if (error) return toast.error("Failed to delete: " + error.message);
    toast.success("Enquiry deleted");
    await load();
  };

  const isOverdue = (date?: string | null) => !!date && date < today;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Enquiry Management</h1>
        <div className="flex items-center gap-2">
          {/* Both buttons pointed at the fixed /admissions/apply, which
              redirects to the bare /leads/apply — the address that cannot tell
              which institution a visitor opened and now shows "Institution not
              found". They resolve THIS organization's slug instead, so the link
              copied here is the one that actually delivers enquiries. */}
          <Button
            variant="outline" size="sm" className="gap-2"
            disabled={!applyUrl}
            onClick={() => {
              if (!applyUrl) return;
              navigator.clipboard.writeText(applyUrl)
                .then(() => toast.success("Enquiry link copied"))
                .catch(() => toast.error("Could not copy — select the link and copy it manually."));
            }}
          >
            <Link2 className="w-4 h-4" /> Copy Form Link
          </Button>
          <Button
            size="sm" className="gap-2"
            disabled={!applyUrl}
            onClick={() => applyUrl && window.open(applyUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="w-4 h-4" /> Open Apply Form
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Active</p>
          <p className="text-2xl font-display font-bold text-foreground">{totalActive}</p>
          <p className="text-xs text-muted-foreground">in pipeline</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Calls Today</p>
          <p className="text-2xl font-display font-bold text-foreground">{todayCalls}</p>
          <p className="text-xs text-muted-foreground">Target: 10/day</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Walk-ins Today</p>
            <UserPlus className="w-4 h-4 text-accent" />
          </div>
          <p className={`text-2xl font-display font-bold ${todayWalkIns >= 2 ? "text-green-600" : "text-yellow-600"}`}>{todayWalkIns}</p>
          <p className="text-xs text-muted-foreground">Target: 2/day</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Converted</p>
          <p className="text-2xl font-display font-bold text-green-600">{totalConverted}</p>
        </div>
      </div>

      {/* Registration Form */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-accent" /> Student Enquiry Registration
          </h2>
          <Button size="sm" onClick={() => setShowForm(v => !v)} variant={showForm ? "outline" : "default"} className="gap-1.5">
            {showForm ? "Cancel" : <><Plus className="w-3 h-3" /> New Enquiry</>}
          </Button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="p-4 bg-muted/20 rounded-lg space-y-3 border border-border/50 animate-in fade-in slide-in-from-top-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Student / Parent Name *" required />
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone Number *" required />
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="call">Phone Call</option>
                <option value="walk-in">Walk-in</option>
                <option value="web-form">Website Form</option>
              </select>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input value={form.interested_standard} onChange={e => setForm({ ...form, interested_standard: e.target.value })} placeholder="Interested Standard (e.g. Class 11)" />
              <Input value={form.interested_course} onChange={e => setForm({ ...form, interested_course: e.target.value })} placeholder="Interested Course (e.g. JEE, NEET)" />
            </div>

            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional Notes / Details" />

            {form.type === "walk-in" && (
              <div className="flex items-center gap-2 text-xs text-accent bg-accent/10 rounded-md px-3 py-2">
                <Bell className="w-3.5 h-3.5" /> A notification will be sent to management when this walk-in is registered.
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? "Saving..." : "Register Enquiry"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Enquiry List */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Filter className="w-4 h-4 text-accent" /> Enquiry Pipeline
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type filter */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["all", "walk-in", "call", "web-form"] as const).map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 capitalize transition-colors ${typeFilter === t ? "bg-accent text-accent-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}>
                  {t === "all" ? "All Types" : t}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["active", "all", "converted"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 capitalize transition-colors ${statusFilter === s ? "bg-accent text-accent-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No enquiries found.</p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {filtered.map(e => {
              const st = STATUS_MAP[e.status || "interested"] || STATUS_MAP.interested;
              const overdue = isOverdue(e.follow_up_date);
              const assignedStaff = staff.find(s => s.id === e.assigned_to);
              return (
                <div key={e.id} className={`flex flex-col p-4 rounded-lg border gap-3 transition-colors ${overdue ? "bg-red-50/30 border-red-200/50" : "bg-card border-border/50"}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-bold text-foreground">{e.prospect_name || "Unknown"}</h3>
                        {e._origin === "lead" && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-accent/15 text-accent font-medium border border-accent/30 inline-flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" /> LEAD
                          </span>
                        )}
                        {e.is_walkin && <span className="px-2 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-medium border border-purple-200">WALK-IN</span>}
                        {e.priority && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${PRIORITY_MAP[e.priority] || ""}`}>
                            {e.priority.toUpperCase()}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.color}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Phone className="w-3 h-3" /> {e.phone}
                        {e.date && <span>· {e.date}</span>}
                      </p>
                      {(e.interested_standard || e.interested_course) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {e.interested_standard && <span>Std: {e.interested_standard}</span>}
                          {e.interested_standard && e.interested_course && " · "}
                          {e.interested_course && <span>Course: {e.interested_course}</span>}
                        </p>
                      )}
                      {e.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{e.notes}</p>}
                    </div>

                    <div className="flex flex-wrap gap-2 items-center flex-shrink-0">
                      {e._origin === "lead" ? (
                        <>
                          {/* Leads own their automated pipeline (scoring, assignment,
                             WhatsApp follow-ups) in the Leads module — surface them
                             here read-only and deep-link to manage them there. */}
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 bg-accent/10 text-accent border-accent/20"
                            onClick={() => navigate("../leads")}>
                            <ExternalLink className="w-3 h-3" /> View in Leads
                          </Button>
                          {/* Delete (soft-delete the lead) */}
                          {["admin", "management"].includes(user?.role || "") && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDelete(e)}>
                              <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Assign */}
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAssignTarget(e)}>
                            <Users className="w-3 h-3" /> {assignedStaff ? assignedStaff.name : "Assign"}
                          </Button>

                          {/* Follow-up */}
                          {e.status !== "converted" && e.status !== "not_interested" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 bg-accent/10 text-accent border-accent/20"
                              onClick={() => { setFollowTarget(e); setNewStatus(e.status || "follow_up"); setNoteText(""); setFollowDate(e.follow_up_date || ""); }}>
                              <FileText className="w-3 h-3" /> Follow-up
                            </Button>
                          )}

                          {/* Approve admission */}
                          {["admin", "management"].includes(user?.role || "") && e.status === "interested" && (
                            <Button size="sm" className="h-7 text-xs gap-1 bg-green-500/20 text-green-700 hover:bg-green-500/30 border border-green-200"
                              variant="outline" onClick={() => handleApprove(e)}>
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </Button>
                          )}

                          {/* Delete */}
                          {["admin", "management"].includes(user?.role || "") && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDelete(e)}>
                              <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {overdue && (
                    <div className="flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-1 rounded w-fit">
                      <AlertCircle className="w-3 h-3" /> Overdue follow-up since {e.follow_up_date}
                    </div>
                  )}
                  {e.follow_up_date && !overdue && (
                    <p className="text-xs text-muted-foreground">Next Follow-up: {e.follow_up_date}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Follow-up Dialog */}
      <Dialog open={!!followTarget} onOpenChange={open => { if (!open) setFollowTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Follow-up — {followTarget?.prospect_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
              <p><span className="text-muted-foreground">Phone:</span> {followTarget?.phone}</p>
              {followTarget?.interested_standard && <p><span className="text-muted-foreground">Standard:</span> {followTarget.interested_standard}</p>}
              {followTarget?.interested_course && <p><span className="text-muted-foreground">Course:</span> {followTarget.interested_course}</p>}
              {followTarget?.notes && <p><span className="text-muted-foreground">Last note:</span> {followTarget.notes}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Follow-up Note *</label>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Enter follow-up details..."
                className="w-full min-h-[80px] p-2 bg-background border border-border rounded-md text-sm resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">New Status</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="interested">Interested</option>
                  <option value="follow_up">Follow-up Needed</option>
                  <option value="converted">Converted</option>
                  <option value="not_interested">Not Interested</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Next Follow-up Date</label>
                <Input type="date" value={followDate} onChange={e => setFollowDate(e.target.value)} min={today} className="text-sm h-9" />
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveNote} disabled={savingNote}>
              {savingNote ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={open => { if (!open) setAssignTarget(null); }}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader><DialogTitle>Assign Staff</DialogTitle></DialogHeader>
          <div className="space-y-1 py-2 max-h-64 overflow-y-auto">
            {staff.map(s => (
              <Button key={s.id} variant="ghost" className="w-full justify-start text-sm"
                onClick={() => handleAssign(s.id)}>
                {s.name}
              </Button>
            ))}
            {staff.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No staff found.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnquiryManagement;
