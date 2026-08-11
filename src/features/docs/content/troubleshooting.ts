import type { DocArticle } from "../types";

// ──────────────────────────────────────────────────────────────────────────────
// TROUBLESHOOTING
//
// Every entry below is a problem that ACTUALLY OCCURRED in this system and was
// diagnosed. No invented error codes, no hypothetical failures — a
// troubleshooting page whose symptoms nobody has seen sends people looking for
// the wrong thing.
// ──────────────────────────────────────────────────────────────────────────────

export const TROUBLESHOOTING: DocArticle[] = [
  {
    slug: "troubleshoot-enquiry-link",
    title: "The enquiry form says “Institution not found”",
    description: "The generic enquiry address cannot identify your institution.",
    category: "troubleshooting",
    roles: ["admin", "management"],
    keywords: ["enquiry", "apply", "institution not found", "lead", "form", "link"],
    intro: [
      "Opening the enquiry form shows “Institution not found” instead of your form.",
    ],
    steps: [
      { title: "Why it happens", body: "The generic address carries no institution name. With more than one institution on the platform it cannot tell whose form a visitor opened, and guessing would deliver your enquiries to someone else." },
      { title: "How to verify", body: "Look at the address. If it ends at /leads/apply with nothing after it, that is the generic one." },
      { title: "The fix", body: "Use your own link, which ends with your institution's name. Find it in Leads → Automation Config, or on the Enquiry Management page." },
      { title: "Who can fix it", body: "Any Admin or Management user can copy the correct link." },
    ],
    callouts: [
      { kind: "important", body: "Replace the old link anywhere you have published it — website, social profiles, printed material. The generic one will not deliver enquiries." },
    ],
    related: ["organization-setup"],
    permissions: [],
    sourceModules: [
      "src/features/leads/pages/PublicLeadFormPage.tsx",
      "src/features/leads/components/EnquiryLinkCard.tsx",
    ],
    lastVerified: "2026-08-11",
  },

  {
    slug: "troubleshoot-signup-email",
    title: "Sign-up fails with “email rate limit exceeded”",
    description: "A provider-side sending limit, not a problem with the address.",
    category: "troubleshooting",
    roles: ["platform"],
    keywords: ["signup", "email", "rate limit", "verification", "confirmation", "register"],
    intro: [
      "Creating an account fails with “email rate limit exceeded”, and trying a different address makes no difference.",
    ],
    steps: [
      { title: "Why it happens", body: "The confirmation email is subject to an hourly cap that applies to the whole platform, not to one address. Once it is spent, every sign-up fails until the hour rolls over." },
      { title: "How to verify", body: "The same error appears for any address, including ones never used before." },
      { title: "The fix", body: "Configure a dedicated mail sender for the platform, which raises the ceiling from a handful per hour to a normal sending quota." },
      { title: "Who can fix it", body: "Platform administrator. It is a provider configuration change, not something an institution can adjust." },
    ],
    callouts: [
      { kind: "note", body: "No account is created when this error appears, so there is nothing to clean up. The address can be used again once sending recovers." },
    ],
    related: ["role-platform-admin"],
    permissions: [],
    sourceModules: ["src/features/marketing/pages/SignupPage.tsx"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "troubleshoot-receipt-logo",
    title: "Our logo is missing from receipts",
    description: "A linked image usually cannot be embedded in a generated document.",
    category: "troubleshooting",
    roles: ["admin", "management"],
    keywords: ["logo", "receipt", "branding", "missing", "pdf", "image"],
    intro: [
      "A logo URL was entered in branding, the settings preview looks right, but receipts and payslips show initials instead.",
    ],
    steps: [
      { title: "Why it happens", body: "Documents are rendered to an image before becoming a PDF, which requires reading the logo's pixels. Most external hosts block that, so the image is dropped from the document while still displaying normally on screen." },
      { title: "How to verify", body: "Generate a receipt and compare it with the branding preview. If the preview shows the logo and the receipt does not, this is the cause." },
      { title: "The fix", body: "Upload the logo file in Settings → Branding & White Label → Documents instead of linking to it." },
      { title: "Who can fix it", body: "Admin or Management." },
    ],
    callouts: [
      { kind: "tip", body: "PNG with a transparent background reproduces best on both light receipts and dark headers." },
    ],
    related: ["document-branding", "fee-collection"],
    permissions: ["settings.branding"],
    sourceModules: ["src/features/branding/pages/BrandingPage.tsx"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "troubleshoot-checkin-location",
    title: "Staff cannot check in with location verification",
    description: "Radius, coordinates or permission — in that order of likelihood.",
    category: "troubleshooting",
    roles: ["admin", "management"],
    keywords: ["check-in", "location", "gps", "radius", "outside", "verification", "failed"],
    intro: [
      "After switching on location-verified check-in, staff at the campus are reported as outside the allowed area.",
    ],
    steps: [
      { title: "Why it happens", body: "Usually the stored coordinates do not match the building, or the radius is too small for the site. Less often the browser was refused location permission." },
      { title: "How to verify", body: "Stand at the campus and use Test location in Settings → Check-in & Check-out. It reports your position, the nearest configured location, the measured distance and the allowed radius — without recording attendance." },
      { title: "The fix", body: "If the distance is large, the coordinates are wrong — re-enter them from a map pin on the building. If it is close but over, raise that location's radius." },
      { title: "Who can fix it", body: "Admin or Management, in check-in settings." },
    ],
    callouts: [
      { kind: "tip", body: "Turn enforcement off while you are tuning. Positions are still recorded and flagged, but nobody is blocked from checking in while you get the radius right." },
    ],
    related: ["checkin-setup"],
    permissions: ["settings.checkin"],
    sourceModules: ["src/features/settings/pages/CheckinSettingsPage.tsx"],
    lastVerified: "2026-08-11",
  },

  {
    slug: "troubleshoot-no-fees",
    title: "An imported student shows no fees",
    description: "Creating a student does not create a fee record.",
    category: "troubleshooting",
    roles: ["admin", "management"],
    keywords: ["fees", "missing", "import", "student", "no fee", "balance"],
    intro: [
      "Students imported successfully, but Fees Management shows nothing for them.",
    ],
    steps: [
      { title: "Why it happens", body: "Fees are owed only once a fee structure has been assigned. Creating or importing a student does not assign one — which is deliberate, since different students may be on different structures." },
      { title: "How to verify", body: "Open the student. No fee record means none has been assigned." },
      { title: "The fix", body: "Fees → Fee Structures. Assign the structure to the class, which covers every student in it in one action." },
      { title: "Who can fix it", body: "Admin or Management." },
    ],
    related: ["fee-collection", "student-import"],
    permissions: ["fee.manage_structure", "fee.manage"],
    sourceModules: ["src/features/fee/components/FeeReceiptDialog.tsx"],
    lastVerified: "2026-08-11",
  },
];
