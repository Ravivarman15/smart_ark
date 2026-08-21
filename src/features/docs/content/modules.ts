import type { DocArticle } from "../types";

// Module guides. Every `permissions` id is SHIPPED in the generated inventory
// and every `sourceModules` path is a real file — both re-checked by the gate.

export const MODULE_ARTICLES: DocArticle[] = [
  {
    slug: "student-import",
    title: "Import students",
    description: "Bulk-create student records from a spreadsheet, with family and duplicate detection.",
    category: "students",
    roles: ["admin", "management"],
    keywords: ["import", "bulk", "spreadsheet", "excel", "csv", "duplicate", "family", "siblings"],
    intro: [
      "Import creates many student records from a spreadsheet in one pass. It is the fastest way to bring an existing roll into Smart ARK, and it is built around one fact that trips up most import tools: siblings share a parent's mobile number.",
      "The importer treats a shared mobile as evidence of a FAMILY, not of a duplicate. Three children on one number become three student records linked as siblings — never one record that quietly overwrote the other two.",
    ],
    before: [
      "An academic year is active and the standards you are importing into exist.",
      "Your spreadsheet has one row per student, with a header row.",
    ],
    steps: [
      { title: "Open the importer", body: "Students → Students Import." },
      { title: "Upload the file", body: "Select your spreadsheet. The first sheet is read and the header row is used to offer column matches." },
      { title: "Map the columns", body: "Confirm which spreadsheet column feeds which field. Obvious matches are pre-selected; check them rather than assuming. Unmapped columns are ignored, not guessed at." },
      { title: "Review the preview", body: "Rows are validated before anything is written. Problems are grouped so you can fix a category at a time instead of hunting row by row." },
      { title: "Resolve conflicts", body: "Rows that look like existing students are held for a decision. Review each: a genuine duplicate should be merged or skipped; a sibling should be imported as a new student." },
      { title: "Commit", body: "Run the import. Progress is reported as it goes, and the result is recorded in import history." },
    ],
    whatHappensNext: [
      "Students appear in Manage Students and can be placed in classes, assigned fees and marked present.",
      "The run is written to import history with its counts, so a later question about where a record came from has an answer.",
      "Imported students have no fee record until a fee structure is assigned — see Collect fees.",
    ],
    callouts: [
      {
        kind: "important",
        body: "Family is not duplication. One parent mobile with three children — Arjun in Class 5, Akhil in Class 7, Ananya in Class 10 — is three student records in one family. An importer that collapses them loses two children.",
      },
      {
        kind: "warning",
        body: "A mobile number is not a unique identifier for a student. Matching on it alone is what produces the collapse above, which is why duplicate detection weighs several fields rather than trusting one.",
      },
      {
        kind: "tip",
        body: "Import a handful of rows first. Confirm the mapping produced what you expected, then run the full file.",
      },
    ],
    faq: [
      { q: "What happens if I import the same file twice?", a: "The second run flags the rows as conflicts rather than creating a second copy. You decide per row whether to skip or update." },
      { q: "Can I undo an import?", a: "Import history records each run so a mistaken import can be identified and reversed. Check the history entry for the run before taking any action on individual students." },
      { q: "Why is a row rejected?", a: "The preview names the reason per row — most often a missing required field or a standard that does not exist yet. Create the missing standard, then re-import only the affected rows." },
    ],
    screenshots: ["student-import-upload", "student-import-mapping", "student-import-conflicts"],
    related: ["fee-collection", "organization-setup"],
    permissions: ["student.manage", "student.add"],
    sourceModules: ["src/features/students/services", "src/features/rbac/constants/catalog.ts"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "communication-automation",
    title: "How communication automation works",
    description: "The path from a business event to a delivered message, and what you control at each step.",
    category: "communication",
    roles: ["admin", "management"],
    keywords: ["whatsapp", "automation", "communication center", "templates", "aisensy", "messages", "notifications"],
    intro: [
      "Communication in Smart ARK is automation-first. Rather than selecting hundreds of students and pressing send, you enable an EVENT — a student marked absent, a fee falling due — and the system works out who should be told and what to say.",
      "The Communication Center is where events are switched on and off. Nothing sends until you enable it, and each event is independent.",
    ],
    steps: [
      { title: "Open the Communication Center", body: "Communication Center from the main navigation." },
      { title: "Choose an event", body: "Events are grouped by category. Each card shows what triggers it, who receives it and whether the audience is resolved automatically or supplied by whoever triggers it." },
      { title: "Enable it", body: "Turn the event on. Events that are fully automatic need nothing further — the recipients and message values are resolved from your own data." },
      { title: "Check what will send", body: "The card shows the template and the campaign that will actually be used. Read this before enabling anything that reaches parents." },
    ],
    whatHappensNext: [
      "When the business event occurs, recipients are resolved from your organization's records, message values are filled in — including your organization's name — and the message is queued.",
      "The queue is drained by the delivery service. Outcomes are written to the communication timeline and to an audit record.",
      "Recipients who have opted out of a channel are filtered out before sending, and family grouping prevents one household receiving the same notice several times.",
    ],
    callouts: [
      {
        kind: "important",
        body: "For WhatsApp, your application template and the approved provider template are two different things. The app selects a CAMPAIGN and supplies parameter values; the provider renders its own approved wording. Editing the wording here does not change what a parent receives until the provider template is re-approved.",
      },
      { kind: "warning", body: "Enabling an event begins messaging real parents the next time it fires. Read the audience on the card before switching anything on." },
      { kind: "note", body: "The event list is generated from the product's own registry rather than maintained by hand, so this page cannot claim an event that does not exist." },
    ],
    faq: [
      { q: "Why did a message not send?", a: "The most common causes are the event being disabled, the recipient having no number on file, or the recipient having opted out of that channel. The communication timeline records which applied." },
      { q: "Can I change the wording?", a: "For email, yes. For WhatsApp, the provider owns the approved body — see the note above." },
      { q: "Will parents get duplicates?", a: "No. Repeat sends of the same event to the same recipient are suppressed, and siblings in one household are grouped so a parent is told once." },
    ],
    screenshots: ["communication-center", "communication-event-card"],
    related: ["whatsapp-templates", "student-import"],
    permissions: ["whatsapp.center"],
    sourceModules: [
      "src/features/communication/pages/CommunicationCenterPage.tsx",
      "src/features/communication/constants/automationEvents.ts",
      "src/features/communication/services/automationResolvers.ts",
    ],
    lastVerified: "2026-08-11",
  },

  {
    slug: "whatsapp-templates",
    title: "WhatsApp templates and campaigns",
    description: "Why message wording lives with the provider, and what that means for you.",
    category: "communication",
    roles: ["admin", "management"],
    keywords: ["whatsapp", "template", "campaign", "aisensy", "meta", "approval", "parameters"],
    intro: [
      "WhatsApp business messaging does not let an application send arbitrary text. Every message is a pre-approved TEMPLATE with numbered blanks, and the provider renders the approved wording — the application only supplies the values for the blanks.",
      "This has one consequence worth understanding before you change anything: editing wording inside Smart ARK does not change what a parent receives. The approved template governs.",
    ],
    steps: [
      { title: "Review the template", body: "Communication Center shows, per event, the campaign that will be posted and the values that will fill it." },
      { title: "Submit for approval", body: "New or changed wording is submitted to the provider for approval. This is done by your platform provider, not from inside the ERP." },
      { title: "Activate after approval", body: "Once approved, the campaign is switched over. Until then, the previous approved campaign continues to send." },
    ],
    callouts: [
      { kind: "important", body: "A rejected template cannot be edited and resubmitted under the same name — the resubmission needs a new campaign name." },
      { kind: "note", body: "Parameters must appear in order, each used once. This is a provider rule, not a Smart ARK one, and it is why blanks cannot simply be rearranged." },
      { kind: "tip", body: "Your organization's name is supplied as a parameter rather than baked into the wording. That is what allows one approved template to serve every institution." },
    ],
    faq: [
      { q: "Can I write my own WhatsApp message?", a: "Not freely. Business-initiated WhatsApp requires an approved template. Free text is only possible inside an open conversation window the parent started." },
      { q: "How long does approval take?", a: "That is the provider's process, not Smart ARK's. Approvals typically complete within a day but can take longer." },
    ],
    related: ["communication-automation"],
    permissions: ["whatsapp.center"],
    sourceModules: [
      "src/features/communication/constants/providerTemplates.ts",
      "src/features/leads/utils/templateParams.ts",
    ],
    lastVerified: "2026-08-11",
  },

  {
    slug: "fee-collection",
    title: "Collect fees and issue receipts",
    description: "From fee structure to assigned fee to payment and receipt.",
    category: "finance",
    roles: ["admin", "management"],
    keywords: ["fees", "collection", "payment", "receipt", "structure", "balance", "invoice"],
    intro: [
      "Fees work in three stages. A STRUCTURE defines what something costs. Assigning that structure to students creates their individual fee records. Collecting against a fee record produces a payment and a receipt.",
      "Nothing is owed until a structure is assigned — which is why newly imported students show no fees at first.",
    ],
    before: ["At least one fee structure exists.", "The students you are collecting from have been created."],
    steps: [
      { title: "Define the structure", body: "Fees → Fee Structures. Set out what the year costs, including any instalment pattern." },
      { title: "Assign it", body: "From the structure, assign to individual students or to a whole class at once. Assigning by class is the fast path after an import." },
      { title: "Collect", body: "Fees → Fee Collection. Find the student, enter the amount and payment method, and record the payment." },
      { title: "Issue the receipt", body: "A receipt is produced immediately and can be printed or downloaded. It carries your organization's own name, address and logo." },
    ],
    whatHappensNext: [
      "The student's balance updates, and the payment appears in their fee history and in fee reports.",
      "If receipt delivery is enabled, the receipt is sent to the parent automatically.",
    ],
    callouts: [
      { kind: "tip", body: "After a bulk import, assign the fee structure by class rather than per student." },
      { kind: "note", body: "Receipts render your organization's branding — logo, address and colours — from Branding. Configure it once and every future receipt carries it." },
    ],
    faq: [
      { q: "A student shows no fees. Why?", a: "No fee structure has been assigned to them. Importing or creating a student does not itself create a fee record." },
      { q: "Can I reprint an old receipt?", a: "Yes. Receipts are generated from the stored payment, so any past payment can be reprinted." },
      { q: "Why is our logo missing from receipts?", a: "The logo must be uploaded in Branding → Documents. A logo linked from another website usually cannot be embedded in a generated PDF." },
    ],
    screenshots: ["fee-collection", "fee-receipt"],
    related: ["document-branding", "student-import"],
    permissions: ["fee.manage_structure", "fee.collection", "fee.manage"],
    sourceModules: [
      "src/features/fee/components/FeeReceiptDialog.tsx",
      "src/features/fee/utils/receipt.ts",
    ],
    lastVerified: "2026-08-11",
  },

  {
    slug: "checkin-setup",
    title: "Check-in and check-out",
    description: "Configure how staff record attendance, with or without location verification.",
    category: "attendance",
    roles: ["admin", "management"],
    keywords: ["check-in", "checkout", "geolocation", "location", "radius", "gps", "staff attendance"],
    intro: [
      "Staff check-in runs in one of two modes, chosen per organization.",
      "NORMAL records the check-in with no location involvement — the browser is never asked for permission. LOCATION VERIFIED asks for the device position and compares it against the locations you have configured.",
    ],
    before: ["For location verification, you need the address and coordinates of each place staff may check in from."],
    steps: [
      { title: "Open the settings", body: "Settings → Check-in & Check-out." },
      { title: "Add your locations", body: "Add each campus or branch. A verified location requires an address, coordinates and a radius — all three, because coordinates alone cannot be reviewed by a person and an address alone cannot be measured against." },
      { title: "Set the radius", body: "Staff standing within this many metres of the location are verified. A small campus might use 100 m; a large one 300 m. Each location has its own." },
      { title: "Choose the mode", body: "Switch to Location verified. This is refused until at least one active location with coordinates exists." },
      { title: "Decide on enforcement", body: "With enforcement off, position is recorded and flagged but the check-in still goes through. With it on, staff outside every radius cannot check in at all." },
      { title: "Test it", body: "Use Test location to check your own position against the configuration. This is a test — it records no attendance." },
    ],
    whatHappensNext: [
      "Staff checking in have their position compared against your active locations, and the nearest match within its radius is recorded with the distance.",
      "Results are one of: verified, outside radius, low accuracy, or no locations configured.",
    ],
    callouts: [
      { kind: "important", body: "Enforcement and mode are separate. Location-verified mode with enforcement off records where people are without stopping anyone checking in — usually the right first step." },
      { kind: "warning", body: "Location from a browser is a signal, not proof of identity. Treat it as evidence, not certainty." },
      { kind: "tip", body: "Paste a Google Maps link and coordinates are read from it when present. Short share links carry no coordinates — open the link first and copy the full URL, or enter the numbers directly." },
    ],
    faq: [
      { q: "Staff cannot check in after enabling location verification.", a: "Check the radius, and confirm the coordinates match the building. Use Test location while standing at the site to see the measured distance." },
      { q: "What if a member of staff denies location permission?", a: "The check-in is recorded with a status showing location was unavailable. With enforcement on, it is refused." },
      { q: "Can we have several campuses?", a: "Yes. Add as many as you need; the nearest active one within its radius is chosen automatically. Staff never pick a location." },
    ],
    screenshots: ["checkin-settings", "checkin-location-dialog"],
    related: ["organization-setup"],
    permissions: ["settings.checkin"],
    sourceModules: [
      "src/features/settings/pages/CheckinSettingsPage.tsx",
      "src/features/settings/services/checkin.service.ts",
    ],
    lastVerified: "2026-08-11",
  },

  {
    slug: "document-branding",
    title: "Brand your documents",
    description: "Put your own name, logo and colours on receipts and payslips.",
    category: "white-label",
    roles: ["admin", "management"],
    keywords: ["branding", "logo", "colours", "colors", "receipt", "payslip", "white label", "signatory"],
    intro: [
      "Receipts and salary slips carry your organization's identity: name, address, phone, website, logo, authorised signatory and — for receipts — your own colours.",
      "Configure this once and every document generated afterwards uses it.",
    ],
    steps: [
      { title: "Open document branding", body: "Settings → Branding & White Label → Documents." },
      { title: "Upload your logo", body: "Use Upload logo. Uploading rather than linking matters: documents are rendered to an image, and a logo hosted elsewhere is usually blocked and disappears from the PDF while still looking correct on screen." },
      { title: "Complete the identity", body: "Address, tax number and authorised signatory. These print on every document." },
      { title: "Choose receipt colours", body: "Primary, secondary and accent. Text colours are chosen automatically for readability, so no combination can make a receipt unreadable." },
      { title: "Check the preview", body: "The live preview uses your real organization details with a sample transaction." },
    ],
    callouts: [
      { kind: "note", body: "With no logo, documents show your initials in a monogram — never another organization's mark." },
      { kind: "tip", body: "Receipt colours are separate from your app theme. Changing them does not re-skin the portals." },
    ],
    faq: [
      { q: "I set a logo URL and nothing changed.", a: "Upload the file instead. An externally hosted image usually cannot be embedded in a generated document." },
      { q: "Can I use different branding per branch?", a: "Not currently. Branding is per organization." },
    ],
    screenshots: ["branding-documents", "receipt-preview"],
    related: ["fee-collection"],
    permissions: ["settings.branding"],
    sourceModules: [
      "src/features/branding/pages/BrandingPage.tsx",
      "src/features/branding/documents/documentBranding.service.ts",
    ],
    lastVerified: "2026-08-11",
  },

  // ── New coverage: the 8 modules that had no documentation ─────────────
  //
  // Written from the shipped code, in the same tone as the articles above.
  // Every `permissions` id is SHIPPED (has a route in catalog.ts), every
  // `sourceModules` path is a real file or directory, and every step
  // describes a screen somebody can actually open.

  {
    slug: "exams-overview",
    title: "Exams and results",
    description: "Creating exams, entering marks, result sheets and report cards.",
    category: "academics",
    roles: ["admin", "management", "coordinator", "teacher"],
    keywords: ["exam", "marks", "result", "report card", "analytics", "grade", "monthly", "sheet", "entry"],
    intro: [
      "Exams span three stages. You create the exam against a subject and class, enter marks for each student, and then publish results as monthly result sheets or individual report cards.",
      "Smart Mark Entry is the fastest route through the second step: cascading selectors narrow the exam list by year, term, month, class, section and subject, then the batch roster loads automatically. Marks are entered in a grid that supports keyboard navigation, attendance status per student, Excel bulk-paste and debounced auto-save — so nothing is lost if the browser closes mid-entry.",
      "Analytics and registers sit alongside the entry workflow: pass rates, grade distributions, faculty and subject comparisons, and exportable reports.",
    ],
    before: [
      "An academic year is active.",
      "Standards, subjects and batches exist for the classes being examined.",
      "Students are placed in the class.",
    ],
    steps: [
      { title: "Create an exam", body: "Exams → Create Exam. Choose the subject, class, exam type, month and term. Set the maximum marks and pass marks." },
      { title: "Enter marks", body: "Exams → Smart Mark Entry. Use the cascading selectors to find the exam, then enter marks per student. Each student can be marked present, absent, medical or malpractice. Grades, percentages and live ranks are calculated by the central grading layer as you type." },
      { title: "Import marks from a spreadsheet", body: "Exams → Import Marks. Upload a spreadsheet where the column mapping is confirmed before anything is written — the same pattern as student import." },
      { title: "View result sheets", body: "Exams → Monthly Result Sheets. Pick the academic year and class to download each month's consolidated sheet as CSV, Excel or a printable PDF." },
      { title: "Generate report cards", body: "From the monthly result sheets page, open a student's report card. It aggregates their performance across subjects for a chosen month." },
      { title: "Review analytics", body: "Exams → Exam Analytics. Pass rates, averages, top and weak subjects, faculty comparisons and class rankings." },
      { title: "Export registers", body: "Exams → Reports & Registers. Exam-level and student-level data, exportable for further work." },
    ],
    whatHappensNext: [
      "Published results become visible to parents in the parent portal.",
      "The examination dashboard updates with live KPIs: total exams, pending marks entry, pass and fail rates, top faculty, top and weakest subjects and classes.",
      "Monthly result sheets and report cards carry your organization's branding.",
    ],
    callouts: [
      { kind: "important", body: "Smart Mark Entry auto-saves as you type. The grid debounces input, so a brief pause after typing commits the marks without a manual save." },
      { kind: "warning", body: "Publishing results makes them visible to parents immediately. Review the figures in the result sheet or analytics before publishing." },
      { kind: "tip", body: "For a large batch, use Import Marks rather than entering row by row. The spreadsheet format matches what Export produces, so a downloaded sheet can be filled in offline and re-uploaded." },
      { kind: "note", body: "Grades and ranks are computed centrally, not per page. The grading scheme configured for your organization applies everywhere — mark entry, result sheets, report cards and analytics all agree." },
    ],
    faq: [
      { q: "Can a teacher enter marks for another teacher's class?", a: "Only if allocated to that class, or if Management has granted the broader exam module. Teachers normally see only their own classes." },
      { q: "Why does a student show as 'absent' in the exam?", a: "Their attendance status was set to absent during mark entry. This can be changed from the same grid." },
      { q: "Can I reprint a past month's result sheet?", a: "Yes. Result sheets are generated from stored marks, so any past period can be reproduced." },
    ],
    screenshots: ["exam-dashboard", "smart-mark-entry"],
    related: ["class-allocation", "role-teacher", "document-branding"],
    permissions: [
      "exam.dashboard", "exam.smart_entry", "exam.monthly_sheets",
      "exam.report_card", "exam.analytics", "exam.registers", "exam.import_marks",
    ],
    sourceModules: [
      "src/features/exams/pages/ExamManagementDashboardPage.tsx",
      "src/features/exams/pages/SmartMarkEntryPage.tsx",
      "src/features/exams/pages/MonthlyResultSheetsPage.tsx",
      "src/features/exams/services/examInsights.service.ts",
    ],
    lastVerified: "2026-08-21",
  },

  {
    slug: "online-tests",
    title: "Online tests and MCQ exams",
    description: "Creating question papers, scheduling online exams and monitoring live attempts.",
    category: "academics",
    roles: ["admin", "management", "coordinator", "teacher"],
    keywords: ["online test", "mcq", "quiz", "question paper", "multiple choice", "import", "live", "monitor", "attempt"],
    intro: [
      "Online tests are the MCQ side of the exam engine. A question paper is a bank of multiple-choice questions; an exam schedules that paper for a set of students with a start time, end time and attempt rules.",
      "The flow runs in three parts: build the paper, schedule the exam, and monitor it while students take it. Students access the test through a shareable link — no app install required.",
      "Question papers can be built by hand, imported from a spreadsheet, or extracted from a document with the question-paper import tool.",
    ],
    before: [
      "Standards and subjects exist for the classes being tested.",
      "Students have login accounts if they will take the test through the student portal.",
    ],
    steps: [
      { title: "Create a question paper", body: "Exams → Create MCQ Paper. Add questions with options, mark the correct answer and assign marks per question. Alternatively, import from a spreadsheet or use Import Question Paper to extract questions from an uploaded document." },
      { title: "Review the paper", body: "Exams → Manage MCQ Paper opens the paper for review and editing before it is attached to an exam." },
      { title: "Schedule the exam", body: "Exams → Create MCQ Exam. Attach a paper, set the date, time window, duration and which classes or batches sit it." },
      { title: "Share the test link", body: "From the Online Tests dashboard, share the link for a scheduled exam. Students open it in a browser — the test runs there." },
      { title: "Monitor live", body: "Exams → MCQ Exam Monitor. See who has started, who has submitted and the real-time completion status while the window is open." },
      { title: "Review results", body: "Manage MCQ Exam shows submissions, scores and question-level analytics once the window closes." },
    ],
    whatHappensNext: [
      "Completed attempts are scored automatically against the answer key in the paper.",
      "Results appear in the Online Tests dashboard with per-question analytics — which questions most students got wrong, and the spread of scores.",
    ],
    callouts: [
      { kind: "important", body: "The Online Tests submodule is an additional front door onto the MCQ engine — not a replacement. Existing MCQ grants in Manage Staff Role continue to work; this page is where the flow now starts." },
      { kind: "tip", body: "Import Question Paper reads questions from an uploaded document and pre-populates the paper. Review the extracted questions carefully — the parser is deterministic, not AI-powered." },
      { kind: "note", body: "The test link works in any browser. Students do not need a separate app or a login if the test is shared as a public link." },
    ],
    faq: [
      { q: "Can students retake the test?", a: "That depends on the attempt rules set when creating the exam. A single-attempt exam locks after submission." },
      { q: "What happens if a student's browser closes mid-test?", a: "Their progress is saved. Reopening the link within the time window resumes where they left off." },
      { q: "Can I reuse a question paper across multiple exams?", a: "Yes. A paper is created once and can be attached to any number of exams." },
    ],
    screenshots: ["online-tests-dashboard"],
    related: ["exams-overview", "student-management"],
    permissions: [
      "exam.online_tests", "exam.paper_import",
    ],
    sourceModules: [
      "src/features/exams/pages/OnlineTestsDashboardPage.tsx",
      "src/features/exams/pages/CreateMcqPaperPage.tsx",
      "src/features/exams/pages/CreateMcqExamPage.tsx",
      "src/features/exams/pages/McqExamMonitorPage.tsx",
      "src/features/exams/services/mcqExam.service.ts",
    ],
    lastVerified: "2026-08-21",
  },

  {
    slug: "live-classes",
    title: "Live classes",
    description: "Schedule and manage online video classes for students.",
    category: "academics",
    roles: ["admin", "management", "coordinator", "teacher"],
    keywords: ["live class", "video", "online", "zoom", "google meet", "schedule", "recording", "virtual"],
    intro: [
      "Live Classes let you schedule online sessions that students attend through a meeting link. Each class carries a subject, teacher, standard, time slot and a meeting platform — Google Meet, Zoom or any link-based service.",
      "Teachers see their own classes in My Class; coordinators and management see and manage all scheduled classes across the institution.",
    ],
    before: [
      "Standards, subjects and batches exist.",
      "The teacher who will host the class is a staff member.",
    ],
    steps: [
      { title: "Add a class", body: "Live Class → Add Class. Enter the title, select the teacher, subject, standard and batches, set the date and time window, choose the meeting platform and paste the meeting link." },
      { title: "Set recurrence", body: "A class can repeat daily, weekly or on specific days, with an end date. Each recurrence creates a separate session, so attendance can be tracked per meeting." },
      { title: "Attach materials", body: "Add links or files to the class for students to access before or after the session." },
      { title: "Manage classes", body: "Live Class → Manage Class. View, edit or cancel scheduled classes. Filter by subject, teacher or date range." },
      { title: "Join as a teacher", body: "Live Class → My Class. Teachers see their own sessions and open the meeting link directly from the card." },
    ],
    whatHappensNext: [
      "Scheduled classes appear on teachers' My Class view and, where enabled, in the parent portal so families know when a session runs.",
      "Notifications can be sent automatically before a class starts, if communication automation is enabled for this event.",
    ],
    callouts: [
      { kind: "note", body: "Smart ARK does not host the video call. It schedules and organises the session; the call itself runs on the platform you choose — Google Meet, Zoom or another link." },
      { kind: "tip", body: "For a recurring weekly class, set the repeat rule to the days it runs and an end date at the term boundary. Each session is tracked separately." },
    ],
    faq: [
      { q: "Can students join without a login?", a: "The meeting link itself is external. Whether it requires a login depends on the meeting platform, not Smart ARK." },
      { q: "Can I cancel one session in a recurring series?", a: "Yes. Each recurrence is a separate session that can be edited or cancelled individually." },
    ],
    related: ["class-allocation", "role-teacher", "communication-automation"],
    permissions: [],
    sourceModules: [
      "src/features/live-classes/pages/AddClassPage.tsx",
      "src/features/live-classes/pages/ManageClassPage.tsx",
      "src/features/live-classes/pages/MyClassPage.tsx",
      "src/features/live-classes/services/liveClasses.service.ts",
    ],
    lastVerified: "2026-08-21",
  },

  {
    slug: "estudy-materials",
    title: "eStudy — study materials",
    description: "Upload and share study materials with students by subject and class.",
    category: "academics",
    roles: ["admin", "management", "coordinator", "teacher"],
    keywords: ["estudy", "study material", "upload", "share", "document", "video", "link", "resource"],
    intro: [
      "eStudy is where study materials live: PDFs, documents, videos, images, audio files and external links. Each material is tagged to a subject and can be scoped to specific classes and batches.",
      "Materials can be public (visible to all students in the assigned scope) or restricted to specific groups. Teachers upload and manage their own materials; management and admin see everything across the institution.",
    ],
    steps: [
      { title: "Upload a file", body: "eStudy → Create. Choose the type (document, video, image, audio), select the subject and class scope, and upload the file. The file is stored in your organization's storage." },
      { title: "Add a link", body: "Choose 'link' as the type and paste the URL. This is useful for external videos or websites without uploading a copy." },
      { title: "Set visibility", body: "Toggle visibility to control whether students can see the material. Drafts can be prepared and made visible later." },
      { title: "Manage materials", body: "eStudy → Manage. View, search, filter by subject or type, and edit or delete existing materials." },
      { title: "View shared materials", body: "eStudy → Shared shows materials shared across the institution by other staff." },
    ],
    whatHappensNext: [
      "Visible materials appear in the student and parent portals for the assigned classes.",
      "Storage counts against the organization's plan quota, visible in Billing & Subscription.",
    ],
    callouts: [
      { kind: "tip", body: "Use links for large videos hosted elsewhere rather than uploading them. This saves storage and avoids upload timeouts." },
      { kind: "note", body: "Materials are scoped to your organization. No other institution can see them, and they carry your organization's branding when previewed." },
    ],
    faq: [
      { q: "What file types are supported?", a: "PDFs, common document formats, images (PNG, JPG), video and audio files. The uploader validates the type before accepting it." },
      { q: "Can a parent download materials?", a: "If the material is visible and the parent portal includes eStudy, parents can view and download the files shared for their child's class." },
    ],
    related: ["class-allocation", "role-teacher"],
    permissions: [],
    sourceModules: [
      "src/features/estudy/pages/EStudyPages.tsx",
      "src/features/estudy/hooks/useEstudy.ts",
    ],
    lastVerified: "2026-08-21",
  },

  {
    slug: "billing-subscription",
    title: "Billing and subscription",
    description: "Your plan, usage, invoices and payments.",
    category: "billing",
    roles: ["management"],
    keywords: ["billing", "subscription", "plan", "invoice", "payment", "razorpay", "coupon", "usage", "renew"],
    intro: [
      "Billing shows your organization's current plan, how much of each capacity you are using, your invoice history and the means to pay.",
      "The page is deliberately reachable even when an organization is suspended — suspension hides business data, not the ability to settle the invoice that lifts it.",
    ],
    before: ["You are signed in with a Management role."],
    steps: [
      { title: "Review your plan", body: "Settings → Billing & Subscription. The overview tab shows your current plan, its price, the billing cycle and the renewal date." },
      { title: "Check usage", body: "The usage tab shows how many students, staff, branches, storage and messages you are using against the plan's limits." },
      { title: "View invoices", body: "The invoices tab lists every invoice with its status, amount and date. Each invoice can be downloaded as a GST tax invoice PDF — generated on the spot from the stored record." },
      { title: "Apply a coupon", body: "Enter a coupon code to apply a discount. The discount is shown before you pay." },
      { title: "Pay", body: "The payment window (Razorpay) opens from the billing page. Completing payment does not activate the subscription directly — that happens when the payment webhook confirms the transaction." },
      { title: "Cancel auto-renew", body: "Cancel turns off automatic renewal. Access continues until the end of the paid period; nothing is revoked immediately." },
    ],
    whatHappensNext: [
      "A successful payment activates or renews the subscription when the webhook confirms it — not when the browser closes the payment window.",
      "Invoices are downloadable as GST tax invoice PDFs immediately after payment.",
    ],
    callouts: [
      { kind: "important", body: "Payment confirmation comes from the payment provider's webhook, not from the browser. If the payment window closes unexpectedly, the subscription will still activate once the provider confirms." },
      { kind: "note", body: "Invoice PDFs are built at click time from the stored invoice record. There is no stored copy that could drift from the actual figures." },
      { kind: "tip", body: "Cancelling auto-renew does not end your access immediately. The current period runs to completion." },
    ],
    faq: [
      { q: "Why is the subscription not active after I paid?", a: "Payment activation depends on the provider webhook. If the payment went through but the subscription has not updated, wait a few minutes and refresh. If it persists, contact support with the payment reference." },
      { q: "Can I change my plan?", a: "Plan changes are handled by your platform provider. Contact them to upgrade or downgrade." },
      { q: "Where is my GST invoice?", a: "Invoices tab → download. Each invoice generates a tax invoice PDF on the spot." },
    ],
    related: ["role-management", "document-branding"],
    permissions: ["settings.billing"],
    sourceModules: [
      "src/features/billing/pages/BillingPage.tsx",
      "src/features/billing/services/billing.service.ts",
      "src/features/billing/documents/invoiceDownload.service.ts",
    ],
    lastVerified: "2026-08-21",
  },

  {
    slug: "student-management",
    title: "Managing students",
    description: "The student list, the 360° profile, year transfer, leave management and chat.",
    category: "students",
    roles: ["admin", "management"],
    keywords: ["student", "manage", "profile", "360", "transfer", "year", "leave", "chat", "feedback", "deactivate", "export"],
    intro: [
      "Manage Students is the central view of every student in the institution. It lists, filters, searches and exports students, and each row opens a 360° profile showing the student's attendance, documents, feedback and message history in one place.",
      "Beyond the day-to-day view, the student module handles year transfer — moving a cohort from one academic year and class to the next — leave management, student feedback and direct chat.",
    ],
    before: ["Students exist — either added individually or through the import tool."],
    steps: [
      { title: "Find a student", body: "Students → Manage Student. Search by name, filter by class, batch, status or academic year. The list supports both table and card views." },
      { title: "Open the profile", body: "Click a student to open their 360° profile. Tabs show personal details, attendance history, shared documents, feedback and chat messages." },
      { title: "Edit a student", body: "From the profile or the list, open the registration form to update personal details, contact information, class placement or status." },
      { title: "Transfer to the next year", body: "Students → Year Transfer. Select students from one class and transfer them to a target year, standard and batch. A transfer note records the reason." },
      { title: "Reverse a transfer", body: "Students → Untransfer. A mistaken transfer can be reversed, returning the student to their previous class and year." },
      { title: "Manage leave", body: "Students → Leave Request. Review and action leave requests submitted for students." },
      { title: "Chat with a student", body: "Students → Chat. Direct messaging between staff and student, visible on the student's profile timeline." },
      { title: "Record feedback", body: "Students → Feedback. Enter and review qualitative feedback for a student's record." },
      { title: "Export", body: "From Manage Students, export the filtered list as Excel or CSV." },
    ],
    whatHappensNext: [
      "Profile changes update everywhere that reads student data — attendance, fees, reports and the parent portal.",
      "Year transfers move fee assignments and class placements in one action, so the new year starts without re-entering anything.",
      "Deactivating a student hides them from active lists but retains all historical records.",
    ],
    callouts: [
      { kind: "important", body: "Year transfer is for moving a class forward at the year boundary. It is not intended for correcting a class placement — use edit for that." },
      { kind: "warning", body: "Deleting a student removes their record permanently. Deactivate instead if their history must be kept." },
      { kind: "tip", body: "Use filter presets to save common views — for example, 'active students in Class 10' — rather than re-selecting the filters each time." },
    ],
    faq: [
      { q: "Can I see a student's full attendance history?", a: "Yes. The 360° profile shows day-by-day attendance. For a broader view, use the Attendance History page under Students." },
      { q: "What happens to fees when a student is transferred?", a: "The student's fee record follows them. If the new class has a different fee structure, reassign it after the transfer." },
      { q: "Can I transfer only some students from a class?", a: "Yes. Select the students individually rather than using the header checkbox." },
    ],
    screenshots: ["student-management"],
    related: ["student-import", "fee-collection", "attendance-overview"],
    permissions: [
      "student.add", "student.manage",
    ],
    sourceModules: [
      "src/features/students/pages/ManageStudentsPage.tsx",
      "src/features/students/pages/StudentProfilePage.tsx",
      "src/features/students/pages/StudentYearTransferPage.tsx",
      "src/features/students/pages/StudentLeavePage.tsx",
      "src/features/students/pages/StudentChatPage.tsx",
    ],
    lastVerified: "2026-08-21",
  },

  {
    slug: "help-and-support",
    title: "Help and support",
    description: "Raising support tickets, tracking them and managing the triage inbox.",
    category: "organization",
    roles: ["admin", "management", "coordinator", "teacher"],
    keywords: ["help", "support", "ticket", "request", "feedback", "triage", "sla", "priority", "kanban"],
    intro: [
      "Help is the built-in support system. Any staff member can raise a support request with a category, priority and description. Tickets flow into a triage inbox where management assigns, prioritises and resolves them.",
      "The feedback board is the other half: staff share suggestions and vote on each other's ideas, giving management a picture of what matters most to the team.",
    ],
    steps: [
      { title: "Raise a request", body: "Help → Support Request. Choose a category (fees, exams, attendance, login, bug, feature request, etc.), set the priority and describe the issue. An SLA target is shown based on the priority." },
      { title: "Track your tickets", body: "Help → Support History. Every ticket you have raised, with its current status and the conversation thread." },
      { title: "Triage incoming tickets", body: "Help → Triage Inbox (Management and Admin). All open tickets across the organization in a kanban board or list view. Assign a ticket to a staff member, change its priority or status, add messages and attach files." },
      { title: "Share feedback", body: "Help → Feedback. Post suggestions or ideas. Other staff can view and react to them." },
      { title: "Review analytics", body: "Help → Ticket Analytics. Volume, resolution times, category breakdown and SLA adherence." },
    ],
    whatHappensNext: [
      "A submitted ticket appears immediately in the triage inbox for management to assign.",
      "Status changes and messages on a ticket are visible to both the requester and the assignee.",
      "Ticket analytics track resolution performance over time.",
    ],
    callouts: [
      { kind: "note", body: "SLA targets are based on priority. The triage inbox shows an SLA indicator per ticket so overdue items are visible at a glance." },
      { kind: "tip", body: "Use the kanban view for daily triage — dragging tickets between columns updates their status. Switch to the list view for filtering and bulk review." },
    ],
    faq: [
      { q: "Who sees my support ticket?", a: "You and whoever management assigns it to. The triage inbox is visible to Management and Admin roles." },
      { q: "Can I attach a screenshot to a ticket?", a: "Yes. Attachments can be added when creating the ticket and in the conversation thread afterwards." },
      { q: "What are the categories?", a: "General, Fees & payments, Exams, Attendance, Student, Staff, Login/access, App bug, Feature request, and Other." },
    ],
    related: ["role-management", "role-admin"],
    permissions: [],
    sourceModules: [
      "src/features/help/pages/SupportRequestPage.tsx",
      "src/features/help/pages/SupportHistoryPage.tsx",
      "src/features/help/pages/ManagementTriagePage.tsx",
      "src/features/help/pages/TicketAnalyticsPage.tsx",
      "src/features/help/pages/FeedbackPage.tsx",
    ],
    lastVerified: "2026-08-21",
  },

  {
    slug: "auth-and-accounts",
    title: "Authentication and accounts",
    description: "Student and parent login accounts, account health and credential repair.",
    category: "security",
    roles: ["admin", "management"],
    keywords: ["authentication", "accounts", "login", "student accounts", "parent accounts", "health", "credential", "password", "reset"],
    intro: [
      "Authentication manages the login accounts that students and parents use to access their portals. Account Health is the dashboard that surfaces missing accounts, duplicates and structural issues across the student and parent population.",
      "This is not where staff accounts live — staff logins are managed under Staff / User. This module covers student and parent credentials specifically, because those are the accounts that scale to hundreds or thousands per institution.",
    ],
    before: ["Students exist in the system.", "Parent contacts are recorded on student records."],
    steps: [
      { title: "Check account health", body: "Authentication → Account Health. The dashboard shows total students, how many have accounts, how many are missing, and flags duplicates, pending and locked accounts." },
      { title: "Review student accounts", body: "The same page lists individual student accounts with their status — active, pending, disabled, locked or no login. Accounts that need attention are highlighted." },
      { title: "Provision missing accounts", body: "Students without a login can have one created directly from the health page. The provisioned account is validated at creation time." },
      { title: "Reset a password", body: "A student or parent password can be reset from the account list. The new credentials are delivered through the configured channel." },
      { title: "Manage parent accounts", body: "Authentication → Parent Accounts. The full list of parent login accounts, linked children and account status." },
    ],
    whatHappensNext: [
      "A provisioned student account lets the student log in to the student portal and take online tests.",
      "A provisioned parent account gives the parent access to the parent portal — attendance, fees, results and reports for their linked children.",
    ],
    callouts: [
      { kind: "important", body: "Duplicate usernames or emails are flagged because they will cause login failures. Resolve them before the affected accounts try to sign in." },
      { kind: "note", body: "Account health is a snapshot — refresh it after making changes to see the updated counts." },
      { kind: "tip", body: "Provision accounts in bulk after a student import. Students without accounts cannot access online tests or the student portal." },
    ],
    faq: [
      { q: "Why does a student have no login?", a: "No account was provisioned for them. This is separate from creating the student record — a student exists before they have a login." },
      { q: "A parent cannot log in.", a: "Check their account status on the Parent Accounts page. Common causes are a missing account, a locked account or a mismatched email." },
      { q: "What is the difference between disabled and locked?", a: "Disabled is an administrative action — someone turned the account off. Locked is usually a security response — too many failed attempts." },
    ],
    related: ["student-management", "role-parent", "staff-management"],
    permissions: [],
    sourceModules: [
      "src/features/auth-accounts/pages/AccountHealthPage.tsx",
      "src/features/auth-accounts/pages/ParentAccountsPage.tsx",
      "src/features/auth-accounts/hooks/useAuthAccounts.ts",
    ],
    lastVerified: "2026-08-21",
  },
];
