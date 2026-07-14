// Attendance Communication Dashboard — live view of what the parents were told.
//
// Reads the same message_queue ledger the sender writes, so a counter can never
// disagree with the Student 360 timeline. Updates in realtime as each send
// finalises.

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CopyCheck,
  Eye,
  MessageCircle,
  PhoneOff,
  SignalHigh,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttendancePageShell, EmptyState, StatTile } from "../../components";
import { today } from "../../utils/dates";
import {
  useAttendanceCommsRealtime,
  useAttendanceCommsStats,
  useAttendanceNotices,
} from "../hooks";
import type { AttendanceNotice } from "../services/attendanceComms.service";

const statusBadge = (n: AttendanceNotice) => {
  if (n.status === "read") return <Badge className="bg-emerald-600">Read</Badge>;
  if (n.status === "delivered") return <Badge className="bg-emerald-600">Delivered</Badge>;
  if (n.status === "sent") return <Badge className="bg-sky-600">Sent</Badge>;
  if (n.status === "sending") return <Badge variant="secondary">Sending…</Badge>;
  if (n.status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
};

/** The actionable reason a parent did not get the message. */
const reasonText = (n: AttendanceNotice): string => {
  if (n.status !== "failed") return "";
  if (n.failureReason === "missing_mobile") return "No parent mobile on file — add one on the student profile.";
  if (n.failureReason === "invalid_mobile") return `Invalid mobile "${n.phone ?? ""}" — correct it on the student profile.`;
  return n.error ?? "WhatsApp provider rejected the message.";
};

const AttendanceCommsDashboardPage = () => {
  const [date, setDate] = useState(today());
  useAttendanceCommsRealtime();

  const { data: stats } = useAttendanceCommsStats(date);
  const { data: notices = [], isLoading } = useAttendanceNotices(date, date);

  const failures = notices.filter((n) => n.status === "failed");

  return (
    <AttendancePageShell
      title="Attendance Communication Dashboard"
      description="Every absent-student WhatsApp sent to a parent, in real time. Sends happen the moment attendance is submitted — nothing is queued."
      icon={<MessageCircle className="w-5 h-5" />}
      toolbar={
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Attendance date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="Absent notifications"
            value={stats?.absentNotifications ?? 0}
            icon={<MessageCircle className="w-4 h-4" />}
          />
          <StatTile
            label="Delivered"
            value={stats?.delivered ?? 0}
            tone="positive"
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
          <StatTile
            label="Failed"
            value={stats?.failed ?? 0}
            tone="danger"
            icon={<XCircle className="w-4 h-4" />}
          />
          <StatTile
            label="Read"
            value={stats?.read ?? 0}
            tone="accent"
            hint="Requires the AiSensy webhook"
            icon={<Eye className="w-4 h-4" />}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="Missing parent mobile"
            value={stats?.missingParentMobile ?? 0}
            tone="warning"
            icon={<PhoneOff className="w-4 h-4" />}
          />
          <StatTile
            label="Invalid mobile"
            value={stats?.invalidMobile ?? 0}
            tone="warning"
            icon={<AlertTriangle className="w-4 h-4" />}
          />
          <StatTile
            label="Duplicate prevented"
            value={stats?.duplicatePrevented ?? 0}
            hint="Re-submits that did not re-send"
            icon={<CopyCheck className="w-4 h-4" />}
          />
          <StatTile
            label="Success rate"
            value={`${stats?.successPct ?? 0}%`}
            tone={(stats?.successPct ?? 0) >= 90 ? "positive" : "warning"}
            hint={`${stats?.corrections ?? 0} correction(s) sent`}
            icon={<SignalHigh className="w-4 h-4" />}
          />
        </div>

        {failures.length > 0 && (
          <Card className="border-red-500/30">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                {failures.length} parent{failures.length === 1 ? "" : "s"} did not receive the notification
              </p>
              <ul className="space-y-1.5">
                {failures.map((n) => (
                  <li key={n.id} className="text-xs flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{n.studentName ?? n.studentId}</span>
                    <span className="text-muted-foreground">{reasonText(n)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="glass-card p-0 overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notices.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="w-5 h-5" />}
              title="No attendance notifications for this date"
              description="Notifications are sent automatically when a teacher submits attendance with at least one absent student."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Student</th>
                    <th className="text-left font-medium px-4 py-2">Parent</th>
                    <th className="text-left font-medium px-4 py-2">Class</th>
                    <th className="text-left font-medium px-4 py-2">Mobile</th>
                    <th className="text-left font-medium px-4 py-2">Type</th>
                    <th className="text-left font-medium px-4 py-2">Status</th>
                    <th className="text-left font-medium px-4 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {notices.map((n) => (
                    <tr key={n.id}>
                      <td className="px-4 py-2">{n.studentName ?? "—"}</td>
                      <td className="px-4 py-2">{n.parentName ?? "—"}</td>
                      <td className="px-4 py-2">
                        {n.className ?? "—"}
                        {n.section && n.section !== "-" ? ` - ${n.section}` : ""}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{n.phone ?? "—"}</td>
                      <td className="px-4 py-2">
                        {n.kind === "corrected" ? (
                          <Badge variant="outline">Correction</Badge>
                        ) : (
                          <Badge variant="secondary">Absent</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">{statusBadge(n)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs">
                        {reasonText(n) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AttendancePageShell>
  );
};

export default AttendanceCommsDashboardPage;
