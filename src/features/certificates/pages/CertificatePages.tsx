// ──────────────────────────────────────────────────────────────────────────────
// Certificate module — starter pages
//
// Add and Manage screens for student certificates (achievement, completion,
// attendance, character). Backed by localStorage via ModuleStarterPage so the
// pages are immediately usable; swap to Supabase later by replacing the
// storageKey with a real service hook.
// ──────────────────────────────────────────────────────────────────────────────

import { ShieldCheck } from "lucide-react";
import { ModuleStarterPage, type StarterField } from "@/shared/components";

const STORAGE_KEY = "certificates";

const fields: StarterField[] = [
  {
    name: "studentName",
    label: "Student name",
    type: "text",
    required: true,
    placeholder: "Full name as it should appear on the certificate",
  },
  {
    name: "type",
    label: "Certificate type",
    type: "select",
    required: true,
    options: [
      { value: "achievement", label: "Achievement" },
      { value: "completion", label: "Course completion" },
      { value: "attendance", label: "Attendance" },
      { value: "character", label: "Character / Conduct" },
      { value: "merit", label: "Merit" },
    ],
  },
  {
    name: "title",
    label: "Title",
    type: "text",
    required: true,
    placeholder: "e.g., Class 12 Topper 2025-26",
  },
  { name: "issueDate", label: "Issue date", type: "date", required: true },
  {
    name: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      { value: "draft", label: "Draft" },
      { value: "issued", label: "Issued" },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    placeholder: "Any additional remarks for this certificate",
  },
];

const columns = [
  { key: "studentName", header: "Student" },
  { key: "type", header: "Type" },
  { key: "title", header: "Title" },
  { key: "issueDate", header: "Issue date" },
  { key: "status", header: "Status" },
];

export const AddCertificatePage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="Add Certificate"
    description="Issue a new certificate to a student. Saved certificates appear in Manage Certificates and can be edited or printed from there."
    icon={<ShieldCheck className="w-5 h-5" />}
    entityNoun="Certificate"
    fields={fields}
    columns={columns}
  />
);

export const ManageCertificatesPage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="Manage Certificates"
    description="View, edit and revoke certificates issued to students."
    icon={<ShieldCheck className="w-5 h-5" />}
    entityNoun="Certificate"
    fields={fields}
    columns={columns}
  />
);

export default ManageCertificatesPage;
