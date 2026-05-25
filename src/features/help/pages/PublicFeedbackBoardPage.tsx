import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Filter, Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { FeedbackCard, HelpPageShell } from "../components";
import {
  useFeedbackList,
  useSetFeedbackStatus,
  useToggleFeedbackVote,
  useUserVotes,
} from "../hooks";
import type { FeedbackKind, FeedbackStatus } from "../types/help.types";

const baseFeedbackNew = (role?: string): string => {
  if (role === "admin") return "/admin/help/feedback/new";
  if (role === "management") return "/management/help/feedback/new";
  if (role === "coordinator") return "/coordinator/help/feedback/new";
  return "/teacher/help/feedback/new";
};

const KIND_OPTIONS: Array<{ value: FeedbackKind | "all"; label: string }> = [
  { value: "all", label: "All kinds" },
  { value: "suggestion", label: "Suggestions" },
  { value: "bug", label: "Bugs" },
  { value: "praise", label: "Praise" },
  { value: "complaint", label: "Complaints" },
  { value: "nps", label: "NPS scores" },
];

const STATUS_OPTIONS: Array<{ value: FeedbackStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "received", label: "Received" },
  { value: "reviewing", label: "Reviewing" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "shipped", label: "Shipped" },
  { value: "declined", label: "Declined" },
];

export const PublicFeedbackBoardPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<FeedbackKind | "all">("all");
  const [status, setStatus] = useState<FeedbackStatus | "all">("all");

  const list = useFeedbackList({ publicOnly: true, kind, status });
  const userVotes = useUserVotes();
  const toggleVote = useToggleFeedbackVote();
  const setFbStatus = useSetFeedbackStatus();

  const votedSet = useMemo(
    () => new Set(userVotes.data ?? []),
    [userVotes.data],
  );
  const isManager = user?.role === "admin" || user?.role === "management";

  return (
    <HelpPageShell
      title="Public feedback board"
      description="Upvote ideas you love. Watch what's planned, in progress and shipped."
      icon={<Megaphone className="w-5 h-5" />}
      toolbar={
        <Button onClick={() => navigate(baseFeedbackNew(user?.role))}>
          <Plus className="w-4 h-4 mr-2" />
          Share feedback
        </Button>
      }
    >
      <Card className="p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {list.isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">Loading…</Card>
      ) : !list.data?.length ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nothing here yet. Be the first to share an idea!
        </Card>
      ) : (
        <div className="space-y-3">
          {list.data.map((f) => (
            <FeedbackCard
              key={f.id}
              feedback={f}
              voted={votedSet.has(f.id)}
              canVote={!!user?.profileId}
              onToggleVote={async () => {
                await toggleVote.mutateAsync({
                  feedbackId: f.id,
                  voted: votedSet.has(f.id),
                });
              }}
              managerActions={
                isManager ? (
                  <Select
                    value={f.status}
                    onValueChange={async (v) => {
                      await setFbStatus.mutateAsync({
                        id: f.id,
                        input: { status: v as FeedbackStatus },
                      });
                      toast({ title: `Status → ${v}` });
                    }}
                  >
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </HelpPageShell>
  );
};

export default PublicFeedbackBoardPage;
