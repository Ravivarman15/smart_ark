import React, { useMemo, useState } from "react";
import { Mail, Phone, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelHeading } from "./shared";
import { isValidEmail, isValidMobile, mobileKey, type ContactRow } from "../../utils/feeCommsCalc";
import { useUpdateStudentContacts } from "../../hooks/useFeeComms";

// ─────────────────────────────────────────────────────────────────────────────
// Missing Contact Center — surfaces students with a missing / invalid / duplicate
// email or mobile and lets staff fix them inline (single or bulk) via the
// EXISTING studentsService.update. Live validation + duplicate highlighting.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "email" | "mobile" | "all";

interface Draft {
  email: string;
  mobile: string;
}

export const MissingContactCenter: React.FC<{ contacts: ContactRow[]; canEdit: boolean }> = ({
  contacts,
  canEdit,
}) => {
  const [mode, setMode] = useState<Mode>("all");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const update = useUpdateStudentContacts();

  // Duplicate sets across the whole body (so a fix elsewhere clears the flag).
  const { dupEmails, dupMobiles } = useMemo(() => {
    const e = new Map<string, number>();
    const m = new Map<string, number>();
    for (const c of contacts) {
      const em = (c.email ?? "").trim().toLowerCase();
      if (em) e.set(em, (e.get(em) ?? 0) + 1);
      const mk = mobileKey(c.mobile);
      if (mk) m.set(mk, (m.get(mk) ?? 0) + 1);
    }
    return {
      dupEmails: new Set([...e].filter(([, n]) => n > 1).map(([k]) => k)),
      dupMobiles: new Set([...m].filter(([, n]) => n > 1).map(([k]) => k)),
    };
  }, [contacts]);

  const issues = useMemo(() => {
    const rows = contacts.filter((c) => {
      const emailBad = !c.email || !isValidEmail(c.email) || dupEmails.has((c.email ?? "").toLowerCase());
      const mobileBad = !c.mobile || !isValidMobile(c.mobile) || dupMobiles.has(mobileKey(c.mobile));
      if (mode === "email") return emailBad;
      if (mode === "mobile") return mobileBad;
      return emailBad || mobileBad;
    });
    const q = search.trim().toLowerCase();
    return q
      ? rows.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.admissionNo ?? "").toLowerCase().includes(q) ||
            (c.parentName ?? "").toLowerCase().includes(q),
        )
      : rows;
  }, [contacts, mode, search, dupEmails, dupMobiles]);

  const draftOf = (c: ContactRow): Draft =>
    drafts[c.id] ?? { email: c.email ?? "", mobile: c.mobile ?? "" };

  const setDraft = (id: string, patch: Partial<Draft>, base: ContactRow) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftOf(base), ...patch } }));

  const dirtyRows = (ids: string[]) =>
    ids
      .map((id) => {
        const c = contacts.find((x) => x.id === id);
        if (!c) return null;
        const d = drafts[id];
        if (!d) return null;
        const emailChanged = d.email !== (c.email ?? "") && (d.email === "" || isValidEmail(d.email));
        const mobileChanged = d.mobile !== (c.mobile ?? "") && (d.mobile === "" || isValidMobile(d.mobile));
        if (!emailChanged && !mobileChanged) return null;
        return {
          id,
          ...(emailChanged ? { parentEmail: d.email } : {}),
          ...(mobileChanged ? { parentContact: d.mobile } : {}),
        };
      })
      .filter((x): x is { id: string; parentEmail?: string; parentContact?: string } => !!x);

  const save = async (ids: string[]) => {
    const payload = dirtyRows(ids);
    if (payload.length === 0) {
      toast.info("No valid changes to save.");
      return;
    }
    const ok = await update.mutateAsync(payload);
    toast.success(`Updated ${ok} of ${payload.length} student${payload.length === 1 ? "" : "s"}.`);
    setDrafts((d) => {
      const next = { ...d };
      for (const p of payload) delete next[p.id];
      return next;
    });
    setSelected(new Set());
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <PanelHeading
        title="Missing Contact Center"
        desc="Fix missing, invalid or duplicate parent email / mobile — inline or in bulk."
        right={
          canEdit && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || update.isPending}
                onClick={() => save([...selected])}
              >
                Update Selected ({selected.size})
              </Button>
              <Button
                size="sm"
                disabled={update.isPending}
                onClick={() => save(issues.map((c) => c.id))}
              >
                <Save className="w-3.5 h-3.5 mr-1" /> Update All
              </Button>
            </div>
          )
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "email", "mobile"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              mode === m
                ? "bg-accent text-accent-foreground border-accent"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {m === "all" ? "All issues" : m === "email" ? "Email issues" : "Mobile issues"}
          </button>
        ))}
        <div className="relative w-64 ml-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search student / admission / parent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-background/50"
          />
        </div>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2 text-left font-medium">Student</th>
                <th className="px-3 py-2 text-left font-medium">Admission</th>
                <th className="px-3 py-2 text-left font-medium">Class</th>
                <th className="px-3 py-2 text-left font-medium">Parent</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Mobile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {issues.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    🎉 No contact issues in this view.
                  </td>
                </tr>
              )}
              {issues.slice(0, 300).map((c) => {
                const d = draftOf(c);
                const emailInvalid = d.email !== "" && !isValidEmail(d.email);
                const mobileInvalid = d.mobile !== "" && !isValidMobile(d.mobile);
                const emailDup = d.email && dupEmails.has(d.email.toLowerCase());
                const mobileDup = d.mobile && dupMobiles.has(mobileKey(d.mobile));
                return (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{c.admissionNo ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {[c.className, c.section].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{c.parentName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <Input
                          value={d.email}
                          disabled={!canEdit}
                          onChange={(e) => setDraft(c.id, { email: e.target.value }, c)}
                          placeholder="add email"
                          className={`h-8 text-xs ${emailInvalid ? "border-red-400 bg-red-50/40" : emailDup ? "border-amber-400 bg-amber-50/40" : ""}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <Input
                          value={d.mobile}
                          disabled={!canEdit}
                          onChange={(e) => setDraft(c.id, { mobile: e.target.value }, c)}
                          placeholder="add mobile"
                          className={`h-8 text-xs ${mobileInvalid ? "border-red-400 bg-red-50/40" : mobileDup ? "border-amber-400 bg-amber-50/40" : ""}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {issues.length > 300 && (
        <p className="text-xs text-muted-foreground">Showing first 300 of {issues.length}. Use search to narrow.</p>
      )}
    </div>
  );
};
