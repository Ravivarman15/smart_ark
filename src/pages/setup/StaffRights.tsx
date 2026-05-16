import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Profile { id: string; name: string; role: string | null; campus_id: string | null; }
interface Right { id?: string; profile_id: string; module_name: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; }

const MODULES = [
  "Setup", "Academic Years", "Standards", "Subjects", "Course Types", "Class/Batch", "Tax",
  "Staff Management", "Staff Attendance",
  "Enquiry/Leads",
  "Fee Structure", "Fee Collection",
  "Expense & Income",
  "Student Control",
  "Timetable",
  "Reports",
];

const DEFAULT_RIGHT = (profile_id: string, module_name: string): Right => ({
  profile_id, module_name, can_view: false, can_create: false, can_edit: false, can_delete: false,
});

const StaffRights: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [rights, setRights] = useState<Record<string, Right>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, name, role, campus_id")
      .neq("role", "management")
      .order("name")
      .then(({ data }) => setProfiles(data || []));
  }, []);

  const loadRights = async (profileId: string) => {
    setLoading(true);
    const { data } = await supabase.from("staff_rights").select("*").eq("profile_id", profileId);
    const map: Record<string, Right> = {};
    (data || []).forEach((r: any) => { map[r.module_name] = r; });
    MODULES.forEach(m => { if (!map[m]) map[m] = DEFAULT_RIGHT(profileId, m); });
    setRights(map);
    setLoading(false);
  };

  const handleSelect = (id: string) => { setSelectedProfile(id); if (id) loadRights(id); else setRights({}); };

  const toggle = (module: string, field: keyof Omit<Right, "id" | "profile_id" | "module_name">) => {
    setRights(prev => ({ ...prev, [module]: { ...prev[module], [field]: !prev[module][field] } }));
  };

  const toggleAll = (module: string, value: boolean) => {
    setRights(prev => ({ ...prev, [module]: { ...prev[module], can_view: value, can_create: value, can_edit: value, can_delete: value } }));
  };

  const handleSave = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    const rows = Object.values(rights).map(r => ({ profile_id: r.profile_id, module_name: r.module_name, can_view: r.can_view, can_create: r.can_create, can_edit: r.can_edit, can_delete: r.can_delete }));
    const { error } = await supabase.from("staff_rights").upsert(rows, { onConflict: "profile_id,module_name" });
    if (error) toast.error("Failed to save rights");
    else toast.success("Staff rights saved successfully");
    setSaving(false);
  };

  const profile = profiles.find(p => p.id === selectedProfile);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Staff Rights</h1>
          <p className="text-sm text-muted-foreground mt-1">Control which modules each staff member can access</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
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
          <Shield className="w-10 h-10 opacity-30" />
          <p>Select a staff member to manage their module access rights</p>
        </div>
      )}

      {selectedProfile && loading && (
        <div className="glass-card p-8 text-center text-muted-foreground">Loading rights...</div>
      )}

      {selectedProfile && !loading && (
        <div className="glass-card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50 bg-muted/20 flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" />
            <span className="font-medium text-sm">Module Access Rights — {profile?.name}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-5 py-3 text-left font-medium w-[35%]">Module</th>
                  <th className="px-5 py-3 text-center font-medium">Full Access</th>
                  <th className="px-5 py-3 text-center font-medium">View</th>
                  <th className="px-5 py-3 text-center font-medium">Create</th>
                  <th className="px-5 py-3 text-center font-medium">Edit</th>
                  <th className="px-5 py-3 text-center font-medium">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {MODULES.map(m => {
                  const r = rights[m] || DEFAULT_RIGHT(selectedProfile, m);
                  const allOn = r.can_view && r.can_create && r.can_edit && r.can_delete;
                  return (
                    <tr key={m} className="hover:bg-muted/10">
                      <td className="px-5 py-3 font-medium text-foreground">{m}</td>
                      <td className="px-5 py-3 text-center">
                        <input type="checkbox" checked={allOn} onChange={e => toggleAll(m, e.target.checked)} className="h-4 w-4 rounded accent-accent" />
                      </td>
                      {(["can_view", "can_create", "can_edit", "can_delete"] as const).map(f => (
                        <td key={f} className="px-5 py-3 text-center">
                          <input type="checkbox" checked={r[f]} onChange={() => toggle(m, f)} className="h-4 w-4 rounded accent-accent" />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-border/50 flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="w-4 h-4" />{saving ? "Saving..." : "Save Rights"}</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffRights;
