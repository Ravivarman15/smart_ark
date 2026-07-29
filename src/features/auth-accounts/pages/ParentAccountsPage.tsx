// ── Parent Accounts — provisioning console ───────────────────────────────────
//
// The missing door to the Parent Portal. Everything behind it already existed:
// the `student-parent-accounts` edge function creates the auth user, writes the
// account row, links children, rotates the password and PROVES the login works.
// Nothing in the app called it, so parents could only be created by hand in SQL.
//
// Gated to admin / management because the edge function itself enforces that —
// showing a coordinator a form that always 403s would be a worse experience
// than not showing it.
//
// CREDENTIAL HANDLING: the password is returned exactly once, by design (it is
// never stored anywhere readable — only the hash lives in auth.users). So the
// panel that reveals it is deliberately sticky and explicit: dismiss it without
// copying and the only recovery is "Reset password", which mints a new one.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Pencil,
  PencilOff,
  RefreshCw,
  Search,
  ShieldOff,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useStudents } from "@/features/students/hooks";
import {
  useLinkChild,
  useParentAccounts,
  useResetAccountPassword,
  useSetAccountStatus,
  useProvisioningStatus,
  useUnlinkChild,
  useUpdateParent,
} from "../hooks/useAuthAccounts";
import { parentCredentialsService } from "../services/parentCredentials.service";
import { AddParentFlow } from "../components/AddParentFlow";
import type { AccountVerifyResult, ParentAuthAccount } from "../types/authAccounts.types";

const STATUS_TONE: Record<string, string> = {
  active: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  pending: "text-amber-600 border-amber-500/40 bg-amber-500/10",
  disabled: "text-muted-foreground border-border bg-muted",
  locked: "text-red-600 border-red-500/40 bg-red-500/10",
};

// ── Credential reveal ────────────────────────────────────────────────────────

