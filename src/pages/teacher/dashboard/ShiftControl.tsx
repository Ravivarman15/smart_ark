import React from "react";
import {
  MapPin, LogOut, CheckCircle2, Clock, ShieldCheck, ShieldAlert,
  Timer, AlertTriangle, Loader2,
} from "lucide-react";
import type { TeacherWorkspace } from "./useTeacherWorkspace";

// ─────────────────────────────────────────────────────────────────────────────
// ShiftControl — the mandatory gate. Nothing else in the workspace is usable
// until the teacher has checked in, and the day is not compliant until they
// have checked out. Renders the live shift timer, geo-verification state and
// the punch buttons.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  shift: TeacherWorkspace["shift"];
  onCheckOut: () => void;
}

const GeoBadge: React.FC<{ valid: boolean }> = ({ valid }) => (
  <span className={valid ? "status-pill-success" : "status-pill-warning"}>
    {valid ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
    {valid ? "Geo verified" : "Geo unverified"}
  </span>
);

const ShiftControl: React.FC<Props> = ({ shift, onCheckOut }) => {
  const { record, phase, workedLabel, checkinLoading, checkoutLoading, punchIn, history } = shift;

  return (
    <section
      className={`rounded-2xl border p-5 transition-colors ${
        phase === "not-started"
          ? "bg-ark-warning/5 border-ark-warning/30"
          : phase === "working"
            ? "bg-accent/5 border-accent/30"
            : "bg-ark-success/5 border-ark-success/25"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Today's shift
          </p>
          <h2 className="text-lg font-bold text-foreground mt-0.5">
            {phase === "not-started" && "Check in to start your day"}
            {phase === "working" && "On shift"}
            {phase === "done" && "Shift closed"}
          </h2>
        </div>
        {phase === "working" && (
          <div className="text-right">
            <p className="text-2xl font-bold text-accent tabular-nums flex items-center gap-1.5">
              <Timer className="w-4 h-4" /> {workedLabel}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Worked so far</p>
          </div>
        )}
        {phase === "done" && (
          <div className="text-right">
            <p className="text-2xl font-bold text-ark-success tabular-nums">{workedLabel}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total hours</p>
          </div>
        )}
      </div>

      {/* Punch state */}
      {phase === "not-started" ? (
        <>
          <button
            onClick={punchIn}
            disabled={checkinLoading}
            className="w-full rounded-xl gradient-accent text-accent-foreground font-semibold py-4 flex items-center justify-center gap-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {checkinLoading
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying your location…</>
              : <><MapPin className="w-5 h-5" /> Check In</>}
          </button>
          <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-ark-warning flex-shrink-0 mt-0.5" />
            Check-in is mandatory. Attendance, marks and tasks stay locked until your
            shift starts, and your check-in location is matched against your campus.
          </p>
        </>
      ) : (
        <div className="space-y-3">
          {/* Timeline: in → out */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-card/60 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Checked in</p>
              <p className="text-base font-bold text-foreground mt-0.5">{record?.time}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {record && <GeoBadge valid={record.geoValid} />}
                <span className={
                  record?.status === "on-time" ? "status-pill-success"
                    : record?.status === "late" ? "status-pill-warning"
                      : "status-pill-info"
                }>
                  {record?.status === "pending" ? "Awaiting approval" : record?.status}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-card/60 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Checked out</p>
              <p className="text-base font-bold text-foreground mt-0.5">
                {record?.checkoutTime || "—"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {record?.checkoutTime ? (
                  <>
                    <GeoBadge valid={!!record.checkoutGeoValid} />
                    <span className={
                      record.checkoutStatus === "on-time" ? "status-pill-success"
                        : record.checkoutStatus === "early" ? "status-pill-warning"
                          : "status-pill-info"
                    }>
                      {record.checkoutStatus === "pending" ? "Awaiting approval" : record.checkoutStatus}
                    </span>
                  </>
                ) : (
                  <span className="status-pill-warning">
                    <Clock className="w-3 h-3" /> Required before you leave
                  </span>
                )}
              </div>
            </div>
          </div>

          {phase === "working" ? (
            <button
              onClick={onCheckOut}
              disabled={checkoutLoading}
              className="w-full rounded-xl bg-card border border-border font-semibold py-3.5 text-foreground flex items-center justify-center gap-2.5 hover:border-accent/50 transition-colors disabled:opacity-60"
            >
              {checkoutLoading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying your location…</>
                : <><LogOut className="w-5 h-5" /> Check Out</>}
            </button>
          ) : (
            <div className="rounded-xl bg-ark-success/10 border border-ark-success/20 px-4 py-3 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-ark-success flex-shrink-0" />
              <p className="text-sm text-ark-success font-medium">
                Shift complete — {workedLabel} logged and sent for approval.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rolling 30-day compliance — real history, not a placeholder */}
      {history.daysPresent > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/60">
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{history.daysPresent}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Days · 30d</p>
          </div>
          <div className="text-center">
            <p className={`text-sm font-bold ${
              history.punctuality === null ? "text-muted-foreground"
                : history.punctuality >= 90 ? "text-ark-success"
                  : history.punctuality >= 70 ? "text-ark-warning" : "text-ark-danger"
            }`}>
              {history.punctuality === null ? "—" : `${history.punctuality}%`}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">On time</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{history.avgHours || "—"}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Avg shift</p>
          </div>
        </div>
      )}

      {history.missedCheckouts > 0 && (
        <div className="mt-3 rounded-xl bg-ark-danger/5 border border-ark-danger/20 px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-ark-danger flex-shrink-0" />
          <p className="text-xs text-foreground">
            <span className="font-semibold text-ark-danger">
              {history.missedCheckouts} shift{history.missedCheckouts > 1 ? "s" : ""}
            </span>{" "}
            in the last 30 days were never checked out. Ask your admin to close them.
          </p>
        </div>
      )}
    </section>
  );
};

export default ShiftControl;
