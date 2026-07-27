// ── Parent Portal — Transport & Hostel ───────────────────────────────────────
//
// SCOPE, STATED PLAINLY: Smart ARK has no Transport module and no Hostel
// module. `students.transport_required` / `transport_route_id` /
// `hostel_required` / `hostel_room_id` are the only data that exists — there
// are no routes, vehicles, drivers, stops, rooms, blocks, wardens or mess
// tables, and no GPS/telemetry source anywhere in the schema or the edge
// functions.
//
// So this page shows exactly what is recorded, and says so where nothing is.
// The alternative — a live-tracking map fed by invented coordinates, or an
// "ETA 7 minutes" with no vehicle behind it — would be a parent-facing lie
// about a child's school bus. Building those features means building the
// modules first; the portal will surface them the moment they exist.

import { Bus, Home, Info } from "lucide-react";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { Card, Chip, PageHeader, SectionTitle } from "../components/primitives";

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span className="text-xs font-medium text-foreground text-right">{value || "—"}</span>
  </div>
);

const NotConfigured = ({ what }: { what: string }) => (
  <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
    <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
    <p className="text-xs text-muted-foreground">
      {what} details are not yet managed in the system. Please contact the institution office for
      route, timing and contact information.
    </p>
  </div>
);

export const ParentServicesPage = () => {
  const { activeChild } = useActiveChild();
  if (!activeChild) return null;
  const s = activeChild.student;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Transport &amp; Hostel" subtitle={s.name} />

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Bus className="w-3.5 h-3.5" /> Transport
            </span>
          </SectionTitle>
          <Chip tone={s.transportRequired ? "info" : "default"}>
            {s.transportRequired ? "Opted in" : "Not opted in"}
          </Chip>
        </div>

        {s.transportRequired ? (
          <>
            <Field
              label="Status"
              value={s.transportRouteId ? "Route assigned" : "Awaiting route assignment"}
            />
            <Field label="Route reference" value={s.transportRouteId} />
            <div className="mt-3">
              <NotConfigured what="Vehicle, driver, stop and timing" />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Your child is not registered for institution transport. Contact the office to opt in.
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" /> Hostel
            </span>
          </SectionTitle>
          <Chip tone={s.hostelRequired ? "info" : "default"}>
            {s.hostelRequired ? "Resident" : "Day scholar"}
          </Chip>
        </div>

        {s.hostelRequired ? (
          <>
            <Field
              label="Status"
              value={s.hostelRoomId ? "Room assigned" : "Awaiting room assignment"}
            />
            <Field label="Room reference" value={s.hostelRoomId} />
            <div className="mt-3">
              <NotConfigured what="Block, warden, mess and hostel attendance" />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Your child is a day scholar and is not allocated hostel accommodation.
          </p>
        )}
      </Card>
    </div>
  );
};

export default ParentServicesPage;
