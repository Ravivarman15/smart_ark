import { useMemo } from "react";
import {
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  LogIn,
  Mail,
  MapPin,
  Phone,
  Shield,
  UserSquare2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACTION_DEFS,
  MODULE_KEYS,
  MODULE_LABELS,
} from "@/contexts/StaffRightsContext";
import { useUserPermissions } from "../hooks/useUserPermissions";
import { useOnboardingEvents } from "../hooks/useOnboarding";
import { useAttendance } from "../hooks/useAttendance";
import type { Staff } from "../types/staff.types";
import { StaffAvatar } from "./StaffAvatar";
import { StaffStatusChip } from "./StaffStatusChip";
import { OnboardingStatusBadge } from "./OnboardingStatusBadge";
import { StaffOnboardingTimeline } from "./StaffOnboardingTimeline";

interface Props {
  staff: Staff | null;
  onOpenChange: (open: boolean) => void;
}

// ── Small presentational helpers ─────────────────────────────────────────────
const DetailRow = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value?: React.ReactNode;
}) => (
  <div className="flex items-start gap-2.5 py-1.5">
    <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground break-words">{value ?? "—"}</p>
    </div>
  </div>
);

const StatCard = ({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) => (
  <div className="rounded-lg border border-border/60 bg-card/60 p-3">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className={`text-xl font-display font-semibold mt-1 ${tone}`}>{value}</p>
  </div>
);

const formatDate = (iso?: string): string => {
  if (!iso) return "—";
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

const daysAgoISO = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];

// ── Tab: Access ──────────────────────────────────────────────────────────────
const AccessTab = ({ staff }: { staff: Staff }) => {
  const { data, isLoading } = useUserPermissions(staff.id);

  const summary = useMemo(() => {
    const modules = data?.modules ?? {};
    const actions = data?.actions ?? {};
    const visible = MODULE_KEYS.filter((k) => modules[k] !== false);
    const hidden = MODULE_KEYS.filter((k) => modules[k] === false);
    const deniedActions = ACTION_DEFS.filter((a) => actions[a.key] === false);
    const configured =
      Object.keys(modules).length > 0 || Object.keys(actions).length > 0;
    return { visible, hidden, deniedActions, configured };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <DetailRow
        icon={Shield}
        label="Role"
        value={<span className="capitalize">{staff.role}</span>}
      />

      {!summary.configured && (
        <p className="text-xs text-muted-foreground rounded-md bg-muted/40 p-2.5">
          No custom restrictions — this staff member has full access for their
          role.
        </p>
      )}

      <div>
        <p className="text-xs font-semibold text-foreground mb-1.5">
          Visible modules ({summary.visible.length}/{MODULE_KEYS.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {summary.visible.map((k) => (
            <span
              key={k}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
            >
              {MODULE_LABELS[k]}
            </span>
          ))}
          {summary.hidden.map((k) => (
            <span
              key={k}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-muted text-muted-foreground border border-border/50 line-through"
            >
              {MODULE_LABELS[k]}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground mb-1.5">
          Action permissions
        </p>
        {summary.deniedActions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            All actions allowed.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {summary.deniedActions.map((a) => (
              <span
                key={a.key}
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-rose-500/10 text-rose-600 border border-rose-500/20"
              >
                {a.label} denied
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Tab: Onboarding ──────────────────────────────────────────────────────────
const OnboardingTab = ({ staff }: { staff: Staff }) => {
  const { data: events = [], isLoading } = useOnboardingEvents(staff.id);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <OnboardingStatusBadge
          status={staff.onboardingStatus}
          emailStatus={staff.inviteEmailStatus}
        />
        {staff.inviteEmailError && (
          <span className="text-[11px] text-rose-600 truncate">
            {staff.inviteEmailError}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DetailRow
          icon={CalendarClock}
          label="Invite sent"
          value={formatDate(staff.inviteSentAt)}
        />
        <DetailRow
          icon={CheckCircle2}
          label="Onboarding completed"
          value={formatDate(staff.onboardingCompletedAt)}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground mb-2">
          Onboarding activity
        </p>
        <StaffOnboardingTimeline events={events} loading={isLoading} />
      </div>
    </div>
  );
};

// ── Tab: Activity ────────────────────────────────────────────────────────────
const ActivityTab = ({ staff }: { staff: Staff }) => {
  const fromDate = useMemo(() => daysAgoISO(30), []);
  const { data: records = [], isLoading } = useAttendance({
    staffIds: [staff.id],
    fromDate,
  });

  const stats = useMemo(() => {
    const present = records.filter((r) => r.status !== "absent").length;
    const late = records.filter((r) => r.status === "late").length;
    const last = records[0]; // service returns newest first
    return { present, late, last };
  }, [records]);

  return (
    <div className="space-y-4 pt-2">
      <DetailRow
        icon={LogIn}
        label="Last login"
        value={formatDate(staff.lastLoginAt)}
      />

      <div>
        <p className="text-xs font-semibold text-foreground mb-1.5">
          Attendance — last 30 days
        </p>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Present"
              value={stats.present}
              tone="text-emerald-600"
            />
            <StatCard label="Late" value={stats.late} tone="text-amber-600" />
            <StatCard
              label="Last check-in"
              value={
                <span className="text-sm">
                  {stats.last ? stats.last.date : "—"}
                </span>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ── Drawer body (mounted only when a staff member is selected) ────────────────
const ProfileBody = ({ staff }: { staff: Staff }) => (
  <>
    <SheetHeader className="border-b border-border/60 pb-4">
      <SheetTitle className="sr-only">Staff profile</SheetTitle>
      <div className="flex items-center gap-3">
        <StaffAvatar
          name={staff.name}
          src={staff.profilePictureUrl}
          size="xl"
        />
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground truncate">
            {staff.name}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {staff.role}
            {staff.designation ? ` · ${staff.designation}` : ""}
          </p>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <StaffStatusChip status={staff.status} />
            <OnboardingStatusBadge
              status={staff.onboardingStatus}
              emailStatus={staff.inviteEmailStatus}
            />
          </div>
        </div>
      </div>
    </SheetHeader>

    <Tabs defaultValue="details" className="py-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="access">Access</TabsTrigger>
        <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>

      <TabsContent value="details">
        <div className="pt-2">
          <DetailRow icon={Mail} label="Email" value={staff.email} />
          <DetailRow icon={Phone} label="Mobile" value={staff.mobile} />
          <DetailRow icon={MapPin} label="Address" value={staff.address} />
          <DetailRow
            icon={UserSquare2}
            label="Gender"
            value={
              staff.gender ? (
                <span className="capitalize">{staff.gender}</span>
              ) : undefined
            }
          />
          <DetailRow
            icon={Building2}
            label="Department"
            value={staff.department}
          />
          <DetailRow
            icon={Shield}
            label="Designation"
            value={staff.designation}
          />
          <DetailRow
            icon={Calendar}
            label="Joining date"
            value={staff.joiningDate}
          />
          <DetailRow icon={MapPin} label="Campus" value={staff.campus} />
          <DetailRow
            icon={UserSquare2}
            label="Subject"
            value={staff.subject}
          />
        </div>
      </TabsContent>

      <TabsContent value="access">
        <AccessTab staff={staff} />
      </TabsContent>

      <TabsContent value="onboarding">
        <OnboardingTab staff={staff} />
      </TabsContent>

      <TabsContent value="activity">
        <ActivityTab staff={staff} />
      </TabsContent>
    </Tabs>
  </>
);

/**
 * Read-only staff profile slide-over with Details / Access / Onboarding /
 * Activity tabs. The body is mounted only when a staff member is selected so
 * the per-tab queries never fire for a closed drawer.
 */
export const StaffProfileDrawer = ({ staff, onOpenChange }: Props) => (
  <Sheet open={!!staff} onOpenChange={onOpenChange}>
    <SheetContent className="w-full sm:max-w-md overflow-y-auto">
      {staff ? (
        <ProfileBody staff={staff} />
      ) : (
        <SheetHeader>
          <SheetTitle className="sr-only">Staff profile</SheetTitle>
        </SheetHeader>
      )}
    </SheetContent>
  </Sheet>
);
