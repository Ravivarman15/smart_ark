import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { useLeads } from "../hooks/useLeads";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { LeadPipelineBoard, LeadDetailDrawer } from "../components";

/** Drag-drop pipeline board. Managers/admins see all leads; counselors own only. */
const LeadPipelinePage = () => {
  const { user } = useAuth();
  const { canDo } = useCanDo();
  const viewAll = canDo("lead.reassign");
  const { data: list } = useLeads({
    assignedTo: viewAll ? "all" : user?.profileId,
    pageSize: 500,
  });
  const { data: staff = [] } = useStaffOptions();
  const staffName = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? (map.get(id) ?? "Assigned") : "—");
  }, [staff]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Lead Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Drag leads across stages. Every move logs an activity and updates analytics live.
        </p>
      </div>
      <LeadPipelineBoard leads={list?.rows ?? []} onOpen={setOpenId} staffName={staffName} />
      <LeadDetailDrawer leadId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  );
};

export default LeadPipelinePage;
