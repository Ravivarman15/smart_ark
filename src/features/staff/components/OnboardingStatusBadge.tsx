import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MailCheck,
  MailX,
} from "lucide-react";
import type {
  EmailDeliveryStatus,
  OnboardingStatus,
} from "../types/staff.types";

interface Props {
  status?: OnboardingStatus;
  emailStatus?: EmailDeliveryStatus;
  className?: string;
  /** Hide the icon — useful in dense table cells. */
  iconless?: boolean;
}

interface Meta {
  label: string;
  tone: string;
  Icon: typeof CheckCircle2;
}

/**
 * Resolve the onboarding badge. The email delivery status refines the
 * `pending` state — a staff member stuck at `pending` because the welcome
 * email *failed* needs a clearer, louder badge than one simply not sent yet.
 */
const resolveMeta = (
  status?: OnboardingStatus,
  emailStatus?: EmailDeliveryStatus,
): Meta => {
  if (status === "completed") {
    return {
      label: "Onboarded",
      tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      Icon: CheckCircle2,
    };
  }
  if (status === "invite_sent") {
    return {
      label: "Invite sent",
      tone: "bg-sky-500/10 text-sky-600 border-sky-500/20",
      Icon: MailCheck,
    };
  }
  // pending — or unknown (migration not applied). Email failure is louder.
  if (emailStatus === "failed") {
    return {
      label: "Email failed",
      tone: "bg-rose-500/10 text-rose-600 border-rose-500/20",
      Icon: MailX,
    };
  }
  if (emailStatus === "skipped") {
    return {
      label: "Email skipped",
      tone: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      Icon: AlertTriangle,
    };
  }
  return {
    label: "Onboarding pending",
    tone: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    Icon: Clock,
  };
};

/** Compact pill showing where a staff member is in the onboarding journey. */
export const OnboardingStatusBadge = ({
  status,
  emailStatus,
  className = "",
  iconless,
}: Props) => {
  if (!status && !emailStatus) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-muted text-muted-foreground border-border/50 ${className}`}
      >
        —
      </span>
    );
  }
  const { label, tone, Icon } = resolveMeta(status, emailStatus);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${tone} ${className}`}
    >
      {!iconless && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
};
