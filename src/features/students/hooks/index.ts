// Core student CRUD
export { useStudents } from "./useStudents";
export { useStudent } from "./useStudent";
export { useCreateStudent } from "./useCreateStudent";
export { useUpdateStudent } from "./useUpdateStudent";
export { useDeactivateStudent } from "./useDeactivateStudent";

// Lookups
export {
  useStandardOptions,
  useBatchOptions,
  useCourseTypeOptions,
  useCampusOptions,
  useAcademicYearOptions,
} from "./useStudentLookups";

// Attendance
export {
  useAttendanceDay,
  useSaveAttendance,
  useAttendanceHistory,
  useBatchAttendanceAnalytics,
  useAbsentList,
} from "./useStudentAttendance";

// Documents
export {
  useStudentDocuments,
  useUploadDocument,
  useSetDocumentShared,
  useDeleteDocument,
} from "./useStudentDocuments";

// Leave
export {
  useStudentLeave,
  useCreateLeave,
  useReviewLeave,
  useDeleteLeave,
} from "./useStudentLeave";

// Year transfer
export {
  useStudentTransfers,
  useTransferStudents,
  useRollbackTransfer,
} from "./useStudentTransfer";

// Feedback
export {
  useStudentFeedback,
  useCreateFeedback,
  useDeleteFeedback,
} from "./useStudentFeedback";

// Communication
export { useStudentMessages, useSendMessage } from "./useStudentChat";

// App access / rights
export { useAppAccess, useSaveAppAccess } from "./useAppAccess";

// Import
export { useImportHistory, useCommitImport } from "./useStudentImport";

// Profile health (dashboard + data health)
export { useStudentProfileHealth } from "./useStudentProfileHealth";
