import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionGuard } from "@/features/rbac/components/ActionGuard";
import { useAdmissions } from "../hooks/useDemosAdmissions";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { exportAdmissionsCsv } from "../utils/leadExport";
import { LeadDetailDrawer } from "../components";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const LeadAdmissionsPage = () => {
  const { data: admissions = [] } = useAdmissions();
  const { data: staff = [] } = useStaffOptions();
  const counselorName = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [staff]);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const total = admissions.reduce((a, r) => a + r.feeAmount, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Lead Admissions</h1>
          <p className="text-sm text-muted-foreground">
            {admissions.length} admissions · {inr(total)} total fees
          </p>
        </div>
        <ActionGuard action="lead.export">
          <Button variant="outline" onClick={() => exportAdmissionsCsv(admissions, counselorName)}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </ActionGuard>
      </div>

      {admissions.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-muted-foreground">No admissions yet.</div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Batch</th>
                <th className="px-3 py-2 font-medium">Counselor</th>
                <th className="px-3 py-2 font-medium">Fee</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {admissions.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setOpenLead(a.leadId)}
                  className="cursor-pointer border-b border-border/30 transition hover:bg-accent/10"
                >
                  <td className="px-3 py-2">{new Date(a.admissionDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{a.course ?? "—"}</td>
                  <td className="px-3 py-2">{a.batch ?? "—"}</td>
                  <td className="px-3 py-2">{counselorName(a.counselorId)}</td>
                  <td className="px-3 py-2">{inr(a.feeAmount)}</td>
                  <td className="px-3 py-2 capitalize">{a.status}</td>
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

export default LeadAdmissionsPage;
