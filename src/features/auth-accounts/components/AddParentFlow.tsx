// ── Add Parent — student-first provisioning flow ─────────────────────────────
//
// Staff pick the STUDENT; the guardians are read off the student record. The
// institution captured father/mother/guardian details at admission, so asking
// someone to retype them is both wasted work and a fresh chance to introduce a
// typo that breaks credential delivery.
//
// Three steps: pick student → confirm the auto-filled guardian → done. Gaps in
// the record are surfaced in red BEFORE anything is created, separated into
// "blocks creation" and "worth knowing", because those demand different actions
// from staff.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Info,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useStudents } from "@/features/students/hooks";
import type { Student } from "@/features/students/types";
import {
  evaluateCandidate,
  extractParentCandidates,
  findExistingAccount,
  findSiblings,
  isValidMobile,
  normalizeMobile,
  preferredCandidate,
  type ParentCandidate,
} from "../utils/parentCandidates";
import { useLinkChild, useParentAccounts, useProvisionParent } from "../hooks/useAuthAccounts";
import { parentCredentialsService } from "../services/parentCredentials.service";
import type { AccountVerifyResult } from "../types/authAccounts.types";

// ── Gap display ──────────────────────────────────────────────────────────────

const GapList = ({
  items,
  tone,
}: {
  items: { label: string; why: string }[];
  tone: "blocking" | "advisory";
}) => {
  if (items.length === 0) return null;
  const blocking = tone === "blocking";
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        blocking ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold flex items-center gap-1.5 mb-1.5",
          blocking ? "text-red-600" : "text-amber-600",
        )}
      >
        {blocking ? <AlertTriangle className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
        {blocking
          ? `Missing — must be filled in before the account can be created (${items.length})`
          : `Missing — the account will still work (${items.length})`}
      </p>
      <ul className="space-y-1">
        {items.map((m) => (
          <li key={m.label} className="text-[11px] flex gap-1.5">
            <span className={cn("font-medium shrink-0", blocking ? "text-red-600" : "text-amber-600")}>
              {m.label}:
            </span>
            <span className="text-muted-foreground">{m.why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ── Step 1 — student picker ──────────────────────────────────────────────────

const StudentStep = ({ onPick }: { onPick: (s: Student) => void }) => {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useStudents({ search, pageSize: 25 });
  const rows = data?.rows ?? [];

  return (
    <div>
      <Label className="text-xs">Which student?</Label>
      <div className="relative mt-1 mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or admission number…"
          className="pl-8 h-9 text-sm"
        />
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        The parent&apos;s details are read from the student&apos;s record — you won&apos;t need to
        type them.
      </p>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y">
        {isLoading && <p className="p-3 text-xs text-muted-foreground">Searching…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            {search ? "No students match that search." : "Type to search for a student."}
          </p>
        )}
        {rows.map((s) => {
          const candidates = extractParentCandidates(s);
          const usable = candidates.filter((c) => c.canCreate).length;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className="w-full flex items-center gap-2 p-2.5 text-left text-xs hover:bg-muted/60 transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium block truncate">{s.name}</span>
                <span className="text-muted-foreground block truncate">
                  {[s.standardName, s.section, s.enrolmentNo].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              {usable === 0 ? (
                <Badge variant="outline" className="text-[10px] text-red-600 border-red-500/40 shrink-0">
                  No guardian on record
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {usable} guardian{usable === 1 ? "" : "s"}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Step 2 — confirm the auto-filled guardian ────────────────────────────────

const ConfirmStep = ({
  student,
  onBack,
  onDone,
}: {
  student: Student;
  onBack: () => void;
  onDone: (r: AccountVerifyResult) => void;
}) => {
  const candidates = useMemo(() => extractParentCandidates(student), [student]);
  const [role, setRole] = useState<string>(() => preferredCandidate(candidates)?.role ?? "father");

  const selected = candidates.find((c) => c.role === role) ?? candidates[0];

  // Editable copy, seeded from the record. Staff can correct a gap in place
  // rather than leaving the dialog to fix the student first — but the source of
  // truth stays the student record, which is why the corrected values are
  // written back to it on create (see below).
  const [form, setForm] = useState({ name: "", mobile: "", email: "" });
  useEffect(() => {
    setForm({ name: selected?.name ?? "", mobile: selected?.mobile ?? "", email: selected?.email ?? "" });
  }, [selected?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = useMemo(
    () => evaluateCandidate(form.name, form.mobile, form.email),
    [form.name, form.mobile, form.email],
  );

  // Sibling detection — one parent, many children, ONE login.
  const { data: allStudents } = useStudents({ pageSize: 500 });
  const siblings = useMemo(
    () => findSiblings(allStudents?.rows ?? [], form.mobile, student.id),
    [allStudents, form.mobile, student.id],
  );
  const [linkSiblings, setLinkSiblings] = useState<string[]>([]);
  useEffect(() => setLinkSiblings(siblings.map((s) => s.id)), [siblings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Duplicate detection — never create a second login for the same person.
  const { data: existingAccounts = [] } = useParentAccounts();
  const duplicate = useMemo(
    () => findExistingAccount(existingAccounts, form.mobile, form.email),
    [existingAccounts, form.mobile, form.email],
  );

  const provision = useProvisionParent();
  const link = useLinkChild();
  // Failures are shown INSIDE the dialog, not only as a toast. A toast that
  // scrolls away is why a failed provision read as "nothing happened".
  const [failure, setFailure] = useState<{
    text: string;
    reason?: string;
    detail?: Record<string, unknown>;
  } | null>(null);

  const create = async () => {
    if (!live.canCreate) return;
    setFailure(null);

    // Existing person → link the child to their account instead of minting a
    // duplicate. A second login for the same parent means two portals, two
    // passwords, and children split across both.
    if (duplicate) {
      await link.mutateAsync({
        parentAccountId: duplicate.id,
        studentId: student.id,
        relation: role,
        isPrimary: true,
      });
      for (const sid of linkSiblings) {
        await link.mutateAsync({ parentAccountId: duplicate.id, studentId: sid, relation: role });
      }
      toast.success(`Linked to ${duplicate.name ?? "the existing account"} — no duplicate created`);
      onDone({ ok: true, accountId: duplicate.id, loginEmail: duplicate.loginEmail });
      return;
    }

    const res = await provision.mutateAsync({
      name: form.name.trim(),
      mobile: form.mobile.trim() || undefined,
      email: form.email.trim() || undefined,
      studentIds: [student.id, ...linkSiblings],
      relation: role,
    });

    if (!res.ok) {
      // Defensive: never render a raw object. A non-string here is what showed
      // as a bare "{}" with no explanation of what went wrong.
      const text =
        typeof res.message === "string" && res.message.trim()
          ? res.message.trim()
          : "The account could not be created.";
      setFailure({ text, reason: res.reason, detail: res.detail });
      return;
    }

    // Auto-send the credentials, exactly as staff provisioning does. Delivery
    // is reported but never allowed to mask a successful creation — the
    // account exists and the password is on screen either way.
    const childNames = [
      student.name,
      ...siblings.filter((s) => linkSiblings.includes(s.id)).map((s) => s.name),
    ];
    const deliveries = await parentCredentialsService.sendAll({
      parentName: form.name.trim(),
      loginEmail: res.loginEmail ?? "",
      password: res.password ?? "",
      contactEmail: form.email.trim(),
      mobile: form.mobile.trim(),
      childNames,
      parentAccountId: res.accountId,
      studentId: student.id,
    });

    onDone({ ...res, deliveries });
  };

  const busy = provision.isPending || link.isPending;
  const blocking = live.missing.filter((m) => m.severity === "blocking");
  const advisory = live.missing.filter((m) => m.severity === "advisory");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5">
        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{student.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {[student.standardName, student.section, student.enrolmentNo].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Change
        </Button>
      </div>

      {/* Guardian slot chooser — shows what the record holds for each. */}
      <div>
        <Label className="text-xs">Which guardian gets the login?</Label>
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {candidates.map((c) => (
            <button
              key={c.role}
              type="button"
              onClick={() => setRole(c.role)}
              className={cn(
                "rounded-lg border p-2 text-left transition-colors",
                role === c.role
                  ? "border-accent bg-accent/10"
                  : "border-border hover:bg-muted/60",
              )}
            >
              <span className="text-[11px] font-medium block truncate">{c.roleLabel}</span>
              <span
                className={cn(
                  "text-[10px] block truncate",
                  c.isEmpty ? "text-red-600" : "text-muted-foreground",
                )}
              >
                {c.isEmpty ? "Nothing recorded" : c.name || "No name"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Auto-filled, editable. */}
      <div className="space-y-2">
        <div>
          <Label className="text-xs flex items-center gap-1.5">
            Name *
            {selected?.name && (
              <span className="text-[10px] font-normal text-emerald-600">from student record</span>
            )}
          </Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Not recorded — please enter"
            className={cn("h-9 text-sm", !form.name.trim() && "border-red-500/60")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Mobile</Label>
            <Input
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="Not recorded"
              className={cn(
                "h-9 text-sm",
                form.mobile && !isValidMobile(form.mobile) && "border-amber-500/60",
              )}
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Not recorded"
              className="h-9 text-sm"
            />
          </div>
        </div>
      </div>

      <GapList items={blocking} tone="blocking" />
      <GapList items={advisory} tone="advisory" />

      {failure && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
          <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" /> The account was not created
          </p>
          <p className="text-[11px] text-muted-foreground">{failure.text}</p>
          {failure.reason === "not_deployed" && (
            <code className="mt-1.5 block rounded bg-background border border-border px-2 py-1 text-[10px]">
              supabase functions deploy student-parent-accounts
            </code>
          )}
          {/* Raw server diagnostics. A failure that cannot be diagnosed without
              reading edge-function logs is a failure staff cannot resolve. */}
          {(failure.detail || failure.reason) && (
            <details className="mt-2">
              <summary className="text-[10px] text-muted-foreground/80 cursor-pointer select-none">
                Technical details ({failure.reason ?? "error"})
              </summary>
              <pre className="mt-1 rounded bg-background border border-border p-2 text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify({ reason: failure.reason, ...(failure.detail ?? {}) }, null, 2)}
              </pre>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      JSON.stringify({ reason: failure.reason, message: failure.text, ...(failure.detail ?? {}) }, null, 2),
                    )
                    .then(
                      () => toast.success("Diagnostics copied"),
                      () => toast.error("Could not copy"),
                    );
                }}
                className="mt-1 text-[10px] text-accent hover:underline"
              >
                Copy diagnostics
              </button>
            </details>
          )}
        </div>
      )}

      {duplicate && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-3">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 flex items-center gap-1.5 mb-1">
            <Info className="w-3.5 h-3.5" /> This person already has a login
          </p>
          <p className="text-[11px] text-muted-foreground">
            <b>{duplicate.name}</b> ({duplicate.mobile || duplicate.loginEmail}) is already
            registered. {student.name} will be added to that existing account instead of creating a
            second one.
          </p>
        </div>
      )}

      {siblings.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
            <Users className="w-3.5 h-3.5" /> Same mobile found on {siblings.length} other student
            {siblings.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-muted-foreground mb-2">
            Likely siblings. Tick to give this parent one login covering all of them.
          </p>
          <div className="space-y-1">
            {siblings.map((s) => {
              const on = linkSiblings.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setLinkSiblings((p) =>
                      p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id],
                    )
                  }
                  className="w-full flex items-center gap-2 text-left text-[11px] py-1"
                >
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                      on ? "bg-accent border-accent" : "border-border",
                    )}
                  >
                    {on && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
                  </span>
                  <span className="truncate">
                    {s.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {[s.standardName, s.section].filter(Boolean).join(" ") || "—"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-2.5">
        <p className="text-[11px] text-muted-foreground">
          Once created, this account stays in step with the student record automatically — correcting
          a mobile number on {student.name}&apos;s profile updates the login too, with no extra step.
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button onClick={create} disabled={busy || !live.canCreate}>
          {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {duplicate
            ? "Link to existing account"
            : `Create login${linkSiblings.length ? ` for ${linkSiblings.length + 1} children` : ""}`}
        </Button>
      </DialogFooter>
    </div>
  );
};

// ── Dialog shell ─────────────────────────────────────────────────────────────

export const AddParentFlow = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (r: AccountVerifyResult) => void;
}) => {
  const [student, setStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (!open) setStudent(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add parent account</DialogTitle>
          <DialogDescription>
            {student
              ? "Details are filled in from the student record. Confirm or correct, then create."
              : "Pick the student — the parent's details come from their record automatically."}
          </DialogDescription>
        </DialogHeader>

        {student ? (
          <ConfirmStep
            student={student}
            onBack={() => setStudent(null)}
            onDone={(r) => {
              onCreated(r);
              onOpenChange(false);
            }}
          />
        ) : (
          <StudentStep onPick={setStudent} />
        )}
      </DialogContent>
    </Dialog>
  );
};

export { normalizeMobile };
export type { ParentCandidate };
