import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { History, Plus, Star, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  HelpPageShell,
  TicketTable,
  TicketStatusPill,
  PriorityChip,
  SlaIndicator,
  TicketMessageThread,
  AttachmentManager,
} from "../components";
import {
  useDeleteTicketAttachment,
  useReopenTicket,
  useSendTicketMessage,
  useSubmitSatisfaction,
  useTicket,
  useTicketAttachments,
  useTicketMessages,
  useTickets,
  useUploadTicketAttachment,
} from "../hooks";
import { friendlyDateTime } from "../utils/helpCalc";
import type { TicketStatus } from "../types/help.types";

const baseRequestPath = (role?: string): string => {
  if (role === "admin") return "/admin/help/new";
  if (role === "management") return "/management/help/new";
  if (role === "coordinator") return "/coordinator/help/new";
  return "/teacher/help/new";
};

const baseHistoryPath = (role?: string): string => {
  if (role === "admin") return "/admin/help/history";
  if (role === "management") return "/management/help/history";
  if (role === "coordinator") return "/coordinator/help/history";
  return "/teacher/help/history";
};

const RatingStars = ({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) => (
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        disabled={disabled}
        onClick={() => onChange(n)}
        aria-label={`${n} stars`}
        className={`w-7 h-7 inline-flex items-center justify-center transition ${
          n <= value ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
        }`}
      >
        <Star className="w-5 h-5" fill={n <= value ? "currentColor" : "none"} />
      </button>
    ))}
  </div>
);

export const SupportHistoryPage = () => {
  const { user } = useAuth();
  const { id } = useParams<{ id?: string }>();
  if (id) return <TicketDetail id={id} />;

  const [tab, setTab] = useState<TicketStatus | "all">("all");
  const tickets = useTickets({
    requesterProfileId: user?.profileId,
    status: tab,
    limit: 200,
  });
  const list = tickets.data ?? [];

  return (
    <HelpPageShell
      title="My support history"
      description="Every request you've raised, with status, response time and resolution."
      icon={<History className="w-5 h-5" />}
      toolbar={
        <Button asChild>
          <Link to={baseRequestPath(user?.role)}>
            <Plus className="w-4 h-4 mr-2" />
            New request
          </Link>
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="waiting_user">Waiting on you</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {tickets.isLoading ? (
            <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
          ) : (
            <TicketTable
              tickets={list}
              baseDetailPath={baseHistoryPath(user?.role)}
              emptyTitle="No tickets yet"
              emptyHint="When you raise a request it will appear here."
            />
          )}
        </TabsContent>
      </Tabs>
    </HelpPageShell>
  );
};

const TicketDetail = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const ticket = useTicket(id);
  const messages = useTicketMessages(id);
  const attachments = useTicketAttachments(id);
  const sendMessage = useSendTicketMessage();
  const upload = useUploadTicketAttachment();
  const remove = useDeleteTicketAttachment();
  const reopen = useReopenTicket();
  const satisfaction = useSubmitSatisfaction();

  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");

  const t = ticket.data;
  const canPostInternal = useMemo(
    () =>
      user?.role === "admin" ||
      user?.role === "management" ||
      user?.role === "coordinator",
    [user?.role],
  );
  const isOwner = !!(user?.profileId && t?.requesterProfileId === user.profileId);

  if (ticket.isLoading) {
    return (
      <HelpPageShell title="Loading…" icon={<History className="w-5 h-5" />}>
        <Card className="p-8 text-center">Loading…</Card>
      </HelpPageShell>
    );
  }
  if (!t) {
    return (
      <HelpPageShell
        title="Ticket not found"
        icon={<History className="w-5 h-5" />}
        backTo={baseHistoryPath(user?.role)}
      >
        <Card className="p-8 text-center text-muted-foreground">
          This ticket no longer exists or has been deleted.
        </Card>
      </HelpPageShell>
    );
  }

  const submitSatisfaction = async () => {
    if (rating < 1) {
      toast({ title: "Pick a rating between 1 and 5", variant: "destructive" });
      return;
    }
    await satisfaction.mutateAsync({ id: t.id, rating, comment: comment.trim() || undefined });
    toast({ title: "Thanks for your feedback!" });
    setRating(0);
    setComment("");
  };

  return (
    <HelpPageShell
      title={`#${t.ticketNo ?? "—"} · ${t.subject}`}
      description={`Raised ${friendlyDateTime(t.createdAt)}${t.requesterName ? ` by ${t.requesterName}` : ""}`}
      icon={<History className="w-5 h-5" />}
      backTo={baseHistoryPath(user?.role)}
      toolbar={
        <div className="flex items-center gap-2">
          <TicketStatusPill status={t.status} />
          <PriorityChip priority={t.priority} />
          {(t.status === "resolved" || t.status === "closed") && isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await reopen.mutateAsync(t.id);
                toast({ title: "Ticket reopened" });
              }}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reopen
            </Button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          {t.description && (
            <Card className="p-4 whitespace-pre-wrap text-sm">{t.description}</Card>
          )}

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Conversation</h3>
            <TicketMessageThread
              messages={messages.data ?? []}
              canPostInternalNote={canPostInternal}
              disabled={t.status === "closed" || t.status === "cancelled"}
              onSend={async ({ body, isInternal }) => {
                await sendMessage.mutateAsync({
                  input: { ticketId: t.id, body, isInternal },
                });
              }}
            />
          </Card>

          {isOwner && (t.status === "resolved" || t.status === "closed") && !t.satisfactionAt && (
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Rate this resolution</h3>
              <RatingStars value={rating} onChange={setRating} disabled={satisfaction.isPending} />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Anything we did well or could have done better?"
                className="w-full border rounded-md p-2 text-sm"
              />
              <div className="flex justify-end">
                <Button onClick={submitSatisfaction} disabled={satisfaction.isPending}>
                  Submit rating
                </Button>
              </div>
            </Card>
          )}

          {t.satisfactionAt && (
            <Card className="p-4 bg-emerald-50 border-emerald-200">
              <div className="text-sm font-semibold text-emerald-800 mb-1">
                You rated this resolution {t.satisfactionRating ?? 0}/5
              </div>
              {t.satisfactionComment && (
                <p className="text-sm text-emerald-700">{t.satisfactionComment}</p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Status</h3>
            <SlaIndicator ticket={t} variant="first-response" />
            <SlaIndicator ticket={t} variant="resolution" />
            <div className="text-xs space-y-1 text-muted-foreground pt-2 border-t">
              <div>
                Assigned to:{" "}
                <span className="text-foreground">
                  {t.assignedToName ?? "Unassigned"}
                </span>
              </div>
              {t.firstResponseAt && (
                <div>First reply: {friendlyDateTime(t.firstResponseAt)}</div>
              )}
              {t.resolvedAt && <div>Resolved: {friendlyDateTime(t.resolvedAt)}</div>}
              {t.reopenCount > 0 && <div>Re-opened {t.reopenCount}×</div>}
            </div>
          </Card>

          <AttachmentManager
            attachments={attachments.data ?? []}
            canManage={isOwner || canPostInternal}
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
            {t.pagePath && <div>Page: {t.pagePath}</div>}
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto"
              onClick={() => navigate(baseHistoryPath(user?.role))}
            >
              ← Back to all tickets
            </Button>
          </Card>
        </div>
      </div>
    </HelpPageShell>
  );
};

export default SupportHistoryPage;
