import {
  Ban,
  CheckCircle2,
  Circle,
  KeyRound,
  LayoutGrid,
  LogIn,
  MailCheck,
  MailX,
  PauseCircle,
  Send,
  Shield,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { OnboardingEvent } from "../types/staff.types";

interface Props {
  events: OnboardingEvent[];
  loading?: boolean;
}

interface EventMeta {
  Icon: typeof Circle;
  tone: string;
  label: string;
}

const META: Record<string, EventMeta> = {
  account_created: { Icon: UserPlus, tone: "text-slate-500 bg-slate-500/10", label: "Account created" },
  invite_email_sent: { Icon: MailCheck, tone: "text-emerald-600 bg-emerald-500/10", label: "Welcome email sent" },
  invite_email_failed: { Icon: MailX, tone: "text-rose-600 bg-rose-500/10", label: "Welcome email failed" },
  invite_resent: { Icon: Send, tone: "text-sky-600 bg-sky-500/10", label: "Invite resent" },
  password_reset: { Icon: KeyRound, tone: "text-amber-600 bg-amber-500/10", label: "Password reset" },
  first_login: { Icon: LogIn, tone: "text-emerald-600 bg-emerald-500/10", label: "First login" },
  onboarding_completed: { Icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10", label: "Onboarding completed" },
  role_changed: { Icon: Shield, tone: "text-indigo-600 bg-indigo-500/10", label: "Role changed" },
  modules_updated: { Icon: LayoutGrid, tone: "text-indigo-600 bg-indigo-500/10", label: "Modules updated" },
  permissions_updated: { Icon: ShieldCheck, tone: "text-indigo-600 bg-indigo-500/10", label: "Permissions updated" },
  activated: { Icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10", label: "Account activated" },
  deactivated: { Icon: Ban, tone: "text-rose-600 bg-rose-500/10", label: "Account deactivated" },
  suspended: { Icon: PauseCircle, tone: "text-amber-600 bg-amber-500/10", label: "Account suspended" },
};

const fallbackMeta: EventMeta = {
  Icon: Circle,
  tone: "text-muted-foreground bg-muted",
  label: "Event",
};

const formatWhen = (iso: string): string => {
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

/** Vertical audit timeline of a staff member's onboarding lifecycle. */
export const StaffOnboardingTimeline = ({ events, loading }: Props) => {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-7 h-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        No onboarding activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4">
      {events.map((ev, i) => {
        const meta = META[ev.eventType] ?? {
          ...fallbackMeta,
          label: ev.eventType.replace(/_/g, " "),
        };
        const { Icon } = meta;
        const isLast = i === events.length - 1;
        return (
          <li key={ev.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex w-7 h-7 items-center justify-center rounded-full shrink-0 ${meta.tone}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              {!isLast && <span className="w-px flex-1 bg-border/60 mt-1" />}
            </div>
            <div className="pb-1 min-w-0">
              <p className="text-sm font-medium text-foreground capitalize">
                {meta.label}
              </p>
              {ev.detail && (
                <p className="text-xs text-muted-foreground break-words">
                  {ev.detail}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatWhen(ev.createdAt)}
                {ev.actorName ? ` · by ${ev.actorName}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
