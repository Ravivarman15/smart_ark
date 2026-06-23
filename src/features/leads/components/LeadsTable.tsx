import type { Lead } from "../types/lead.types";
import { LeadStatusBadge, LeadScoreBadge } from "./LeadBadges";
import { LeadCard } from "./LeadCard";

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "—");

export const LeadsTable = ({
  leads,
  staffName,
  onOpen,
}: {
  leads: Lead[];
  staffName?: (id?: string) => string;
  onOpen: (id: string) => void;
}) => {
  if (leads.length === 0) {
    return (
      <div className="glass-card p-10 text-center text-sm text-muted-foreground">
        No leads match the current filters.
      </div>
    );
  }
  return (
    <>
      {/* Mobile: stacked cards (tables don't fit a phone). */}
      <div className="space-y-2 md:hidden">
        {leads.map((l) => (
          <LeadCard key={l.id} lead={l} onOpen={onOpen} staffName={staffName} />
        ))}
      </div>

      {/* Desktop: dense table. */}
      <div className="glass-card hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Student</th>
              <th className="px-3 py-2 font-medium">Course</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Counselor</th>
              <th className="px-3 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr
                key={l.id}
                onClick={() => onOpen(l.id)}
                className="cursor-pointer border-b border-border/30 transition hover:bg-accent/10"
              >
                <td className="px-3 py-2">
                  <div className="font-medium">{l.studentName}</div>
                  <div className="text-xs text-muted-foreground">{l.phone ?? l.parentName ?? "—"}</div>
                </td>
                <td className="px-3 py-2">{l.course ?? "—"}</td>
                <td className="px-3 py-2"><LeadScoreBadge score={l.score} category={l.scoreCategory} /></td>
                <td className="px-3 py-2"><LeadStatusBadge status={l.status} /></td>
                <td className="px-3 py-2 text-muted-foreground">
                  {l.assignedTo ? (staffName?.(l.assignedTo) ?? "Assigned") : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
