import { ShieldCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { usePendingApprovals } from "../hooks/usePendingApprovals";

// Each row links to the matching queue page so the widget doubles as a
// shortcut. Paths assume the management portal (/management/...) — when the
// admin dashboard renders this, the layout config supplies its own paths.
interface Row {
  label: string;
  count: number;
  to: string;
}

interface Props {
  /**
   * URL prefix for "go to queue" links. Defaults to /management because the
   * widget is most-used by management; admin layouts pass /admin instead.
   */
  basePath?: string;
}

export const PendingApprovalCard = ({ basePath }: Props) => {
  const location = useLocation();
  const determinedBasePath = basePath ?? (location.pathname.startsWith("/admin") ? "/admin" : "/management");
  const checkinsPath = determinedBasePath === "/admin" ? "/admin/teacher-checkins" : "/management/staff-attendance";
  const { data, isLoading, error } = usePendingApprovals();

  if (error) return <p className="text-xs text-rose-600">Failed to load approvals</p>;
  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;

  const rows: Row[] = [
    { label: "Admissions", count: data.pendingAdmissions, to: `${determinedBasePath}/enquiries` },
    { label: "Leave Requests", count: data.pendingLeaves, to: `${determinedBasePath}/leave-management` },
    { label: "Check-ins", count: data.pendingCheckIns, to: checkinsPath },
    { label: "Check-outs", count: data.pendingCheckOuts, to: checkinsPath },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex w-7 h-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Pending Approvals</h3>
            <p className="text-[11px] text-muted-foreground">Items waiting on you</p>
          </div>
        </div>
        <p className="text-2xl font-display font-semibold text-foreground">{data.total}</p>
      </header>

      <ul className="divide-y divide-border/50">
        {rows.map((r) => (
          <li key={r.label}>
            <Link
              to={r.to}
              className="flex items-center justify-between py-1.5 text-sm hover:text-accent transition-colors"
            >
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`font-semibold ${r.count > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                {r.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
