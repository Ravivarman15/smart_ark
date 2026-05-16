import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Save, ChevronDown, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MODULE_KEYS,
  MODULE_LABELS,
  ACTION_DEFS,
  type ModuleKey,
} from "@/contexts/StaffRightsContext";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  subject: string | null;
  campus_name: string | null;
}

const StaffRightsManager: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [moduleRights, setModuleRights] = useState<Record<string, boolean>>({});
  const [actionRights, setActionRights] = useState<Record<string, boolean>>({});
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [loadingRights, setLoadingRights] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch staff from profiles — column is "name", not "full_name"
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, name, role, subject, campuses(name)")
      .neq("role", "management")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) { toast.error("Failed to load staff"); return; }
        setStaffList(
          (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            subject: p.subject,
            campus_name: p.campuses?.name ?? null,
          }))
        );
      });
  }, []);

  const loadRights = useCallback(async (profileId: string) => {
    setLoadingRights(true);
    // Wrap in try/finally so the spinner always clears — previously a
    // thrown Promise left setLoadingRights(true) forever.
    try {
      const [{ data: mods, error: e1 }, { data: acts, error: e2 }] = await Promise.all([
        supabase.from("staff_rights").select("module_name, can_view").eq("profile_id", profileId),
        supabase.from("staff_action_rights").select("action_key, is_allowed").eq("profile_id", profileId),
      ]);
      if (e1 || e2) {
        console.error("[loadRights] fetch failed:", e1, e2);
        toast.error(`Failed to load rights: ${e1?.message || e2?.message || "unknown error"}`);
      }

      // Build module rights map — default true (grant access) for un-configured modules
      const modMap: Record<string, boolean> = {};
      MODULE_KEYS.forEach(k => { modMap[k] = true; });
      (mods || []).forEach((r: any) => { modMap[r.module_name] = r.can_view; });
      setModuleRights(modMap);

      // Build action rights map — default true for un-configured actions
      const actMap: Record<string, boolean> = {};
      ACTION_DEFS.forEach(a => { actMap[a.key] = true; });
      (acts || []).forEach((r: any) => { actMap[r.action_key] = r.is_allowed; });
      setActionRights(actMap);
    } finally {
      setLoadingRights(false);
    }
  }, []);

  const handleSelectStaff = (id: string) => {
    setSelectedId(id);
    setModuleRights({});
    setActionRights({});
    if (id) loadRights(id);
  };

  const toggleModule = (key: ModuleKey) => {
    const next = !moduleRights[key];
    setModuleRights(prev => ({ ...prev, [key]: next }));
    // If disabling module → disable all its actions too
    if (!next) {
      const actionsForModule = ACTION_DEFS.filter(a => a.module === key).map(a => a.key);
      setActionRights(prev => {
        const updated = { ...prev };
        actionsForModule.forEach(k => { updated[k] = false; });
        return updated;
      });
    }
  };

  const toggleAction = (key: string) => {
    setActionRights(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleExpandModule = (key: string) => {
    setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!selectedId || saving) return; // guard against double-submit
    setSaving(true);
    try {
      const moduleRows = MODULE_KEYS.map(k => ({
        profile_id: selectedId,
        module_name: k,
        can_view: moduleRights[k] ?? true,
        can_create: true,
        can_edit: true,
        can_delete: true,
      }));

      const actionRows = ACTION_DEFS.map(a => ({
        profile_id: selectedId,
        action_key: a.key,
        is_allowed: actionRights[a.key] ?? true,
      }));

      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("staff_rights").upsert(moduleRows, { onConflict: "profile_id,module_name" }),
        supabase.from("staff_action_rights").upsert(actionRows, { onConflict: "profile_id,action_key" }),
      ]);

      if (e1 || e2) {
        const msg = e1?.message || e2?.message || "Unknown error";
        const code = e1?.code || e2?.code || "";
        console.error("staff_rights error:", e1);
        console.error("staff_action_rights error:", e2);
        toast.error(`Save failed (${code}): ${msg}`);
      } else {
        toast.success("Rights saved — changes apply on next login");
      }
    } finally {
      setSaving(false);
    }
  };

  const selected = staffList.find(s => s.id === selectedId);

  // Group actions by module for rendering
  const actionsByModule: Record<ModuleKey, typeof ACTION_DEFS> = {} as any;
  MODULE_KEYS.forEach(k => { actionsByModule[k] = ACTION_DEFS.filter(a => a.module === k); });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Staff Rights & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control which modules and actions each staff member can access
          </p>
        </div>
        {selectedId && (
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save Rights"}
          </Button>
        )}
      </div>

      {/* Staff Selector */}
      <div className="glass-card p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Users className="w-4 h-4" />
          Select Staff Member:
        </div>
        <select
          value={selectedId}
          onChange={e => handleSelectStaff(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm min-w-[260px] flex-1 max-w-sm"
        >
          <option value="">-- Select a staff member --</option>
          {staffList.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.role ? ` (${s.role})` : ""}
              {s.campus_name ? ` — ${s.campus_name}` : ""}
            </option>
          ))}
        </select>
        {staffList.length === 0 && (
          <span className="text-xs text-muted-foreground">No staff found in profiles table</span>
        )}
      </div>

      {/* Empty state */}
      {!selectedId && (
        <div className="glass-card p-12 text-center flex flex-col items-center gap-3 text-muted-foreground">
          <Shield className="w-12 h-12 opacity-20" />
          <p className="font-medium">Select a staff member above to configure their access rights</p>
          <p className="text-xs max-w-sm">
            Module Rights control which sections they can see.
            Action Rights control what they can do within each section.
          </p>
        </div>
      )}

      {selectedId && loadingRights && (
        <div className="glass-card p-8 text-center text-muted-foreground text-sm">Loading rights…</div>
      )}

      {/* Rights Matrix */}
      {selectedId && !loadingRights && (
        <>
          <div className="text-sm text-muted-foreground bg-accent/5 border border-accent/20 rounded-lg px-4 py-3">
            Configuring rights for: <span className="font-semibold text-foreground">{selected?.name}</span>
            {selected?.role && <span className="ml-2 text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full capitalize">{selected.role}</span>}
          </div>

          <div className="space-y-3">
            {MODULE_KEYS.map(moduleKey => {
              const moduleEnabled = moduleRights[moduleKey] !== false;
              const actions = actionsByModule[moduleKey];
              const isExpanded = expandedModules[moduleKey] ?? true;
              const enabledActionCount = actions.filter(a => actionRights[a.key] !== false).length;

              return (
                <div
                  key={moduleKey}
                  className={`glass-card p-0 overflow-hidden border transition-colors ${
                    moduleEnabled ? "border-border/50" : "border-border/20 opacity-60"
                  }`}
                >
                  {/* Module Row */}
                  <div className="flex items-center gap-3 px-5 py-3.5 bg-muted/20">
                    {/* Toggle switch for module */}
                    <button
                      onClick={() => toggleModule(moduleKey)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                        moduleEnabled ? "bg-accent" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${moduleEnabled ? "translate-x-4" : "translate-x-1"}`} />
                    </button>

                    <span className="font-semibold text-sm text-foreground flex-1">
                      {MODULE_LABELS[moduleKey]}
                    </span>

                    {moduleEnabled && (
                      <span className="text-xs text-muted-foreground">
                        {enabledActionCount}/{actions.length} actions
                      </span>
                    )}

                    {actions.length > 0 && moduleEnabled && (
                      <button
                        onClick={() => toggleExpandModule(moduleKey)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  {/* Action Rows */}
                  {moduleEnabled && isExpanded && actions.length > 0 && (
                    <div className="divide-y divide-border/20 border-t border-border/30">
                      {actions.map(action => {
                        const allowed = actionRights[action.key] !== false;
                        return (
                          <div
                            key={action.key}
                            className="flex items-center justify-between px-5 py-2.5 pl-12 hover:bg-muted/10"
                          >
                            <span className="text-sm text-muted-foreground">{action.label}</span>
                            <button
                              onClick={() => toggleAction(action.key)}
                              className={`relative inline-flex h-4 w-8 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                                allowed ? "bg-accent" : "bg-muted-foreground/30"
                              }`}
                            >
                              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${allowed ? "translate-x-4" : "translate-x-1"}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!moduleEnabled && (
                    <div className="px-5 py-2 pl-12 border-t border-border/20">
                      <span className="text-xs text-muted-foreground italic">Module hidden — staff cannot see this section</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save All Rights"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default StaffRightsManager;
