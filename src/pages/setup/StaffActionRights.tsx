import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Profile { id: string; name: string; role: string | null; }
interface ActionRight { id?: string; profile_id: string; action_key: string; is_allowed: boolean; }

const ACTION_GROUPS = [
  {
    group: "Fee Operations",
    actions: [
      { key: "fee.apply_discount", label: "Apply Discount on Fees" },
      { key: "fee.issue_refund", label: "Issue Refund" },
      { key: "fee.mark_paid", label: "Mark Fee as Paid" },
      { key: "fee.add_installment", label: "Add Installment" },
      { key: "fee.generate_receipt", label: "Generate Fee Receipt" },
    ],
  },
  {
    group: "Student Operations",
    actions: [
      { key: "student.deactivate", label: "Deactivate Student" },
      { key: "student.edit_profile", label: "Edit Student Profile" },
      { key: "student.view_contact", label: "View Parent Contact" },
    ],
  },
  {
    group: "Enquiry Operations",
    actions: [
      { key: "enquiry.assign", label: "Assign Enquiry to Staff" },
      { key: "enquiry.convert", label: "Convert Enquiry to Admission" },
      { key: "enquiry.delete", label: "Delete Enquiry" },
    ],
  },
  {
    group: "Expense & Income",
    actions: [
      { key: "expense.delete", label: "Delete Expense/Income Entry" },
      { key: "expense.edit", label: "Edit Expense/Income Entry" },
    ],
  },
  {
    group: "Attendance",
    actions: [
      { key: "attendance.approve_checkin", label: "Approve Teacher Check-in" },
      { key: "attendance.override", label: "Override Attendance Record" },
    ],
  },
  {
    group: "Reports",
    actions: [
      { key: "report.export", label: "Export Reports" },
      { key: "report.send_whatsapp", label: "Send WhatsApp Reports to Parents" },
    ],
  },
];

const ALL_ACTIONS = ACTION_GROUPS.flatMap(g => g.actions);

const StaffActionRights: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [rights, setRights] = useState<Record<string, ActionRight>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, name, role").neq("role", "management").order("name").then(({ data }) => setProfiles(data || []));
  }, []);

  const loadRights = async (profileId: string) => {
    setLoading(true);
    const { data } = await supabase.from("staff_action_rights").select("*").eq("profile_id", profileId);
    const map: Record<string, ActionRight> = {};
    (data || []).forEach((r: any) => { map[r.action_key] = r; });
    ALL_ACTIONS.forEach(a => { if (!map[a.key]) map[a.key] = { profile_id: profileId, action_key: a.key, is_allowed: false }; });
    setRights(map);
    setLoading(false);
  };

  const handleSelect = (id: string) => { setSelectedProfile(id); if (id) loadRights(id); else setRights({}); };

  const toggle = (key: string) => {
    setRights(prev => ({ ...prev, [key]: { ...prev[key], is_allowed: !prev[key].is_allowed } }));
  };

  const toggleGroup = (keys: string[], value: boolean) => {
    setRights(prev => {
      const next = { ...prev };
      keys.forEach(k => { next[k] = { ...next[k], is_allowed: value }; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    const rows = Object.values(rights).map(r => ({ profile_id: r.profile_id, action_key: r.action_key, is_allowed: r.is_allowed }));
    const { error } = await supabase.from("staff_action_rights").upsert(rows, { onConflict: "profile_id,action_key" });
    if (error) toast.error("Failed to save action rights");
    else toast.success("Action rights saved");
    setSaving(false);
  };

  const profile = profiles.find(p => p.id === selectedProfile);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Staff Action Rights</h1>
          <p className="text-sm text-muted-foreground mt-1">Control specific actions each staff member can perform</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-muted-foreground">Select Staff:</label>
        <select value={selectedProfile} onChange={e => handleSelect(e.target.value)} className="bg-background border border-border rounded-md px-3 py-2 text-sm min-w-[220px]">
          <option value="">-- Select a staff member --</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name || "Unnamed"} ({p.role})</option>)}
        </select>
        {selectedProfile && (
          <Button onClick={handleSave} disabled={saving} className="gap-2 ml-auto"><Save className="w-4 h-4" />{saving ? "Saving..." : "Save Rights"}</Button>
        )}
      </div>

      {!selectedProfile && (
        <div className="glass-card p-10 text-center text-muted-foreground flex flex-col items-center gap-3">
          <ShieldCheck className="w-10 h-10 opacity-30" />
          <p>Select a staff member to manage their specific action permissions</p>
        </div>
      )}

      {selectedProfile && loading && <div className="glass-card p-8 text-center text-muted-foreground">Loading...</div>}

      {selectedProfile && !loading && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Configuring action rights for: <span className="font-semibold text-foreground">{profile?.name}</span>
          </div>
          {ACTION_GROUPS.map(group => {
            const keys = group.actions.map(a => a.key);
            const allOn = keys.every(k => rights[k]?.is_allowed);
            return (
              <div key={group.group} className="glass-card p-0 overflow-hidden">
                <div className="px-5 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between">
                  <span className="font-medium text-sm">{group.group}</span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={allOn} onChange={e => toggleGroup(keys, e.target.checked)} className="h-4 w-4 rounded accent-accent" />
                    Grant All
                  </label>
                </div>
                <div className="divide-y divide-border/30">
                  {group.actions.map(action => {
                    const r = rights[action.key];
                    return (
                      <div key={action.key} className="px-5 py-3 flex items-center justify-between hover:bg-muted/10">
                        <span className="text-sm text-foreground">{action.label}</span>
                        <button
                          onClick={() => toggle(action.key)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${r?.is_allowed ? "bg-accent" : "bg-muted-foreground/30"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${r?.is_allowed ? "translate-x-4" : "translate-x-1"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="w-4 h-4" />{saving ? "Saving..." : "Save Action Rights"}</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffActionRights;
