// ──────────────────────────────────────────────────────────────────────────────
// eStudy module — starter pages
//
// Create, Manage and Shared screens for study material (notes, video, links).
// Backed by localStorage via ModuleStarterPage. The "Shared" view filters
// the same dataset by visibility=shared so admins can see what's been
// distributed to students.
// ──────────────────────────────────────────────────────────────────────────────

import { BookOpen } from "lucide-react";
import { ModuleStarterPage, type StarterField } from "@/shared/components";

const STORAGE_KEY = "estudy_material";

const fields: StarterField[] = [
  {
    name: "title",
    label: "Title",
    type: "text",
    required: true,
    placeholder: "e.g., Trigonometry — Chapter 5 notes",
  },
  {
    name: "subject",
    label: "Subject",
    type: "text",
    required: true,
    placeholder: "e.g., Mathematics",
  },
  {
    name: "batch",
    label: "Class / Batch",
    type: "text",
    placeholder: "e.g., 12-A, NEET 2026",
  },
  {
    name: "kind",
    label: "Material type",
    type: "select",
    required: true,
    options: [
      { value: "notes", label: "Notes (PDF / document)" },
      { value: "video", label: "Video" },
      { value: "link", label: "External link" },
      { value: "image", label: "Image" },
      { value: "audio", label: "Audio" },
    ],
  },
  {
    name: "url",
    label: "Link or file URL",
    type: "text",
    placeholder: "Paste the resource URL here",
    hint: "When the file upload service is ready, you'll be able to drop files directly.",
  },
  {
    name: "visibility",
    label: "Visibility",
    type: "select",
    required: true,
    options: [
      { value: "private", label: "Private (only you)" },
      { value: "shared", label: "Shared (visible to students)" },
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    placeholder: "What's in this material and who is it for?",
  },
];

const columns = [
  { key: "title", header: "Title" },
  { key: "subject", header: "Subject" },
  { key: "batch", header: "Batch" },
  { key: "kind", header: "Type" },
  { key: "visibility", header: "Visibility" },
];

export const CreateStudyMaterialPage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="Create Study Material"
    description="Upload notes, video links or external resources. Shared materials become visible to assigned students."
    icon={<BookOpen className="w-5 h-5" />}
    entityNoun="Study material"
    fields={fields}
    columns={columns}
  />
);

export const ManageStudyMaterialPage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="Manage Study Material"
    description="Review every piece of material you've added — edit, change visibility or remove items."
    icon={<BookOpen className="w-5 h-5" />}
    entityNoun="Study material"
    fields={fields}
    columns={columns}
  />
);

export const SharedStudyMaterialPage = () => (
  <ModuleStarterPage
    storageKey={STORAGE_KEY}
    title="Manage Shared Study Material"
    description="Everything currently visible to students. Use Manage Study Material to make a private item shared, or revoke sharing here."
    icon={<BookOpen className="w-5 h-5" />}
    entityNoun="Study material"
    fields={fields}
    columns={columns}
    filter={{ field: "visibility", value: "shared" }}
    emptyMessage="No shared materials yet. Set a material's visibility to 'shared' to publish it."
  />
);

export default ManageStudyMaterialPage;
