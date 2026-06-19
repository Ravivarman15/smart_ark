import { useMemo, useState } from "react";
import { useDemos } from "../hooks/useDemosAdmissions";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { LeadDetailDrawer } from "../components";

const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Demo classes board — faculty + counselors see upcoming demos (next 30 days). */
const LeadDemosPage = () => {
  const range = useMemo(() => {
    const from = startOfWeek();
    const to = new Date(from);
    to.setDate(to.getDate() + 30);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const { data: demos = [] } = useDemos(range);
  const { data: staff = [] } = useStaffOptions();
  const facultyName = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [staff]);
  const [openLead, setOpenLead] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Demo Classes</h1>
        <p className="text-sm text-muted-foreground">Scheduled demos over the next 30 days.</p>
      </div>

      {demos.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-muted-foreground">No demos scheduled.</div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Faculty</th>
                <th className="px-3 py-2 font-medium">Batch</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setOpenLead(d.leadId)}
                  className="cursor-pointer border-b border-border/30 transition hover:bg-accent/10"
                >
                  <td className="px-3 py-2">{new Date(d.scheduledAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{facultyName(d.facultyId)}</td>
                  <td className="px-3 py-2">{d.batch ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{d.mode}</td>
                  <td className="px-3 py-2 capitalize">{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeadDetailDrawer leadId={openLead} open={!!openLead} onOpenChange={(v) => !v && setOpenLead(null)} />
    </div>
  );
};

export default LeadDemosPage;
