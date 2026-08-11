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
];
