// ──────────────────────────────────────────────────────────────────────────────
// SCREENSHOT REGISTRY
//
// ┌── WHY ARTICLES REFERENCE AN ID, NOT A PATH ────────────────────────────┐
// │ An article that embeds an image path can embed anything — including a  │
// │ mockup drawn to look like the product. Referencing an id means the      │
// │ REGISTRY decides what exists, and the registry only knows about images  │
// │ that were actually captured from the running application.               │
// │                                                                        │
// │ `file: null` is the normal state today: no screenshots have been taken, │
// │ because capturing them needs an authenticated session in each role and  │
// │ nobody has run the capture pass yet.                                    │
// │                                                                        │
// │ An entry with `file: null` renders NOTHING — not a grey placeholder     │
// │ box, not an illustration. A placeholder that looks like a screenshot is │
// │ the fabrication this design exists to prevent.                          │
// └────────────────────────────────────────────────────────────────────────┘
//
// The capture brief for each entry is docs/DOCUMENTATION_SCREENSHOT_SHOT_LIST.md.
// ──────────────────────────────────────────────────────────────────────────────

import type { DocRole } from "./types";

export interface ScreenshotEntry {
  id: string;
  /** Route it is captured from — the reviewer's instruction, and the audit trail. */
  route: string;
  role: DocRole;
  /** What the application must be showing when the shot is taken. */
  state: string;
  caption: string;
  alt: string;
  /** Path under public/. `null` until a real capture lands. */
  file: string | null;
  priority: "P0" | "P1";
  /** desktop 1440x900 | tablet 1024x768 | mobile 390x844 */
  viewport?: "desktop" | "tablet" | "mobile";
  /**
   * TRUE only when the image was captured from the running application.
   *
   * There is no legitimate way for this to be true while `file` is null, and
   * no legitimate way to publish an image with it false — the gate enforces
   * both. It exists so that "is this a real screenshot?" is a field somebody
   * had to set deliberately, rather than an assumption.
   */
  capturedFromRealApp?: boolean;
  /** Checked for student/staff personal data and secrets before committing. */
  privacyReviewed?: boolean;
}

export const SCREENSHOTS: ScreenshotEntry[] = [
  { id: "admin-dashboard", route: "/admin", role: "admin", priority: "P0",
    state: "Signed in as Admin, dashboard with representative data",
    caption: "The admin dashboard, showing the day's outstanding work.",
    alt: "Smart ARK admin dashboard with summary tiles", file: null },

  { id: "management-dashboard", route: "/management", role: "management", priority: "P0",
    state: "Signed in as Management",
    caption: "The management dashboard reports organization-level figures.",
    alt: "Smart ARK management dashboard", file: null },

  { id: "coordinator-dashboard", route: "/coordinator", role: "coordinator", priority: "P0",
    state: "Signed in as Coordinator with classes allocated",
    caption: "The coordinator dashboard, scoped to allocated classes.",
    alt: "Smart ARK coordinator dashboard", file: null },

  { id: "teacher-dashboard", route: "/teacher", role: "teacher", priority: "P0",
    state: "Signed in as Teacher with at least one class",
    caption: "The teacher workspace: today's classes and pending marking.",
    alt: "Smart ARK teacher dashboard", file: null },

  { id: "parent-dashboard", route: "/parent", role: "parent", priority: "P0",
    state: "Signed in as a parent with at least one linked child",
    caption: "The parent portal opens on the selected child.",
    alt: "Smart ARK parent portal overview", file: null },

  { id: "parent-fees", route: "/parent/fees", role: "parent", priority: "P0",
    state: "A child with at least one recorded payment",
    caption: "Fees and receipts as a parent sees them.",
    alt: "Parent portal fee statement", file: null },

  { id: "student-import-upload", route: "/management/students/import", role: "management", priority: "P0",
    state: "Import step 1, before a file is chosen",
    caption: "Step 1 — choose the spreadsheet to import.",
    alt: "Student import upload step", file: null },

  { id: "student-import-mapping", route: "/management/students/import", role: "management", priority: "P0",
    state: "After upload, showing column matching",
    caption: "Step 2 — confirm which column feeds which field.",
    alt: "Student import column mapping", file: null },

  { id: "student-import-conflicts", route: "/management/students/import", role: "management", priority: "P0",
    state: "Preview with at least one family and one duplicate held for decision",
    caption: "Rows that resemble existing students are held for a decision — siblings are kept as separate students.",
    alt: "Student import conflict review", file: null },

  { id: "communication-center", route: "/management/communication", role: "management", priority: "P0",
    state: "Communication Center with the event list visible",
    caption: "Automation events, each independently enabled.",
    alt: "Communication Center event list", file: null },

  { id: "communication-event-card", route: "/management/communication", role: "management", priority: "P1",
    state: "A single event card, expanded",
    caption: "Each card names its trigger, audience and the campaign that will actually send.",
    alt: "A communication automation event card", file: null },

  { id: "fee-collection", route: "/admin/fees", role: "admin", priority: "P0",
    state: "Fee collection with a student selected",
    caption: "Recording a payment against a student's fee.",
    alt: "Fee collection screen", file: null },

  { id: "fee-receipt", route: "/admin/fees", role: "admin", priority: "P0",
    state: "A generated receipt, sample student only",
    caption: "The receipt carries the institution's own branding.",
    alt: "A generated fee receipt", file: null },

  { id: "checkin-settings", route: "/settings/check-in", role: "management", priority: "P0",
    state: "Location-verified mode with at least one location configured",
    caption: "Check-in settings: mode, enforcement and locations.",
    alt: "Check-in and check-out settings", file: null },

  { id: "checkin-location-dialog", route: "/settings/check-in", role: "management", priority: "P1",
    state: "Add location dialog, filled in",
    caption: "A verified location needs an address, coordinates and a radius.",
    alt: "Add check-in location dialog", file: null },

  { id: "branding-documents", route: "/settings/branding", role: "management", priority: "P0",
    state: "Branding → Documents tab with a logo uploaded",
    caption: "Document branding, with the live receipt preview.",
    alt: "Document branding settings", file: null },

  { id: "receipt-preview", route: "/settings/branding", role: "management", priority: "P1",
    state: "The live receipt preview panel",
    caption: "The preview uses your real organization details with a sample transaction.",
    alt: "Receipt branding live preview", file: null },
  { id: "attendance-dashboard", route: "/admin/attendance/dashboard", role: "admin", priority: "P0",
    state: "Attendance dashboard for a day with marks recorded",
    caption: "The attendance dashboard summarises the day across classes.",
    alt: "Smart ARK attendance dashboard", file: null },

  { id: "payroll-dashboard", route: "/admin/payroll/dashboard", role: "management", priority: "P0",
    state: "Payroll dashboard with at least one processed run",
    caption: "Payroll runs and their approval state.",
    alt: "Smart ARK payroll dashboard", file: null },

  { id: "staff-management", route: "/admin/staff-manage", role: "management", priority: "P0",
    state: "Staff list — use a demo tenant; do not capture real staff contact details",
    caption: "Staff records and the role each one holds.",
    alt: "Smart ARK staff management list", file: null },
];

export const SCREENSHOTS_BY_ID = new Map(SCREENSHOTS.map((s) => [s.id, s]));

/** Only entries with a real captured file. Everything else renders nothing. */
export const availableScreenshot = (id: string): ScreenshotEntry | null => {
  const s = SCREENSHOTS_BY_ID.get(id);
  return s && s.file ? s : null;
};
