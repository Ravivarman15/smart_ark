# Student 360° Report (Enterprise)

Extends the Student Detail Drawer's **Download Record** into a complete 12-section
single-student dossier. The drawer is **not redesigned** — only the footer export action is
upgraded. Every section reuses an existing engine; **no service is duplicated**.

## Reuse map

| Section data | Reused engine |
|---|---|
| Profile / Parent / Guardian | `Student` (already loaded by the drawer) |
| Performance, Fees, Receipts, Attendance breakdown | `fetchStudentInsights` (Student Insights) |
| Communication timeline | `commsTimelineService.forRecipient` |
| Documents | `documentsService.list` |
| Monthly attendance | `student_attendance` (dated read) |
| Charts | pure SVG generators (`utils/report360Charts.ts`) |
| Health scores + AI summary | pure scoring (`utils/student360.ts`) |
| Receipt view | `FeeReceiptDialog` (drawer Fees tab) |

## Output formats

- **PDF** — A4-styled self-contained HTML opened in a print window → "Save as PDF". Inline **SVG
  charts** (marks-trend line, subject bar, attendance donut) render crisply with no chart library
  or html2canvas. Branding, student photo, QR code, fixed footer.
- **Print** — same document, print-friendly (only the report, no app UI).
- **Excel** — multi-sheet `.xlsx` (SheetJS, lazy-imported): Profile · Attendance · Performance ·
  Fees · Receipts · Communication · Timeline.

## Flow

```
Drawer "360° Report" (PDF | Excel | Print)
        │  async — toast "Generating…", UI never blocks
        ▼
gatherStudent360(student)
        │   fetchStudentInsights ─┐
        │   commsTimeline.forRecipient ─┤  Promise.allSettled (best-effort per source)
        │   documentsService.list ─┤
        │   monthlyAttendance ─────┘
        │   → computeHealthScores + buildAiSummary (pure)
        ▼
Student360Data ── pdf/print ─► buildReportHtml() ─► print window (SVG charts inline)
               └─ xlsx ──────► SheetJS multi-sheet workbook
```

## Sections

1 Cover (logo, photo, name, admission no, ID, class, batch, campus, status, QR, generated date) ·
2 Profile (personal/parent/guardian/contact) · 3 Academic (overall %, strong/weak, exam history +
marks-trend & subject charts) · 4 Attendance (donut + monthly table) · 5 Fee summary (+progress) ·
6 Receipt history · 7 Communication timeline · 8 Activity timeline · 9 Documents · 10 Counselor
notes · 11 AI summary (rule-based: performance/attendance/fee/risk/recommendation) ·
12 Management summary (Academic/Attendance/Fee/Communication scores, overall health ring,
Green/Yellow/Red risk).

## Permissions

The report is gated by the drawer's existing `canDownload` prop, which the calling pages
(admin/management/coordinator) drive via RBAC (`fee`/student record permissions). Student/parent
surfaces pass `canDownload={false}` for view-only.

## Performance

- Gathering is async (`Promise.allSettled`) and only runs on click — the live drawer is untouched.
- Charts are generated as strings **only at export time** (lazy) — no chart lib in the report path;
  recharts stays confined to the on-screen Performance tab (vendor-charts chunk).
- A missing table/column yields an empty section, never an error.

## Quality gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS — 0 errors |
| `eslint` (changed files) | ✅ PASS — 0 errors |
| `vitest run src/features/students/testing` | ✅ PASS — 57/57 (incl. 7 new `student360` tests) |
| `vite build` | ✅ PASS |

## New / modified files

**New**
- `utils/report360Charts.ts` — pure line/bar/donut SVG generators
- `utils/student360.ts` — `computeHealthScores`, `buildAiSummary`, risk bands
- `services/student360.service.ts` — `gatherStudent360`, `generateStudent360` (PDF/Excel/Print)
- `testing/student360.test.ts` — 7 tests
- `docs/STUDENT_360_REPORT.md`

**Modified**
- `hooks/useStudentInsights.ts` — export `fetchStudentInsights` (shared, no duplication)
- `components/StudentProfileDrawer.tsx` — footer "360° Report" (PDF/Excel/Print) + async loading
- `services/index.ts` — export the 360° service
