import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Inbox, KanbanSquare, ListChecks, UserPlus, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  AssignmentDialog,
  AttachmentManager,
  HelpPageShell,
  PriorityChip,
  SlaIndicator,
  TicketKanban,
  TicketMessageThread,
  TicketStatusPill,
  TicketTable,
} from "../components";
import {
  useAssignTicket,
  useDeleteTicketAttachment,
  useSendTicketMessage,
  useSetTicketStatus,
  useTicket,
  useTicketAttachments,
  useTicketMessages,
  useTickets,
  useUploadTicketAttachment,
} from "../hooks";
import { friendlyDateTime, TICKET_STATUSES } from "../utils/helpCalc";
import type { TicketStatus } from "../types/help.types";

const baseTriagePath = (role?: string): string => {
  if (role === "management") return "/management/help/triage";
  if (role === "admin") return "/admin/help/triage";
  return "/coordinator/help/triage";
};

export const ManagementTriagePage = () => {
  const { user } = useAuth();
  const { id } = useParams<{ id?: string }>();
  if (id) return <TriageDetail id={id} />;

  const [tab, setTab] = useState<"kanban" | "list">("kanban");
  const tickets = useTickets({ status: "open_only", limit: 500 });
  const allTickets = useTickets({ status: "all", limit: 500 });
  const list = tab === "kanban" ? tickets.data ?? [] : allTickets.data ?? [];

  return (
    <HelpPageShell
      title="Triage inbox"
      description="Every ticket across the org. Assign, prioritise, resolve."
      icon={<Inbox className="w-5 h-5" />}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="kanban">
            <KanbanSquare className="w-4 h-4 mr-1" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="list">
            <ListChecks className="w-4 h-4 mr-1" /> List
          </TabsTrigger>
        </TabsList>
        <TabsContent value="kanban" className="mt-4">
          {tickets.isLoading ? (
            <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
          ) : (
            <TicketKanban tickets={list} baseDetailPath={baseTriagePath(user?.role)} />
          )}
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          {allTickets.isLoading ? (
            <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
          ) : (
            <TicketTable
              tickets={list}
              baseDetailPath={baseTriagePath(user?.role)}
              showRequester
            />
          )}
        </TabsContent>
      </Tabs>
    </HelpPageShell>
  );
};

const TriageDetail = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const ticket = useTicket(id);
  const messages = useTicketMessages(id);
  const attachments = useTicketAttachments(id);
  const sendMessage = useSendTicketMessage();
  const upload = useUploadTicketAttachment();
  const remove = useDeleteTicketAttachment();
  const assign = useAssignTicket();
  const setStatus = useSetTicketStatus();
  const [assignOpen, setAssignOpen] = useState(false);

  const t = ticket.data;
  if (ticket.isLoading) {
    return (
      <HelpPageShell title="Loading…" icon={<Inbox className="w-5 h-5" />}>
        <Card className="p-8 text-center">Loading…</Card>
      </HelpPageShell>
    );
  }
  if (!t) {
    return (
      <HelpPageShell
        title="Ticket not found"
        icon={<Inbox className="w-5 h-5" />}
        backTo={baseTriagePath(user?.role)}
      >
        <Card className="p-8 text-center text-muted-foreground">
          This ticket no longer exists.
        </Card>
      </HelpPageShell>
    );
  }

  return (
    <HelpPageShell
      title={`#${t.ticketNo ?? "—"} · ${t.subject}`}
      description={`From ${t.requesterName ?? "—"} (${t.requesterRole ?? "—"}) · ${friendlyDateTime(t.createdAt)}`}
      icon={<Inbox className="w-5 h-5" />}
      backTo={baseTriagePath(user?.role)}
      toolbar={
        <div className="flex items-center gap-2">
          <TicketStatusPill status={t.status} />
          <PriorityChip priority={t.priority} />
          <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1" />
            {t.assignedToName ? "Reassign" : "Assign"}
          </Button>
          <Select
            value={t.status}
            onValueChange={async (v) => {
              await setStatus.mutateAsync({ id: t.id, status: v as TicketStatus });
              toast({ title: `Status set to ${v}` });
            }}
          >
            <SelectTrigger className="w-44 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          {t.description && (
            <Card className="p-4 whitespace-pre-wrap text-sm">{t.description}</Card>
          )}

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Send className="w-4 h-4" /> Conversation
            </h3>
            <TicketMessageThread
              messages={messages.data ?? []}
              canPostInternalNote
              disabled={t.status === "closed" || t.status === "cancelled"}
              onSend={async ({ body, isInternal }) => {
                await sendMessage.mutateAsync({
                  input: { ticketId: t.id, body, isInternal },
                  kind: "agent",
                });
              }}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">SLA</h3>
            <SlaIndicator ticket={t} variant="first-response" />
            <SlaIndicator ticket={t} variant="resolution" />
            <div className="text-xs space-y-1 text-muted-foreground pt-2 border-t">
              <div>
                Owner:{" "}
                <span className="text-foreground">
                  {t.assignedToName ?? "Unassigned"}
                </span>
              </div>
              {t.firstResponseAt && <div>First reply: {friendlyDateTime(t.firstResponseAt)}</div>}
              {t.resolvedAt && <div>Resolved: {friendlyDateTime(t.resolvedAt)}</div>}
              {t.reopenCount > 0 && <div>Re-opened {t.reopenCount}×</div>}
              {t.satisfactionAt && (
                <div>
                  Rating: {t.satisfactionRating ?? 0}/5 — {friendlyDateTime(t.satisfactionAt)}
                </div>
              )}
            </div>
          </Card>

          <AttachmentManager
            attachments={attachments.data ?? []}
            canManage
            uploading={upload.isPending}
            onUpload={async (file) => {
              await upload.mutateAsync({ ticketId: t.id, file });
              toast({ title: "Attachment uploaded" });
            }}
            onRemove={async (aid) => {
              await remove.mutateAsync({ id: aid, ticketId: t.id });
            }}
          />

          <Card className="p-4 text-xs space-y-1 text-muted-foreground">
            <div>Category: {t.category.replace(/_/g, " ")}</div>
            <div>Requester: {t.requesterName ?? "—"}</div>
            {t.requesterEmail && <div>Email: {t.requesterEmail}</div>}
            {t.requesterPhone && <div>Phone: {t.requesterPhone}</div>}
            {t.pagePath && <div>Page: {t.pagePath}</div>}
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto"
              onClick={() => navigate(baseTriagePath(user?.role))}
            >
              ← Back to inbox
            </Button>
          </Card>
        </div>
      </div>

      <AssignmentDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        ticket={t}
        onAssign={async (input) => {
          await assign.mutateAsync({ id: t.id, input });
          toast({ title: "Assignment updated" });
        }}
      />
    </HelpPageShell>
  );
};

export default ManagementTriagePage;
