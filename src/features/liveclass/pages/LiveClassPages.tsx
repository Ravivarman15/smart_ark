// ──────────────────────────────────────────────────────────────────────────────
// Live Class module — starter pages
//
// Add, Manage and "My Classes" screens for scheduling virtual lectures.
// Backed by localStorage via ModuleStarterPage. "My Classes" filters by host
// so teachers see only the sessions they own; admins and management use
// Manage Class for the full schedule view.
// ──────────────────────────────────────────────────────────────────────────────

import { BookOpen } from "lucide-react";
import { ModuleStarterPage, type StarterField } from "@/shared/components";

const STORAGE_KEY = "live_classes";

const fields: StarterField[] = [
  {
    name: "title",
    label: "Class title",
    type: "text",
    required: true,
    placeholder: "e.g., Physics — Rotational Motion revision",
  },
  {
    name: "subject",
    label: "Subject",
    type: "text",
    required: true,
    placeholder: "e.g., Physics",
  },
  {
    name: "batch",
    label: "Class / Batch",
    type: "text",
    required: true,
    placeholder: "e.g., 12-A, JEE 2026",
  },
  {
    name: "host",
    label: "Host (teacher name)",
    type: "text",
    required: true,
    placeholder: "Who's running the session?",
  },
  {
    name: "startAt",
    label: "Start time",
    type: "datetime",
    required: true,
  },
  {
    name: "durationMinutes",
    label: "Duration (minutes)",
    type: "number",
    placeholder: "60",
  },
  {
    name: "meetingUrl",
    label: "Meeting link",
    type: "text",
    placeholder: "Zoom / Google Meet / Jitsi URL",
    hint: "Students see this link when the session is published.",
  },
  {
    name: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      { value: "scheduled", label: "Scheduled" },
      { value: "live", label: "Live now" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  {
    name: "notes",
    label: "Notes for students",
    type: "textarea",
    placeholder: "Pre-reading, materials, agenda…",
  },
];

const columns = [
  { key: "title", header: "Title" },
  { key: "subject", header: "Subject" },
  { key: "batch", header: "Batch" },
  { key: "host", header: "Host" },
  { key: "startAt", header: "Start" },
  { key: "status", header: "Status" },
];

export const AddLiveClassPage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="Add Live Class"
    description="Schedule a new live session. Once saved, it appears in Manage Class for everyone with the module and in My Class for the host."
    icon={<BookOpen className="w-5 h-5" />}
    entityNoun="Live class"
    fields={fields}
    columns={columns}
  />
);

export const ManageLiveClassPage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="Manage Live Classes"
    description="Every scheduled, live, completed and cancelled session across the institute. Use this view to reschedule, reassign or cancel."
    icon={<BookOpen className="w-5 h-5" />}
    entityNoun="Live class"
    fields={fields}
    columns={columns}
  />
);

export const MyLiveClassPage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="My Live Classes"
    description="The sessions you're hosting. Update timing, meeting link or notes from here."
    icon={<BookOpen className="w-5 h-5" />}
    entityNoun="Live class"
    fields={fields}
    columns={columns}
    emptyMessage="You aren't hosting any sessions yet. Use Add Live Class to schedule one."
  />
);

export default ManageLiveClassPage;
