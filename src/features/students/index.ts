// Public API of the students feature.
// External code (pages, AppDataContext bridge, other features) should
// import from "@/features/students" — never reach into subfolders.

export type {
  Student,
  StudentRisk,
  RetestStatus,
  CreateStudentInput,
  UpdateStudentInput,
} from "./types/student.types";

export { studentSchema, type StudentFormValues } from "./schemas/student.schema";
export { studentsService } from "./services/students.service";

export {
  useStudents,
  useStudent,
  useCreateStudent,
  useUpdateStudent,
  useDeactivateStudent,
} from "./hooks";
