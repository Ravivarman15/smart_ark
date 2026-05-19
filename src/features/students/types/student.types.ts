// Domain types for the Students feature.
// These are app-facing — mapping to/from DB row shapes happens inside
// students.service.ts so the rest of the app never sees snake_case.

export type StudentRisk = "safe" | "watch" | "critical";
export type RetestStatus = "none" | "pending" | "allocated" | "completed";

export interface Student {
  id: string;
  name: string;
  batch: string;           // batch name (joined from batches.name)
  spi: number;             // student performance index
  risk: StudentRisk;
  active: boolean;
  campus?: string;
  subject?: string;
  lastTestDate?: string;
  retestStatus?: RetestStatus;
  parentName?: string;
  parentContact?: string;
  parentContact1?: string;
  parentContact2?: string;
  parentEmail?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
}

/** Payload shape for creating a student. id+active are server-controlled. */
export type CreateStudentInput = Omit<Student, "id" | "active">;

/** Partial update. All fields optional. */
export type UpdateStudentInput = Partial<Omit<Student, "id">>;
