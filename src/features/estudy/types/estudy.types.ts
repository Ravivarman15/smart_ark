export type StudyMaterialKind = "notes" | "video" | "link" | "image" | "audio";
export type StudyMaterialVisibility = "private" | "shared";

export interface StudyMaterial {
  id: string;
  title: string;
  subjectId?: string;
  subjectName?: string;
  batchId?: string;
  batchName?: string;
  kind: StudyMaterialKind;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  visibility: StudyMaterialVisibility;
  description?: string;
  uploadedBy?: string;
  uploaderName?: string;
  createdAt: string;
}

export interface StudyMaterialInput {
  title: string;
  subjectId?: string;
  batchId?: string;
  kind: StudyMaterialKind;
  url?: string;
  file?: File;
  visibility: StudyMaterialVisibility;
  description?: string;
}
