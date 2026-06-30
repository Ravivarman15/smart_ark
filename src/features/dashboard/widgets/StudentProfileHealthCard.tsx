import { Bus, HeartPulse, Home, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentProfileHealth } from "@/features/students/hooks/useStudentProfileHealth";

/**
 * Student profile-completeness + logistics tile. Reuses the shared
 * `studentProfileHealthService` aggregation: how many active students require
 * Transport / Hostel (and await assignment) and how many are missing the new
 * foundation fields (emergency contact, blood group, communication preference).
 */
export const StudentProfileHealthCard = () => {
  const { data, isLoading, error } = useStudentProfileHealth();

  if (error) {
    return <p className="text-xs text-rose-600">Failed to load profile health</p>;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-32 w-full" />;
  }

  const logistics: { label: string; value: number; sub: string; icon: React.ReactNode; tone: string }[] = [
    {
      label: "Need Transport",
      value: data.requiringTransport,
      sub: `${data.transportUnassigned} unassigned`,
      icon: <Bus className="w-4 h-4" />,
      tone: "text-sky-600",
    },
    {
      label: "Need Hostel",
      value: data.requiringHostel,
      sub: `${data.hostelUnassigned} unassigned`,
      icon: <Home className="w-4 h-4" />,
      tone: "text-violet-600",
    },
  ];

  const missing: { label: string; value: number; pct: number }[] = [
    { label: "Emergency Contact", value: data.missingEmergencyContact, pct: data.pct.emergencyContact },
    { label: "Blood Group", value: data.missingBloodGroup, pct: data.pct.bloodGroup },
    { label: "Comm. Preference", value: data.missingCommunicationPreference, pct: data.pct.communicationPreference },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center gap-2">
        <span className="flex w-7 h-7 items-center justify-center rounded-md bg-rose-500/10 text-rose-600">
          <HeartPulse className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Student Profile Health</h3>
          <p className="text-[11px] text-muted-foreground">{data.total} active students</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {logistics.map((c) => (
          <div key={c.label} className="rounded-md border border-border/60 bg-muted/30 p-2">
            <div className={`flex items-center gap-1.5 ${c.tone}`}>
              {c.icon}
              <span className="text-lg font-semibold">{c.value}</span>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
            <p className="text-[10px] text-amber-600">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-1.5">
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <ShieldAlert className="w-3 h-3" /> Missing data
        </p>
        {missing.map((m) => (
          <div key={m.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{m.label}</span>
            <span className="font-medium text-foreground">
              {m.value} <span className="text-[10px] text-muted-foreground">({m.pct}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
