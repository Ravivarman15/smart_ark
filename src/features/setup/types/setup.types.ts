// Setup module — domain types. Mirrors the DB column shape after the
// 20260520_setup_extensions migration. All new optional fields are typed
// as `?` so legacy callers reading the table before migration still work.

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: string;
}

export interface AcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface Standard {
  id: string;
  name: string;
  displayOrder: number;
  createdAt?: string;
}
export interface StandardInput {
  name: string;
  displayOrder?: number;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  standardId?: string;
  isOptional: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt?: string;
}
export interface SubjectInput {
  name: string;
  code?: string;
  standardId?: string | null;
  isOptional?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CourseType {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
}
export interface CourseTypeInput {
  name: string;
  description?: string;
}

export interface Tax {
  id: string;
  name: string;
  percentage: number;
  amount?: number;
  taxType: "percentage" | "fixed";
  isActive: boolean;
  createdAt?: string;
}
export interface TaxInput {
  name: string;
  taxType: "percentage" | "fixed";
  percentage?: number;
  amount?: number;
  isActive?: boolean;
}

export interface Batch {
  id: string;
  name: string;
  campusId?: string;
  campusName?: string;
  standardId?: string;
  standardName?: string;
  courseTypeId?: string;
  courseTypeName?: string;
  coordinatorId?: string;
  coordinatorName?: string;
  timingStart?: string;
  timingEnd?: string;
  capacity?: number;
  room?: string;
  isActive: boolean;
  health?: string;
  academicYearId?: string;
  createdAt?: string;
}
export interface BatchInput {
  name: string;
  campusId?: string;
  standardId?: string;
  courseTypeId?: string;
  coordinatorId?: string;
  timingStart?: string;
  timingEnd?: string;
  capacity?: number;
  room?: string;
  isActive?: boolean;
  health?: string;
  academicYearId?: string;
}

// Junctions
export interface StandardCourseType {
  id: string;
  standardId: string;
  courseTypeId: string;
}
export interface BatchSubject {
  id: string;
  batchId: string;
  subjectId: string;
  teacherProfileId?: string;
}

// Timetable
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TimetablePeriod {
  id: string;
  batchId: string;
  dayOfWeek: DayOfWeek;
  periodNo: number;
  subjectId?: string;
  subjectName?: string;
  teacherProfileId?: string;
  teacherName?: string;
  startTime?: string;
  endTime?: string;
  room?: string;
  notes?: string;
  updatedAt?: string;
}
export interface TimetablePeriodUpsert {
  batchId: string;
  dayOfWeek: DayOfWeek;
  periodNo: number;
  subjectId?: string | null;
  teacherProfileId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  room?: string | null;
  notes?: string | null;
}
