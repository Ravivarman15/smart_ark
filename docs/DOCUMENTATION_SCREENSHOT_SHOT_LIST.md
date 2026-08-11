# Documentation screenshot shot list

**No screenshots have been captured.** Every registry entry has `file: null`,
which renders nothing at all — not a placeholder. A placeholder that looks
like a screenshot is the fabrication this list exists to avoid.

Capturing needs an authenticated session per role, which I do not have.

## Before you capture

- Use a demo or sample organization where possible, not a live tenant.
- **Never capture**: student or parent phone numbers, personal email addresses,
  home addresses, passwords, API keys, payment identifiers, or a real child’s
  full name next to their marks.
- Blur or replace anything above before the file is committed.
- 1440×900 or wider, light theme, browser chrome cropped out.
- Save under `public/docs/screenshots/<id>.png`, then set `file` on the
  matching registry entry in `src/features/docs/screenshots.ts`.

## Shots (17)

### P0 · `admin-dashboard`

| | |
|---|---|
| **Role** | admin |
| **Route** | `/admin` |
| **Login required** | yes |
| **State** | Signed in as Admin, dashboard with representative data |
| **Must show** | The admin dashboard, showing the day's outstanding work. |
| **Alt text** | Smart ARK admin dashboard with summary tiles |
| **Filename** | `public/docs/screenshots/admin-dashboard.png` |

### P0 · `management-dashboard`

| | |
|---|---|
| **Role** | management |
| **Route** | `/management` |
| **Login required** | yes |
| **State** | Signed in as Management |
| **Must show** | The management dashboard reports organization-level figures. |
| **Alt text** | Smart ARK management dashboard |
| **Filename** | `public/docs/screenshots/management-dashboard.png` |

### P0 · `coordinator-dashboard`

| | |
|---|---|
| **Role** | coordinator |
| **Route** | `/coordinator` |
| **Login required** | yes |
| **State** | Signed in as Coordinator with classes allocated |
| **Must show** | The coordinator dashboard, scoped to allocated classes. |
| **Alt text** | Smart ARK coordinator dashboard |
| **Filename** | `public/docs/screenshots/coordinator-dashboard.png` |

### P0 · `teacher-dashboard`

| | |
|---|---|
| **Role** | teacher |
| **Route** | `/teacher` |
| **Login required** | yes |
| **State** | Signed in as Teacher with at least one class |
| **Must show** | The teacher workspace: today's classes and pending marking. |
| **Alt text** | Smart ARK teacher dashboard |
| **Filename** | `public/docs/screenshots/teacher-dashboard.png` |

### P0 · `parent-dashboard`

| | |
|---|---|
| **Role** | parent |
| **Route** | `/parent` |
| **Login required** | yes |
| **State** | Signed in as a parent with at least one linked child |
| **Must show** | The parent portal opens on the selected child. |
| **Alt text** | Smart ARK parent portal overview |
| **Filename** | `public/docs/screenshots/parent-dashboard.png` |

### P0 · `parent-fees`

| | |
|---|---|
| **Role** | parent |
| **Route** | `/parent/fees` |
| **Login required** | yes |
| **State** | A child with at least one recorded payment |
| **Must show** | Fees and receipts as a parent sees them. |
| **Alt text** | Parent portal fee statement |
| **Filename** | `public/docs/screenshots/parent-fees.png` |

### P0 · `student-import-upload`

| | |
|---|---|
| **Role** | management |
| **Route** | `/management/students/import` |
| **Login required** | yes |
| **State** | Import step 1, before a file is chosen |
| **Must show** | Step 1 — choose the spreadsheet to import. |
| **Alt text** | Student import upload step |
| **Filename** | `public/docs/screenshots/student-import-upload.png` |

### P0 · `student-import-mapping`

| | |
|---|---|
| **Role** | management |
| **Route** | `/management/students/import` |
| **Login required** | yes |
| **State** | After upload, showing column matching |
| **Must show** | Step 2 — confirm which column feeds which field. |
| **Alt text** | Student import column mapping |
| **Filename** | `public/docs/screenshots/student-import-mapping.png` |

### P0 · `student-import-conflicts`

| | |
|---|---|
| **Role** | management |
| **Route** | `/management/students/import` |
| **Login required** | yes |
| **State** | Preview with at least one family and one duplicate held for decision |
| **Must show** | Rows that resemble existing students are held for a decision — siblings are kept as separate students. |
| **Alt text** | Student import conflict review |
| **Filename** | `public/docs/screenshots/student-import-conflicts.png` |

### P0 · `communication-center`

| | |
|---|---|
| **Role** | management |
| **Route** | `/management/communication` |
| **Login required** | yes |
| **State** | Communication Center with the event list visible |
| **Must show** | Automation events, each independently enabled. |
| **Alt text** | Communication Center event list |
| **Filename** | `public/docs/screenshots/communication-center.png` |

### P1 · `communication-event-card`

| | |
|---|---|
| **Role** | management |
| **Route** | `/management/communication` |
| **Login required** | yes |
| **State** | A single event card, expanded |
| **Must show** | Each card names its trigger, audience and the campaign that will actually send. |
| **Alt text** | A communication automation event card |
| **Filename** | `public/docs/screenshots/communication-event-card.png` |

### P0 · `fee-collection`

| | |
|---|---|
| **Role** | admin |
| **Route** | `/admin/fees` |
| **Login required** | yes |
| **State** | Fee collection with a student selected |
| **Must show** | Recording a payment against a student's fee. |
| **Alt text** | Fee collection screen |
| **Filename** | `public/docs/screenshots/fee-collection.png` |

### P0 · `fee-receipt`

| | |
|---|---|
| **Role** | admin |
| **Route** | `/admin/fees` |
| **Login required** | yes |
| **State** | A generated receipt, sample student only |
| **Must show** | The receipt carries the institution's own branding. |
| **Alt text** | A generated fee receipt |
| **Filename** | `public/docs/screenshots/fee-receipt.png` |

### P0 · `checkin-settings`

| | |
|---|---|
| **Role** | management |
| **Route** | `/settings/check-in` |
| **Login required** | yes |
| **State** | Location-verified mode with at least one location configured |
| **Must show** | Check-in settings: mode, enforcement and locations. |
| **Alt text** | Check-in and check-out settings |
| **Filename** | `public/docs/screenshots/checkin-settings.png` |

### P1 · `checkin-location-dialog`

| | |
|---|---|
| **Role** | management |
| **Route** | `/settings/check-in` |
| **Login required** | yes |
| **State** | Add location dialog, filled in |
| **Must show** | A verified location needs an address, coordinates and a radius. |
| **Alt text** | Add check-in location dialog |
| **Filename** | `public/docs/screenshots/checkin-location-dialog.png` |

### P0 · `branding-documents`

| | |
|---|---|
| **Role** | management |
| **Route** | `/settings/branding` |
| **Login required** | yes |
| **State** | Branding → Documents tab with a logo uploaded |
| **Must show** | Document branding, with the live receipt preview. |
| **Alt text** | Document branding settings |
| **Filename** | `public/docs/screenshots/branding-documents.png` |

### P1 · `receipt-preview`

| | |
|---|---|
| **Role** | management |
| **Route** | `/settings/branding` |
| **Login required** | yes |
| **State** | The live receipt preview panel |
| **Must show** | The preview uses your real organization details with a sample transaction. |
| **Alt text** | Receipt branding live preview |
| **Filename** | `public/docs/screenshots/receipt-preview.png` |

