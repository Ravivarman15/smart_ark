import { useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionGuard } from "@/features/rbac/components/ActionGuard";
import {
  useLead,
  useLeadActivities,
  useLeadFollowups,
  useLeadNotes,
} from "../hooks/useLeads";
import {
  useAssignLead,
  useScheduleDemo,
  useConvertAdmission,
  useCompleteFollowup,
  useAddLeadNote,
} from "../hooks/useLeadMutations";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { LeadStatusBadge, LeadScoreBadge } from "./LeadBadges";

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");

export const LeadDetailDrawer = ({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const { data: lead } = useLead(leadId ?? undefined);
  const { data: activities = [] } = useLeadActivities(leadId ?? undefined);
  const { data: followups = [] } = useLeadFollowups(leadId ?? undefined);
  const { data: notes = [] } = useLeadNotes(leadId ?? undefined);
  const { data: staff = [] } = useStaffOptions();

  const assign = useAssignLead();
  const scheduleDemo = useScheduleDemo();
  const convert = useConvertAdmission();
  const completeFollowup = useCompleteFollowup();
  const addNote = useAddLeadNote();

  const [note, setNote] = useState("");
  const [demoAt, setDemoAt] = useState("");
  const [demoFaculty, setDemoFaculty] = useState("");
  const [fee, setFee] = useState("");
  const [scholarship, setScholarship] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "partial" | "paid">("pending");

  if (!lead) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg" />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {lead.studentName}
            <LeadStatusBadge status={lead.status} />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LeadScoreBadge score={lead.score} category={lead.scoreCategory} />
          {lead.isOverdue && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-600">overdue</span>
          )}
          {lead.slaBreached && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-600">SLA breached</span>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-muted-foreground">Parent</dt><dd>{lead.parentName ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Phone</dt><dd>{lead.phone ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt><dd className="truncate">{lead.email ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Course</dt><dd>{lead.course ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Source</dt><dd className="capitalize">{lead.source.replace("_", " ")}</dd></div>
          <div><dt className="text-muted-foreground">First response</dt><dd>{fmt(lead.firstResponseAt)}</dd></div>
        </dl>

        {/* Assign */}
        <ActionGuard action="lead.assign">
          <div className="mt-4 grid gap-1.5">
            <Label>Assign counselor</Label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={lead.assignedTo ?? ""}
              onChange={(e) =>
                assign.mutate(
                  { lead, counselorId: e.target.value },
                  { onSuccess: () => toast.success("Lead reassigned"), onError: (err) => toast.error(err.message) },
                )
              }
            >
              <option value="">— Unassigned —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
          </div>
        </ActionGuard>

        <Tabs defaultValue="activity" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="followups">Follow-ups</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-3 space-y-2">
            {activities.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
            {activities.map((a) => (
              <div key={a.id} className="rounded-md border border-border/50 p-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium capitalize">{a.type.replace("_", " ")}</span>
                  <span className="text-muted-foreground">{fmt(a.createdAt)}</span>
                </div>
                {a.detail && <p className="mt-0.5 text-muted-foreground">{a.detail}</p>}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="followups" className="mt-3 space-y-2">
            {followups.length === 0 && <p className="text-xs text-muted-foreground">No follow-ups.</p>}
            {followups.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-md border border-border/50 p-2 text-xs">
                <div>
                  <span className="font-medium">Due {fmt(f.dueAt)}</span>
                  <span className="ml-2 capitalize text-muted-foreground">{f.status}</span>
                </div>
                {f.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      completeFollowup.mutate(
                        { lead, followupId: f.id },
                        { onSuccess: () => toast.success("Follow-up completed"), onError: (e) => toast.error(e.message) },
                      )
                    }
                  >
                    Mark done
                  </Button>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="notes" className="mt-3 space-y-2">
            <div className="flex gap-2">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
              <Button
                onClick={() =>
                  note.trim() &&
                  addNote.mutate(
                    { leadId: lead.id, note: note.trim() },
                    { onSuccess: () => { setNote(""); toast.success("Note added"); } },
                  )
                }
              >
                Add
              </Button>
            </div>
            {notes.map((nt) => (
              <div key={nt.id} className="rounded-md border border-border/50 p-2 text-xs">
                <p>{nt.note}</p>
                <p className="mt-0.5 text-muted-foreground">{fmt(nt.createdAt)}</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="actions" className="mt-3 space-y-4">
            <ActionGuard action="lead.schedule_demo">
              <div className="space-y-2 rounded-md border border-border/50 p-3">
                <p className="text-sm font-semibold">Schedule demo</p>
                <Input type="datetime-local" value={demoAt} onChange={(e) => setDemoAt(e.target.value)} />
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={demoFaculty}
                  onChange={(e) => setDemoFaculty(e.target.value)}
                >
                  <option value="">Select faculty…</option>
                  {staff.filter((s) => s.role === "teacher").map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!demoAt}
                  onClick={() =>
                    scheduleDemo.mutate(
                      { lead, scheduledAt: new Date(demoAt).toISOString(), facultyId: demoFaculty || undefined },
                      { onSuccess: () => { setDemoAt(""); toast.success("Demo scheduled & WhatsApp queued"); }, onError: (e) => toast.error(e.message) },
                    )
                  }
                >
                  Schedule
                </Button>
              </div>
            </ActionGuard>

            <ActionGuard action="lead.convert">
              <div className="space-y-2 rounded-md border border-border/50 p-3">
                <p className="text-sm font-semibold">Convert to admission</p>
                <Input type="number" placeholder="Fee amount (₹)" value={fee} onChange={(e) => setFee(e.target.value)} />
                <Input type="number" placeholder="Scholarship amount (₹)" value={scholarship} onChange={(e) => setScholarship(e.target.value)} />
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as "pending" | "partial" | "paid")}
                >
                  <option value="pending">Payment: Pending</option>
                  <option value="partial">Payment: Partial</option>
                  <option value="paid">Payment: Paid</option>
                </select>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() =>
                    convert.mutate(
                      {
                        lead,
                        feeAmount: fee ? Number(fee) : undefined,
                        scholarshipAmount: scholarship ? Number(scholarship) : undefined,
                        paymentStatus,
                      },
                      {
                        onSuccess: () => {
                          setFee(""); setScholarship(""); setPaymentStatus("pending");
                          toast.success("Admission confirmed 🎉");
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  Confirm admission
                </Button>
              </div>
            </ActionGuard>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
