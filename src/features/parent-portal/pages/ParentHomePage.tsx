// ── Parent Portal — Home dashboard ───────────────────────────────────────────
//
// Structure: a scannable "Today" strip, then eight insight cards, then a
// compact row for the parent's other children.
//
// COST: every card below is derived by a PURE function (utils/dashboardCards)
// from hooks the rest of the portal already uses. Opening Home warms the
// Messages, Documents, Academics and Attendance caches, so navigating to any
// of those afterwards issues no request at all. The dashboard is the most
// visited page, so it pre-pays for the rest of the portal rather than
// duplicating its queries.

import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  FileText,
  GraduationCap,
  Heart,
  Megaphone,
  MessageSquare,
  Minus,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAnnouncementFeed, AnnouncementCenterModal, PriorityBadge } from "@/features/announcements";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useParentPathVisible } from "../hooks/useParentModules";
import {
  useChildAttendance,
  useChildClasses,
  useChildDocuments,
  useChildInsights,
  useChildMessages,
  useChildResults,
  useChildSummary,
  useParentVisitCount,
} from "../hooks/useChildData";
import { parentPortalService } from "../services/parentPortal.service";
import {
  certificatesFrom,
  examUrgency,
  liveClassStatus,
  marksTrend,
  monthLabel,
  monthlyAttendanceCard,
  parentEngagement,
  relativeDay,
  teacherRemarks,
  weeklyProgress,
} from "../utils/dashboardCards";
import { MiniTrend, useStatusColors } from "../components/charts";
import {
  Card,
  ChildAvatar,
  Chip,
  EmptyState,
  ErrorState,
  LoadingTiles,
  RiskChip,
  ScoreBar,
  SectionTitle,
  formatDate,
  inr,
} from "../components/primitives";

const greeting = (): string => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ── Today strip ──────────────────────────────────────────────────────────────

/**
 * A compact tile. Deliberately not the bordered `StatTile`: six of these sit
 * shoulder-to-shoulder, and six boxed cards in a row reads as clutter rather
 * than a summary.
 *
 * A tile whose destination this institution has hidden renders NOTHING — see
 * `useParentPathVisible`. Leaving the tile and dropping only its link would
 * keep printing the very figure the institution chose not to publish.
 */
