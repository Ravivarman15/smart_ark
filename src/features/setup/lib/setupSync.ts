// ──────────────────────────────────────────────────────────────────────────────
// Centralized Setup-data synchronization.
//
// PROBLEM THIS SOLVES
// Setup records (standards / batches / course types / academic years / subjects
// / taxes) are read by EVERY module through its own lookup layer:
//
//   students    → queryKeys.students.lookups(...)   (useStudentLookups)
//   fees        → queryKeys.fees.lookups(...)        (useFeeLookups / useFeeStructures)
//   exams       → queryKeys.exams.lookups(...)       (useExamResults)
//   live-classes→ queryKeys.liveClasses.lookups(...) (useLiveClassLookups)
//   setup pages → queryKeys.setup.*                  (useStandards, useBatches, …)
//
// Before this module, a Setup mutation only invalidated `queryKeys.setup.*`, so
// a brand-new "Grade 4 ICSE" standard never reached the Student Registration
// dropdown (it reads `students.lookups("standards")` with a 1-hour staleTime).
//
// THE FIX
// One function — `invalidateSetupLookups` — fans a single Setup change out to
// every lookup-bearing namespace across the ERP. It is called from:
//   1. every Setup mutation's onSuccess (instant, same-client), and
//   2. SetupRealtimeProvider on any postgres_changes event (cross-client).
//
// React Query's invalidateQueries refetches *active* queries regardless of their
// staleTime, so any form / dropdown / filter currently on screen refreshes
// immediately without a reload.
// ──────────────────────────────────────────────────────────────────────────────

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";

/**
 * Setup tables watched for realtime sync. The matching DB migration adds these
 * to the `supabase_realtime` publication; if a table isn't published yet the
 * subscription simply never fires (migration-safe — never throws).
 */
export const SETUP_REALTIME_TABLES = [
  "standards",
  "batches",
  "course_types",
  "academic_years",
  "subjects",
  "taxes",
  "standard_course_types",
  "batch_subjects",
  "campuses",
] as const;

/** Shared staleTime for every lookup query. Keeps cold-mount data fresh while
 *  invalidation handles the "data just changed" case. */
export const LOOKUP_STALE_TIME = 60_000;

/**
 * Every React Query namespace root that derives from Setup data. Changing any
 * Setup record can affect joined names (e.g. a renamed standard shows in a
 * student list), dropdown options, filters and aggregates — so all of these
 * are invalidated together. invalidateQueries matches by key prefix, so the
 * roots cover all nested kinds (e.g. `["students","lookups","standards"]`).
 */
const DEPENDENT_NAMESPACES = [
  queryKeys.setup.all,
  queryKeys.students.all,
  queryKeys.fees.all,
  queryKeys.exams.all,
  queryKeys.liveClasses.all,
  queryKeys.attendance.all,
  queryKeys.enquiries.all,
  queryKeys.reports.all,
  queryKeys.communication.all,
  queryKeys.dashboard.all,
] as const;

/**
 * Fan a Setup change out to every dependent namespace. Cheap: invalidateQueries
 * only triggers a network refetch for queries with mounted (active) observers;
 * everything else is just marked stale for its next mount.
 */
export function invalidateSetupLookups(qc: QueryClient): void {
  for (const key of DEPENDENT_NAMESPACES) {
    qc.invalidateQueries({ queryKey: key });
  }
}

// ── Diagnostics ─────────────────────────────────────────────────────────────
// Surfaced for the System Health page and dev-time warnings. Documents the
// known per-module lookup duplication so a future consolidation has a map, and
// lets operators confirm the realtime publication is wired.

export interface LookupHookRef {
  module: string;
  hook: string;
  /** React Query key prefix the hook reads under. */
  keyPrefix: string;
  setupTable: string;
}

/** Known duplicate lookup hooks across modules — all kept live by
 *  invalidateSetupLookups. Listed so "duplicate lookup hook detection" has a
 *  single source of truth. */
export const SETUP_LOOKUP_HOOKS: LookupHookRef[] = [
  { module: "setup",        hook: "useStandards",          keyPrefix: "setup/standards",          setupTable: "standards" },
  { module: "setup",        hook: "useBatches",            keyPrefix: "setup/batches",            setupTable: "batches" },
  { module: "setup",        hook: "useCourseTypes",        keyPrefix: "setup/course-types",       setupTable: "course_types" },
  { module: "setup",        hook: "useAcademicYears",      keyPrefix: "setup/years",              setupTable: "academic_years" },
  { module: "setup",        hook: "useSubjects",           keyPrefix: "setup/subjects",           setupTable: "subjects" },
  { module: "setup",        hook: "useTaxes",              keyPrefix: "setup/taxes",              setupTable: "taxes" },
  { module: "students",     hook: "useStandardOptions",    keyPrefix: "students/lookups/standards", setupTable: "standards" },
  { module: "students",     hook: "useBatchOptions",       keyPrefix: "students/lookups/batches", setupTable: "batches" },
  { module: "students",     hook: "useCourseTypeOptions",  keyPrefix: "students/lookups/course-types", setupTable: "course_types" },
  { module: "students",     hook: "useAcademicYearOptions",keyPrefix: "students/lookups/academic-years", setupTable: "academic_years" },
  { module: "fees",         hook: "useFee*Lookups",        keyPrefix: "fees/lookups",             setupTable: "standards,batches,course_types,academic_years,taxes" },
  { module: "exams",        hook: "useExamFormLookups",    keyPrefix: "exams/lookups/form",       setupTable: "standards,subjects,batches" },
  { module: "live-classes", hook: "useLiveClassLookups",   keyPrefix: "live-classes/lookups",     setupTable: "standards,subjects,batches" },
];

/** One-time dev warning if the realtime channel can't subscribe (usually means
 *  the setup tables aren't in the supabase_realtime publication yet). */
export function warnSetupPublicationMissing(status: string): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[setup-sync] realtime channel status "${status}". Setup changes will ` +
        `still sync on the editing client (mutation invalidation), but ` +
        `cross-client live updates require the setup tables to be in the ` +
        `supabase_realtime publication (migration 20260605_setup_realtime_publication).`
    );
  }
}