const CredentialPanel = ({
  result,
  onDismiss,
  onResend,
  resending,
}: {
  result: AccountVerifyResult;
  onDismiss: () => void;
  onResend?: () => void;
  resending?: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const text = `Login: ${result.loginEmail}\nPassword: ${result.password}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please select the text manually.");
    }
  };

  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Account ready — login verified</p>
            <p className="text-xs text-muted-foreground">
              These credentials are shown <b>once</b>. Copy them now — the password is not stored
              anywhere and cannot be shown again. If you lose it, use “Reset password”.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-3 font-mono text-xs space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Login</span>
            <span className="font-semibold break-all">{result.loginEmail}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Password</span>
            <span className="font-semibold break-all">{result.password}</span>
          </div>
        </div>

        {/* The account exists, so this is not a failure panel — but a parent
            with no child attached signs in to an empty portal, and that has to
            be visible at the moment of creation rather than discovered later. */}
        {result.linkWarning && (
          <p className="mt-3 text-[11px] text-amber-600 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{result.linkWarning}</span>
          </p>
        )}

        {/* Delivery outcome per channel — so staff know whether they still
            need to read the password out over the phone. */}
        {result.deliveries && result.deliveries.length > 0 && (
          <div className="mt-3 space-y-1">
            {result.deliveries.map((d) => (
              <p
                key={d.channel}
                className={cn(
                  "text-[11px] flex items-start gap-1.5",
                  d.ok ? "text-emerald-600" : d.skipped ? "text-muted-foreground" : "text-amber-600",
                )}
              >
                {d.ok ? (
                  <Check className="w-3 h-3 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                )}
                <span>
                  <b className="capitalize">{d.channel}</b>:{" "}
                  {d.ok
                    ? d.channel === "email"
                      ? "credentials emailed to the parent"
                      : "credentials sent to the parent's WhatsApp"
                    : (d.message ?? "not sent")}
                </span>
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" onClick={copy}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? "Copied" : "Copy credentials"}
          </Button>
          {onResend && (
            <Button size="sm" variant="outline" onClick={onResend} disabled={resending}>
              {resending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5 mr-1.5" />
              )}
              Resend
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Done
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          The parent signs in at <b>/login</b> — the same page staff use — and lands on the Parent
          Portal automatically.
        </p>
      </CardContent>
    </Card>
  );
};

// ── Student picker ───────────────────────────────────────────────────────────

const StudentPicker = ({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) => {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useStudents({ search, pageSize: 25 });
  const rows = data?.rows ?? [];

  return (
    <div>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student by name or admission number…"
          className="pl-8 h-9 text-sm"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y">
        {isLoading && <p className="p-3 text-xs text-muted-foreground">Searching…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            {search ? "No students match that search." : "Type to search for a student."}
          </p>
        )}
        {rows.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={cn(
                "w-full flex items-center gap-2 p-2.5 text-left text-xs transition-colors",
                on ? "bg-accent/10" : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  on ? "bg-accent border-accent" : "border-border",
                )}
              >
                {on && <Check className="w-3 h-3 text-accent-foreground" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium block truncate">{s.name}</span>
                <span className="text-muted-foreground block truncate">
                  {[s.standardName, s.section, s.enrolmentNo].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {selected.length} child{selected.length === 1 ? "" : "ren"} selected
        </p>
      )}
    </div>
  );
};

// ── Edit-parent dialog ───────────────────────────────────────────────────────

const EditParentDialog = ({
  parent,
  onOpenChange,
}: {
  parent: ParentAuthAccount | null;
  onOpenChange: (v: boolean) => void;
}) => {
  const update = useUpdateParent();
  const [form, setForm] = useState({ name: "", mobile: "", email: "", autoSync: true });

  useEffect(() => {
    if (!parent) return;
    setForm({
      name: parent.name ?? "",
      mobile: parent.mobile ?? "",
      email: parent.email ?? "",
      autoSync: parent.autoSync ?? true,
    });
  }, [parent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!parent) return;
    if (!form.name.trim()) return toast.error("Name cannot be empty.");
    await update.mutateAsync({ accountId: parent.id, ...form, name: form.name.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!parent} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit parent details</DialogTitle>
          <DialogDescription>
            Changes apply to the portal login only. The student record is unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Mobile</Label>
              <Input
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setForm({ ...form, autoSync: !form.autoSync })}
            className="w-full flex items-start gap-2 rounded-lg border border-border p-2.5 text-left hover:bg-muted/60 transition-colors"
          >
            <span
              className={cn(
                "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5",
                form.autoSync ? "bg-accent border-accent" : "border-border",
              )}
            >
              {form.autoSync && <Check className="w-3 h-3 text-accent-foreground" />}
            </span>
            <span className="min-w-0">
              <span className="text-xs font-medium block">Keep in step with the student record</span>
              <span className="text-[11px] text-muted-foreground block">
                When on, correcting the guardian&apos;s details on the student profile updates this
                login automatically. Editing the fields above turns this off, so your correction is
                never overwritten.
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Link-child dialog ────────────────────────────────────────────────────────

const LinkChildDialog = ({
  parent,
  onOpenChange,
}: {
  parent: ParentAuthAccount | null;
  onOpenChange: (v: boolean) => void;
}) => {
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const link = useLinkChild();

  const submit = async () => {
    if (!parent || studentIds.length === 0) return;
    for (const studentId of studentIds) {
      await link.mutateAsync({ parentAccountId: parent.id, studentId });
    }
    setStudentIds([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!parent} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link another child</DialogTitle>
          <DialogDescription>
            {parent?.name} will see the added student immediately — no new login is needed.
          </DialogDescription>
        </DialogHeader>
        <StudentPicker
          selected={studentIds}
          onToggle={(id) =>
            setStudentIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={link.isPending || studentIds.length === 0}>
            {link.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Link {studentIds.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────

export const ParentAccountsPage = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { data: parents = [], isLoading, error } = useParentAccounts();
  const [addOpen, setAddOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<ParentAuthAccount | null>(null);
  const [editTarget, setEditTarget] = useState<ParentAuthAccount | null>(null);
  const [credentials, setCredentials] = useState<AccountVerifyResult | null>(null);
  const [lastSent, setLastSent] = useState<ParentAuthAccount | null>(null);
  const [resending, setResending] = useState(false);
  const [search, setSearch] = useState("");
  const probe = useProvisioningStatus();

  const reset = useResetAccountPassword();
  const setStatus = useSetAccountStatus();
  const unlink = useUnlinkChild();

  const canProvision = user?.role === "admin" || user?.role === "management";

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.mobile ?? "").includes(q) ||
        (p.loginEmail ?? "").toLowerCase().includes(q) ||
        p.children.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [parents, search]);

  /**
   * Reset the password AND redeliver it. A reset that only prints to screen
   * puts the office back on the phone; staff resetting a password almost
   * always want the parent to receive the new one.
   */
  const doReset = async (p: ParentAuthAccount) => {
    const res = await reset.mutateAsync({ subject: "parent", accountId: p.id });
    if (!res.ok) return;
    const deliveries = await parentCredentialsService.sendAll({
      parentName: p.name ?? "Parent",
      loginEmail: res.loginEmail ?? p.loginEmail ?? "",
      password: res.password ?? "",
      contactEmail: p.email,
      mobile: p.mobile,
      childNames: p.children.map((c) => c.name),
      parentAccountId: p.id,
      studentId: p.children[0]?.studentId,
    });
    setCredentials({ ...res, deliveries });
    setLastSent(p);
  };

  /** Re-send the credentials currently on screen, without rotating them. */
  const doResend = async () => {
    if (!credentials?.password || !lastSent) return;
    setResending(true);
    try {
      const deliveries = await parentCredentialsService.sendAll({
        parentName: lastSent.name ?? "Parent",
        loginEmail: credentials.loginEmail ?? "",
        password: credentials.password,
        contactEmail: lastSent.email,
        mobile: lastSent.mobile,
        childNames: lastSent.children.map((c) => c.name),
        parentAccountId: lastSent.id,
        studentId: lastSent.children[0]?.studentId,
      });
      setCredentials({ ...credentials, deliveries });
      toast.success("Credentials re-sent");
    } finally {
      setResending(false);
    }
  };

  const doUnlink = async (p: ParentAuthAccount, studentId: string, childName: string) => {
    const ok = await confirm({
      title: `Unlink ${childName}?`,
      description: `${p.name ?? "This parent"} will immediately lose access to ${childName}'s attendance, marks, fees and documents. This does not delete the student record.`,
      confirmText: "Unlink",
      type: "danger",
    });
    if (ok) await unlink.mutateAsync({ parentAccountId: p.id, studentId });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold flex items-center gap-2">
            <Users className="w-5 h-5" /> Parent accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Portal logins for parents and the children each can see.
          </p>
        </div>
        {canProvision && (
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" /> Add parent
          </Button>
        )}
      </div>

      {!canProvision && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Creating parent logins requires the <b>admin</b> or <b>management</b> role. You can
              view existing accounts here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Service reachability — surfaced BEFORE staff fill in a form, so a
          missing deployment is a banner rather than a failed submission. */}
      {probe.data && !probe.data.ok && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium">Parent accounts cannot be created right now</p>
              <p className="text-xs text-muted-foreground mt-0.5">{probe.data.message}</p>
              {probe.data.reason === "not_deployed" && (
                <code className="mt-1.5 block rounded bg-background border border-border px-2 py-1 text-[11px]">
                  supabase functions deploy student-parent-accounts
                </code>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {credentials && (
        <CredentialPanel
          result={credentials}
          onDismiss={() => {
            setCredentials(null);
            setLastSent(null);
          }}
          onResend={lastSent ? doResend : undefined}
          resending={resending}
        />
      )}

      {error && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Could not load parent accounts</p>
              <p className="text-xs text-muted-foreground">
                {(error as Error).message}. If the table is missing, apply
                <code className="mx-1">20260615_student_parent_auth.sql</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parent or child…"
          className="pl-8 h-9 text-sm"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {visible.length} parent account{visible.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!isLoading && visible.length === 0 && (
            <div className="py-8 text-center">
              <UserPlus className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">
                {search ? "No accounts match that search." : "No parent accounts yet."}
              </p>
              {!search && (
                <p className="text-xs text-muted-foreground mt-1">
                  Use “Add parent” to create the first one.
                </p>
              )}
            </div>
          )}

          <ul className="divide-y">
            {visible.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{p.name ?? "Unnamed parent"}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", STATUS_TONE[p.status] ?? "")}
                      >
                        {p.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[p.loginEmail, p.mobile].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                      {p.autoSync ? (
                        <>
                          <RefreshCw className="w-2.5 h-2.5" /> Syncing from student record
                        </>
                      ) : (
                        <>
                          <PencilOff className="w-2.5 h-2.5" /> Manually edited — sync off
                        </>
                      )}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.childrenError ? (
                        // NOT "no children" — we could not read them. Claiming
                        // the former sends staff to re-link an account that is
                        // already correct.
                        <span
                          className="text-[11px] text-muted-foreground inline-flex items-start gap-1"
                          title={p.childrenError}
                        >
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          Linked children could not be loaded — the list below is unknown, not
                          empty. Apply the pending student-profile migration and reload.
                        </span>
                      ) : p.children.length === 0 ? (
                        <span className="text-[11px] text-amber-600 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> No children linked — this parent
                          sees an empty portal
                        </span>
                      ) : (
                        p.children.map((c) => (
                          <span
                            key={c.studentId}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 pl-2.5 pr-1 py-0.5 text-[11px]"
                          >
                            {c.name}
                            <span className="text-muted-foreground">
                              {[c.className, c.section].filter(Boolean).join(" ")}
                            </span>
                            {canProvision && (
                              <button
                                onClick={() => doUnlink(p, c.studentId, c.name)}
                                className="ml-0.5 p-0.5 rounded hover:bg-red-500/15 hover:text-red-600 transition-colors"
                                aria-label={`Unlink ${c.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {canProvision && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setEditTarget(p)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setLinkTarget(p)}>
                        <Link2 className="w-3.5 h-3.5 mr-1" /> Link child
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reset.isPending}
                        onClick={() => doReset(p)}
                      >
                        {reset.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5 mr-1" />
                        )}
                        Reset password
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={setStatus.isPending}
                        onClick={() =>
                          setStatus.mutate({
                            subject: "parent",
                            accountId: p.id,
                            status: p.status === "active" ? "disabled" : "active",
                          })
                        }
                      >
                        {p.status === "active" ? (
                          <>
                            <ShieldOff className="w-3.5 h-3.5 mr-1" /> Disable
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Enable
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <AddParentFlow open={addOpen} onOpenChange={setAddOpen} onCreated={setCredentials} />
      <LinkChildDialog parent={linkTarget} onOpenChange={() => setLinkTarget(null)} />
      <EditParentDialog parent={editTarget} onOpenChange={() => setEditTarget(null)} />
    </div>
  );
};

export default ParentAccountsPage;