const TodayTile = ({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  to,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
  to?: string;
}) => {
  const visible = useParentPathVisible();
  if (!visible(to)) return null;

  const body = (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 h-full transition-colors hover:border-accent/40">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] font-medium uppercase tracking-wide truncate">{label}</span>
      </div>
      <p
        className={cn(
          "text-base font-bold leading-tight",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground leading-tight truncate">{sub}</p>}
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
};

// ── Insight card shell ───────────────────────────────────────────────────────

/**
 * Same rule as `TodayTile`: an insight card is a summary OF the page it points
 * at, so hiding that page hides the card rather than orphaning it.
 */
const InsightCard = ({
  title,
  icon: Icon,
  to,
  action,
  children,
}: {
  title: string;
  icon: typeof CalendarCheck;
  to?: string;
  action?: string;
  children: React.ReactNode;
}) => {
  const visible = useParentPathVisible();
  if (!visible(to)) return null;

  return (
    <Card className="!p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
            {title}
          </h3>
        </div>
        {to && (
          <Link to={to} className="text-[10px] font-medium text-accent hover:underline shrink-0">
            {action ?? "View"}
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
};

const Delta = ({ value, unit = "pts" }: { value: number | null; unit?: string }) => {
  if (value === null) return null;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium",
        value > 0 && "text-emerald-600 dark:text-emerald-400",
        value < 0 && "text-red-600 dark:text-red-400",
        value === 0 && "text-muted-foreground",
      )}
    >
      <Icon className="w-3 h-3" />
      {value > 0 ? "+" : ""}
      {value} {unit}
    </span>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────

export const ParentHomePage = () => {
  const { parent } = useAuth();
  const { children: kids, activeChild, setActiveChildId, isLoading: kidsLoading, error } =
    useActiveChild();
  const student = activeChild?.student;
  const colors = useStatusColors();
  // Shortcuts and cards must not lead anywhere this institution has withdrawn.
  const pathVisible = useParentPathVisible();

  const today = iso(new Date());
  const summary = useChildSummary(student);
  const attendance = useChildAttendance(student?.id);
  const insights = useChildInsights(student?.id);
  const results = useChildResults(student?.id);
  const documents = useChildDocuments(student?.id);
  const messages = useChildMessages(student);
  const classes = useChildClasses(student, today);
  const visits = useParentVisitCount(parent?.accountId);
  const { announcements: feedAnnouncements } = useAnnouncementFeed();
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const latestAnnouncement = feedAnnouncements && feedAnnouncements.length > 0 ? feedAnnouncements[0] : null;

  // ── Derivations (all pure, all unit-tested) ────────────────────────────────
  const monthly = useMemo(
    () => parentPortalService.monthlyAttendance(attendance.data ?? []),
    [attendance.data],
  );
  const monthCard = useMemo(() => monthlyAttendanceCard(monthly), [monthly]);
  const weekly = useMemo(
    () => weeklyProgress(attendance.data ?? [], insights.data?.exams ?? []),
    [attendance.data, insights.data],
  );
  const trend = useMemo(() => marksTrend(insights.data?.exams ?? []), [insights.data]);
  const remarks = useMemo(() => teacherRemarks(results.data ?? []), [results.data]);
  const certificates = useMemo(() => certificatesFrom(documents.data ?? []), [documents.data]);
  const engagement = useMemo(
    () => parentEngagement(messages.data ?? [], visits.data ?? 0),
    [messages.data, visits.data],
  );
  const live = useMemo(() => liveClassStatus(classes.data ?? []), [classes.data]);

  const s = summary.data;

  if (kidsLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <LoadingTiles count={6} />
      </div>
    );
  }
  if (error) return <ErrorState error={error} />;
  if (!activeChild || !student) {
    return <EmptyState title="No children linked yet" hint="Please contact the office." />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
          {greeting()}, {parent?.name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          {kids.length > 1 && ` · viewing ${student.name}`}
        </p>
      </div>

      {/* ── Latest Announcement Alert Banner ──────────────────────────────── */}
      {latestAnnouncement && (
        <div
          onClick={() => setAnnouncementsOpen(true)}
          className="mb-6 p-4 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Announcement
                </span>
                {!latestAnnouncement.is_read && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                    New
                  </span>
                )}
                <PriorityBadge priority={latestAnnouncement.priority} />
              </div>
              <p className="text-sm font-semibold text-foreground truncate mt-0.5">
                {latestAnnouncement.title}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {latestAnnouncement.summary || latestAnnouncement.content}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAnnouncementsOpen(true);
            }}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 shadow-xs"
          >
            View
          </button>
        </div>
      )}

      <AnnouncementCenterModal open={announcementsOpen} onClose={() => setAnnouncementsOpen(false)} />

      {/* ── Today's summary ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <SectionTitle>Today&apos;s summary</SectionTitle>
        {s && <RiskChip risk={s.health.risk} />}
      </div>

      {summary.isLoading && <LoadingTiles count={6} />}
      {summary.error && <ErrorState error={summary.error as Error} />}

      {s && !summary.isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-6">
          <TodayTile
            icon={CalendarCheck}
            label="Attendance"
            value={
              s.todayStatus
                ? s.todayStatus.charAt(0).toUpperCase() + s.todayStatus.slice(1)
                : "Not marked"
            }
            sub={s.attendancePercent !== null ? `${s.attendancePercent}% overall` : undefined}
            tone={
              s.todayStatus === "present"
                ? "good"
                : s.todayStatus === "late"
                  ? "warn"
                  : s.todayStatus === "absent"
                    ? "bad"
                    : "default"
            }
            to="/parent/attendance"
          />
          <TodayTile
            icon={CalendarDays}
            label="Classes today"
            value={String(s.classesToday)}
            sub={s.nextClassAt ? `Next at ${s.nextClassAt}` : "None remaining"}
            to="/parent/classes"
          />
          <TodayTile
            icon={Radio}
            label="Live class"
            value={
              live.state === "live"
                ? "In progress"
                : live.state === "upcoming"
                  ? (live.next?.startTime ?? "Upcoming")
                  : live.state === "done"
                    ? "Finished"
                    : "None"
            }
            sub={live.current?.title ?? live.next?.title}
            tone={live.state === "live" ? "good" : "default"}
            to="/parent/classes"
          />
          <TodayTile
            icon={CreditCard}
            label="Fees"
            value={s.feePending > 0 ? inr(s.feePending) : "No pending"}
            sub={s.feeTotal > 0 ? `of ${inr(s.feeTotal)}` : "No fee record"}
            tone={s.feePending > 0 ? "warn" : "good"}
            to="/parent/fees"
          />
          <TodayTile
            icon={GraduationCap}
            label="Upcoming exam"
            value={s.upcomingExam?.subject ?? s.upcomingExam?.title ?? "None"}
            sub={s.upcomingExam ? relativeDay(s.upcomingExam.date) : "Nothing scheduled"}
            tone={s.upcomingExam ? examUrgency(s.upcomingExam.date) : "default"}
            to="/parent/exams"
          />
          <TodayTile
            icon={Sparkles}
            label="AI learning score"
            value={`${s.health.overall}/100`}
            sub={
              s.health.risk === "green"
                ? "On track"
                : s.health.risk === "yellow"
                  ? "Monitor"
                  : "Needs attention"
            }
            tone={
              s.health.overall >= 75 ? "good" : s.health.overall >= 50 ? "warn" : "bad"
            }
            to="/parent/academics"
          />
        </div>
      )}

      {/* ── Insight cards ────────────────────────────────────────────────── */}
      <SectionTitle>This term at a glance</SectionTitle>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {/* Weekly progress */}
        <InsightCard title="Weekly progress" icon={CalendarCheck} to="/parent/attendance">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {weekly.attendancePercent === null ? "—" : `${weekly.attendancePercent}%`}
            </span>
            <span className="text-[11px] text-muted-foreground">attendance</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {weekly.recordedDays > 0
              ? `${weekly.attendedDays} of ${weekly.recordedDays} day(s) attended`
              : "No days recorded this week"}
          </p>
          <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {weekly.resultCount > 0
                ? `${weekly.resultCount} result(s), avg ${weekly.averagePercent}%`
                : "No new results"}
            </span>
            <Delta value={weekly.deltaVsPrevious} />
          </div>
        </InsightCard>

        {/* Monthly attendance */}
        <InsightCard title="Monthly attendance" icon={CalendarDays} to="/parent/attendance">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {monthCard.percent === null ? "—" : `${monthCard.percent}%`}
            </span>
            <Delta value={monthCard.deltaVsPrevious} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{monthLabel(monthCard.month)}</p>
          {monthCard.percent !== null && (
            <>
              {/* Proportional bar. Segments are separated by a 2px surface gap
                  and each is labelled below, so status is never colour-alone. */}
              <div className="flex gap-[2px] h-2 rounded-full overflow-hidden mt-3">
                {(
                  [
                    ["present", monthCard.present, colors.present],
                    ["late", monthCard.late, colors.late],
                    ["absent", monthCard.absent, colors.absent],
                  ] as [string, number, string][]
                )
                  .filter(([, n]) => n > 0)
                  .map(([k, n, c]) => (
                    <div key={k} style={{ flexGrow: n, background: c }} />
                  ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <i className="w-2 h-2 rounded-sm" style={{ background: colors.present }} />
                  Present {monthCard.present}
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="w-2 h-2 rounded-sm" style={{ background: colors.late }} />
                  Late {monthCard.late}
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="w-2 h-2 rounded-sm" style={{ background: colors.absent }} />
                  Absent {monthCard.absent}
                </span>
              </div>
            </>
          )}
        </InsightCard>

        {/* Marks trend */}
        <InsightCard title="Marks trend" icon={TrendingUp} to="/parent/academics">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  {trend.latest === null ? "—" : `${trend.latest}%`}
                </span>
                {trend.direction !== "insufficient" && <Delta value={trend.delta} />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                {trend.direction === "insufficient" ? "Not enough results yet" : trend.direction}
              </p>
            </div>
            <MiniTrend data={trend.points} />
          </div>
        </InsightCard>

        {/* Teacher remarks */}
        <InsightCard title="Teacher remarks" icon={MessageSquare} to="/parent/exams">
          {remarks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No remarks recorded yet. Teachers add these when publishing results.
            </p>
          ) : (
            <div className="space-y-2">
              {remarks.map((r) => (
                <div key={r.id} className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-foreground truncate">
                      {r.subject}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDate(r.date)}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground leading-snug">{r.remark}</p>
                </div>
              ))}
            </div>
          )}
        </InsightCard>

        {/* Certificates earned */}
        <InsightCard title="Certificates earned" icon={Award} to="/parent/documents">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {certificates.length}
            </span>
            <span className="text-[11px] text-muted-foreground">
              certificate{certificates.length === 1 ? "" : "s"} &amp; marksheets
            </span>
          </div>
          {certificates.length === 0 ? (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Certificates appear here once the institution shares them.
            </p>
          ) : (
            <div className="mt-2.5 space-y-1">
              {certificates.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-foreground truncate">{c.title}</span>
                </div>
              ))}
            </div>
          )}
        </InsightCard>

        {/* Parent engagement */}
        <InsightCard title="Your engagement" icon={Heart}>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {engagement.readPercent === null ? "—" : `${engagement.readPercent}%`}
            </span>
            <Chip
              tone={
                engagement.band === "strong"
                  ? "good"
                  : engagement.band === "steady"
                    ? "info"
                    : engagement.band === "low"
                      ? "warn"
                      : "default"
              }
            >
              {engagement.band === "unknown" ? "No data yet" : engagement.band}
            </Chip>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {engagement.delivered > 0
              ? `${engagement.read} of ${engagement.delivered} message(s) read`
              : "No messages delivered in the last 30 days"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/60">
            {engagement.portalVisits} portal visit{engagement.portalVisits === 1 ? "" : "s"} in 30
            days
          </p>
        </InsightCard>
      </div>

      {/* ── Health breakdown ─────────────────────────────────────────────── */}
      {s && (
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          <Card className="!p-4">
            <SectionTitle>Learning score breakdown</SectionTitle>
            <ScoreBar label="Academic" value={s.health.academic} />
            <ScoreBar label="Attendance" value={s.health.attendance} />
            <ScoreBar label="Fee" value={s.health.fee} />
          </Card>

          <Card className="!p-4">
            <SectionTitle>Quick actions</SectionTitle>
            <div className="grid grid-cols-4 gap-2">
              {[
                { to: "/parent/attendance", label: "Attendance", icon: CalendarCheck },
                { to: "/parent/academics", label: "Academics", icon: BookOpen },
                { to: "/parent/fees", label: "Fees", icon: CreditCard },
                { to: "/parent/exams", label: "Results", icon: GraduationCap },
                { to: "/parent/classes", label: "Classes", icon: Video },
                { to: "/parent/documents", label: "Documents", icon: FileText },
                { to: "/parent/messages", label: "Messages", icon: MessageSquare },
                { to: "/parent/assistant", label: "Assistant", icon: Sparkles },
                // Quick actions are shortcuts to pages, so a shortcut to a
                // page this institution does not offer is a dead end.
              ]
                .filter(({ to }) => pathVisible(to))
                .map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border p-2 text-[9px] text-center text-muted-foreground hover:border-accent/40 hover:text-accent transition-colors"
                >
                  <Icon className="w-4 h-4" />
                  <span className="leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Other children ───────────────────────────────────────────────── */}
      {kids.length > 1 && (
        <>
          <SectionTitle>My other children</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {kids
              .filter((k) => k.student.id !== student.id)
              .map((k) => (
                <SiblingCard
                  key={k.student.id}
                  child={k}
                  onOpen={() => setActiveChildId(k.student.id)}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * A sibling's at-a-glance card.
 *
 * Runs its own `useChildSummary`, so each sibling resolves independently and a
 * slow child never blocks the others — and clicking through is instant because
 * the summary is already cached under that child's key.
 */
const SiblingCard = ({
  child,
  onOpen,
}: {
  child: { student: { id: string; name: string; profileImageUrl?: string; standardName?: string; section?: string } };
  onOpen: () => void;
}) => {
  const { data } = useChildSummary(child.student as never);
  const s = child.student;

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-accent/40 transition-colors"
    >
      <ChildAvatar name={s.name} photoUrl={s.profileImageUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {[s.standardName, s.section].filter(Boolean).join(" · ") || "—"}
        </p>
        {data && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {data.todayStatus && (
              <Chip
                tone={
                  data.todayStatus === "present"
                    ? "good"
                    : data.todayStatus === "late"
                      ? "warn"
                      : "bad"
                }
              >
                {data.todayStatus}
              </Chip>
            )}
            {data.feePending > 0 && <Chip tone="warn">{inr(data.feePending)} due</Chip>}
            <Chip>{data.health.overall}/100</Chip>
          </div>
        )}
      </div>
      <Users className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
};

export default ParentHomePage;
