import { EnquiryStatusBadge } from "./EnquiryStatusBadge";
import type { FollowupEntry } from "../types/enquiry.types";

interface Props {
  entries: FollowupEntry[] | undefined;
  emptyMessage?: string;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Vertical timeline of follow-up entries. Pure rendering — fetching is
 * the caller's job (use useFollowups + the AppDataContext history mirror
 * combined while the history table doesn't exist yet).
 */
export const FollowupTimeline = ({ entries, emptyMessage = "No follow-ups yet" }: Props) => {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-3">{emptyMessage}</p>;
  }

  return (
    <ol className="relative border-l border-border ml-2 space-y-4 pl-4 py-2">
      {entries.map((e, i) => (
        <li key={`${e.date}-${i}`} className="relative">
          <span className="absolute -left-[1.4rem] top-1.5 w-2 h-2 rounded-full bg-primary" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <time>{formatDate(e.date)}</time>
            <span aria-hidden>·</span>
            <span>{e.updatedBy}</span>
            <EnquiryStatusBadge status={e.status} />
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{e.notes}</p>
        </li>
      ))}
    </ol>
  );
};
