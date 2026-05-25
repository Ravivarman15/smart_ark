import { Bug, Lightbulb, MessageSquareHeart, Star, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { friendlyDateTime } from "../utils/helpCalc";
import type { FeedbackKind, FeedbackStatus, SupportFeedback } from "../types/help.types";

interface Props {
  feedback: SupportFeedback;
  voted: boolean;
  canVote: boolean;
  onToggleVote?: () => void;
  managerActions?: React.ReactNode;
}

const KIND_META: Record<
  FeedbackKind,
  { label: string; icon: typeof Lightbulb; tone: string }
> = {
  suggestion: { label: "Suggestion", icon: Lightbulb, tone: "bg-amber-50 text-amber-700 border-amber-200" },
  bug: { label: "Bug report", icon: Bug, tone: "bg-rose-50 text-rose-700 border-rose-200" },
  praise: { label: "Praise", icon: MessageSquareHeart, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  complaint: { label: "Complaint", icon: MessageSquareHeart, tone: "bg-orange-50 text-orange-700 border-orange-200" },
  nps: { label: "NPS", icon: Star, tone: "bg-violet-50 text-violet-700 border-violet-200" },
};

const STATUS_TONE: Record<FeedbackStatus, string> = {
  received: "bg-slate-100 text-slate-700 border-slate-200",
  reviewing: "bg-sky-100 text-sky-700 border-sky-200",
  planned: "bg-violet-100 text-violet-700 border-violet-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  shipped: "bg-emerald-100 text-emerald-700 border-emerald-200",
  declined: "bg-rose-100 text-rose-700 border-rose-200",
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  received: "Received",
  reviewing: "Reviewing",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

export const FeedbackCard = ({
  feedback,
  voted,
  canVote,
  onToggleVote,
  managerActions,
}: Props) => {
  const meta = KIND_META[feedback.kind];
  const Icon = meta.icon;
  return (
    <Card className="p-4 flex gap-3">
      <button
        type="button"
        className={`flex flex-col items-center justify-center min-w-[60px] rounded-md border px-2 py-2 ${
          voted
            ? "bg-emerald-50 border-emerald-300 text-emerald-700"
            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
        } ${!canVote ? "cursor-default opacity-70" : ""}`}
        onClick={canVote ? onToggleVote : undefined}
        disabled={!canVote}
        aria-label={voted ? "Remove vote" : "Vote"}
      >
        <ThumbsUp className="w-4 h-4" />
        <span className="text-sm font-semibold">{feedback.votesCount}</span>
      </button>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={meta.tone}>
            <Icon className="w-3 h-3 mr-1" />
            {meta.label}
          </Badge>
          <Badge variant="outline" className={STATUS_TONE[feedback.status]}>
            {STATUS_LABEL[feedback.status]}
          </Badge>
          {feedback.module && (
            <Badge variant="outline" className="text-xs">
              {feedback.module}
            </Badge>
          )}
          {feedback.kind === "nps" && typeof feedback.score === "number" && (
            <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
              Score {feedback.score}
            </Badge>
          )}
        </div>
        {feedback.title && (
          <h3 className="font-semibold text-foreground">{feedback.title}</h3>
        )}
        {feedback.body && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {feedback.body}
          </p>
        )}
        {feedback.managerReply && (
          <div className="text-sm bg-sky-50 border border-sky-200 rounded p-2">
            <div className="text-xs font-semibold text-sky-700 mb-1">Management reply</div>
            <div className="whitespace-pre-wrap text-foreground">
              {feedback.managerReply}
            </div>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {feedback.isAnonymous ? "Anonymous" : feedback.requesterName ?? "—"} ·{" "}
          {friendlyDateTime(feedback.createdAt)}
        </div>
        {managerActions && <div className="pt-1">{managerActions}</div>}
      </div>
    </Card>
  );
};
