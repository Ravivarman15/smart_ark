// ── Parent Portal — Settings ─────────────────────────────────────────────────
// Profile, password, language, theme, notification opt-outs, linked children,
// and the account's own audit trail.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Loader2, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { useTheme } from "@/core/theme";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { parentPreferencesService } from "../services/parentPreferences.service";
import { parentAuditService } from "../services/parentAudit.service";
import { PARENT_NOTIFICATION_EVENTS } from "../types/parentPortal.types";
import {
  Card,
  ChildAvatar,
  Chip,
  PageHeader,
  SectionTitle,
  formatDateTime,
} from "../components/primitives";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
];

export const ParentSettingsPage = () => {
  const { parent } = useAuth();
  const { children: kids } = useActiveChild();
  // The app's theme registry is keyed by ThemeId, not by mode — the portal
  // drives the same registry rather than introducing a competing dark-mode
  // flag, so a parent's choice survives into every other themed surface.
  const { mode, setTheme } = useTheme();
  const qc = useQueryClient();

  const prefsQuery = useQuery({
    queryKey: parent
      ? queryKeys.parentPortal.preferences(parent.accountId)
      : [...queryKeys.parentPortal.all, "preferences", "none"],
    queryFn: () => parentPreferencesService.get(parent!.accountId),
    enabled: !!parent,
  });

  const [language, setLanguage] = useState("en");
  const [optOuts, setOptOuts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!prefsQuery.data) return;
    setLanguage(prefsQuery.data.language);
    setOptOuts(prefsQuery.data.notificationPrefs);
  }, [prefsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!parent) throw new Error("Not signed in");
      await parentPreferencesService.save(parent.accountId, {
        language,
        // Portal theme mirrors the app theme toggle rather than being a second,
        // competing setting — one control, persisted for next sign-in.
        theme: mode,
        notificationPrefs: optOuts,
      });
      await parentAuditService.log({
        parentAccountId: parent.accountId,
        event: "update_preferences",
      });
    },
    onSuccess: () => {
      toast.success("Settings saved");
      if (parent) {
        void qc.invalidateQueries({
          queryKey: queryKeys.parentPortal.preferences(parent.accountId),
        });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // ── Password change ───────────────────────────────────────────────────────
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const changePassword = useMutation({
    mutationFn: async () => {
      if (pw.next.length < 8) throw new Error("Password must be at least 8 characters.");
      if (pw.next !== pw.confirm) throw new Error("The two passwords do not match.");
      const { error } = await supabase.auth.updateUser({ password: pw.next });
      if (error) throw error;
      if (parent) {
        await parentAuditService.log({
          parentAccountId: parent.accountId,
          event: "change_password",
        });
      }
    },
    onSuccess: () => {
      toast.success("Password updated");
      setPw({ next: "", confirm: "" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const trailQuery = useQuery({
    queryKey: parent
      ? [...queryKeys.parentPortal.all, "audit", parent.accountId]
      : [...queryKeys.parentPortal.all, "audit", "none"],
    queryFn: () => parentAuditService.myTrail(parent!.accountId, 25),
    enabled: !!parent,
  });

  if (!parent) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Settings" subtitle={parent.email} />

      <Card className="mb-4">
        <SectionTitle>Your account</SectionTitle>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium text-foreground">{parent.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium text-foreground">{parent.email}</span>
          </div>
          {parent.mobile && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mobile</span>
              <span className="font-medium text-foreground">{parent.mobile}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <SectionTitle>Linked children</SectionTitle>
        <div className="space-y-2">
          {kids.map((c) => (
            <div key={c.student.id} className="flex items-center gap-2.5">
              <ChildAvatar name={c.student.name} photoUrl={c.student.profileImageUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{c.student.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[c.student.standardName, c.student.section].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {c.isPrimary && <Chip tone="info">Primary</Chip>}
              {c.relation && <Chip>{c.relation}</Chip>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Children are linked by the institution. Contact the office to add or remove a child.
        </p>
      </Card>

      <Card className="mb-4">
        <SectionTitle>Appearance</SectionTitle>
        <div className="flex gap-1.5">
          {(
            [
              ["ark-light", "light", "Light", Sun],
              ["ark-dark", "dark", "Dark", Moon],
            ] as const
          ).map(([themeId, themeMode, label, Icon]) => (
            <button
              key={themeId}
              onClick={() => setTheme(themeId)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                mode === themeMode
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <SectionTitle>Language</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                language === l.code
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        {/* Honest scope note: this records the family's preferred language for
            the Communication engine's template selection. The portal interface
            itself is not yet translated — no i18n layer exists in this app. */}
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Used to choose the language of messages sent to you. The portal interface is currently
          English only.
        </p>
      </Card>

      <Card className="mb-4">
        <SectionTitle>Notifications</SectionTitle>
        <p className="text-[11px] text-muted-foreground mb-3">
          Turn off any notification you do not want to receive.
        </p>
        <div className="space-y-2">
          {PARENT_NOTIFICATION_EVENTS.map((ev) => {
            const on = !optOuts[ev.key];
            return (
              <label
                key={ev.key}
                className="flex items-center justify-between gap-3 cursor-pointer py-1"
              >
                <span className="text-xs text-foreground">{ev.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => setOptOuts((o) => ({ ...o, [ev.key]: on }))}
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors shrink-0",
                    on ? "bg-accent" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                      on ? "translate-x-4.5 left-0.5" : "left-0.5",
                    )}
                    style={{ transform: on ? "translateX(16px)" : undefined }}
                  />
                </button>
              </label>
            );
          })}
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save settings
        </button>
      </Card>

      <Card className="mb-4">
        <SectionTitle>Change password</SectionTitle>
        <div className="space-y-2.5 max-w-sm">
          <input
            type="password"
            value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
            placeholder="New password (min 8 characters)"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <input
            type="password"
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            placeholder="Confirm new password"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            onClick={() => changePassword.mutate()}
            disabled={changePassword.isPending || !pw.next}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-50"
          >
            {changePassword.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <KeyRound className="w-3.5 h-3.5" />
            )}
            Update password
          </button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Recent account activity</SectionTitle>
        {trailQuery.data && trailQuery.data.length > 0 ? (
          <div className="space-y-1.5">
            {trailQuery.data.map((t) => (
              <div key={t.id} className="flex justify-between gap-3 text-[11px]">
                <span className="text-foreground capitalize">{t.event.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground shrink-0">
                  {formatDateTime(t.createdAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
        )}
      </Card>
    </div>
  );
};

export default ParentSettingsPage;
