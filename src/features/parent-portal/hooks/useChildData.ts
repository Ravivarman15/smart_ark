// ── Parent Portal — per-child data hooks ─────────────────────────────────────
//
// Each page owns one hook, so navigating to Fees fetches fee data and nothing
// else. That is the whole lazy-loading strategy: no page-level code splitting
// trick, just queries scoped to the page that renders them.
//
// Every hook is keyed by STUDENT id, so switching child swaps cache entries
// instead of refetching into a shared slot — the previous child's data stays
// warm and switching back is instant.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { fetchStudentInsights } from "@/features/students/hooks/useStudentInsights";
import { documentsService } from "@/features/students/services";
import { communicationService } from "@/features/students/services/communication.service";
import { commsTimelineService } from "@/features/communication/services";
import { parentPortalService } from "../services/parentPortal.service";
import { parentAuditService } from "../services/parentAudit.service";
import type { Student } from "@/features/students/types";

/**
 * Portal visits in the last 30 days — the second signal behind the engagement
 * card. Keyed by PARENT (not child): it measures the parent, not the student.
 */
export const useParentVisitCount = (parentAccountId: string | undefined) =>
  useQuery({
    queryKey: parentAccountId
      ? [...queryKeys.parentPortal.all, "visits", parentAccountId]
      : [...queryKeys.parentPortal.all, "visits", "none"],
    queryFn: () => parentAuditService.visitCount(parentAccountId as string, 30),
    enabled: !!parentAccountId,
    staleTime: 5 * 60_000,
  });

/** Cheap Home-card rollup for one child. */
export const useChildSummary = (student: Student | undefined) =>
  useQuery({
    queryKey: student
      ? queryKeys.parentPortal.overview(student.id)
      : [...queryKeys.parentPortal.all, "overview", "none"],
    queryFn: () => parentPortalService.childSummary(student as Student),
    enabled: !!student,
    staleTime: 60_000,
  });

/**
 * Full academic + fee insights. Shared by the Academics, Exams and Fees pages
 * under ONE cache key — the three pages read different slices of the same
 * bundle, so a parent moving between them refetches nothing.
 */
export const useChildInsights = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.parentPortal.academics(studentId)
      : [...queryKeys.parentPortal.all, "academics", "none"],
    queryFn: () => fetchStudentInsights(studentId as string),
    enabled: !!studentId,
    staleTime: 60_000,
  });

export const useChildAttendance = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.parentPortal.attendance(studentId)
      : [...queryKeys.parentPortal.all, "attendance", "none"],
    queryFn: () => parentPortalService.attendanceDays(studentId as string),
    enabled: !!studentId,
    staleTime: 60_000,
  });

/** Merged timetable + live classes for one date. */
export const useChildClasses = (student: Student | undefined, date: string) =>
  useQuery({
    queryKey: student
      ? queryKeys.parentPortal.schedule(student.id, date)
      : [...queryKeys.parentPortal.all, "schedule", "none", date],
    queryFn: () => parentPortalService.classesFor(student as Student, date),
    enabled: !!student,
    staleTime: 30_000,
  });

/** Live classes across a window — drives the Live Classes page. */
export const useChildLiveClasses = (student: Student | undefined, from: string, to: string) =>
  useQuery({
    queryKey: student
      ? [...queryKeys.parentPortal.liveClasses(student.id), from, to]
      : [...queryKeys.parentPortal.all, "live-classes", "none"],
    queryFn: () => parentPortalService.liveClasses(student as Student, from, to),
    enabled: !!student,
    staleTime: 30_000,
  });

/** Published results with rank + teacher remark. */
export const useChildResults = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? [...queryKeys.parentPortal.exams(studentId), "results"]
      : [...queryKeys.parentPortal.all, "exams", "none", "results"],
    queryFn: () => parentPortalService.examResults(studentId as string),
    enabled: !!studentId,
    staleTime: 60_000,
  });

export const useChildUpcomingExams = (student: Student | undefined) =>
  useQuery({
    queryKey: student
      ? queryKeys.parentPortal.exams(student.id)
      : [...queryKeys.parentPortal.all, "exams", "none"],
    queryFn: () => parentPortalService.upcomingExams(student as Student, 20),
    enabled: !!student,
    staleTime: 60_000,
  });

/**
 * Message history addressed to this child. Reuses the Communication Center's
 * timeline service — the portal reads the same `message_queue` rows the staff
 * Communication Timeline shows, so delivery status can never disagree.
 */
export const useChildMessages = (student: Student | undefined) =>
  useQuery({
    queryKey: student
      ? queryKeys.parentPortal.communication(student.id)
      : [...queryKeys.parentPortal.all, "communication", "none"],
    queryFn: () =>
      commsTimelineService.forRecipient(
        {
          studentId: (student as Student).id,
          phone: (student as Student).parentContact || (student as Student).studentContact,
        },
        200,
      ),
    enabled: !!student,
    staleTime: 60_000,
  });

/**
 * Documents for this child.
 *
 * `shared: true` is the access rule, not a filter preference: a document is
 * visible to a family only once staff have explicitly shared it. RLS lets a
 * parent read every row for their child, so this narrowing is what implements
 * the institution's "share with parent" decision — do not relax it.
 */
export const useChildDocuments = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.parentPortal.documents(studentId)
      : [...queryKeys.parentPortal.all, "documents", "none"],
    queryFn: () => documentsService.list({ studentId: studentId as string, shared: true }),
    enabled: !!studentId,
    staleTime: 60_000,
  });

// ── Two-way chat ────────────────────────────────────────────────────────────
//
// The same `student_messages` table the staff "Chat With Students" page writes
// to, through the same service. The parent portal previously showed only
// `message_queue` — an OUTBOUND delivery log — which is why a staff chat
// message never appeared here: it was never in that table, and never would be.
//
// `staleTime: 0` and a poll, unlike every other hook in this file. The rest of
// the portal reads yesterday's attendance and last term's results, where a
// minute of staleness is invisible. A conversation is the one surface where it
// is the whole experience.

const CHAT_POLL_MS = 15_000;

export const useChildChat = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.parentPortal.chat(studentId)
      : [...queryKeys.parentPortal.all, "chat", "none"],
    queryFn: () => communicationService.list(studentId as string),
    enabled: !!studentId,
    staleTime: 0,
    refetchInterval: studentId ? CHAT_POLL_MS : false,
  });

/**
 * Send a reply as the family.
 *
 * Writes `direction: "in"` with a null sender — RLS refuses anything else from
 * a parent account, so a reply can never be rendered as though the institution
 * sent it.
 */
export const useSendChildReply = (studentId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => communicationService.reply(studentId as string, body),
    onSuccess: () => {
      if (studentId) {
        qc.invalidateQueries({ queryKey: queryKeys.parentPortal.chat(studentId) });
      }
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Your message could not be sent. Please try again.",
      ),
  });
};

/** Mark the institution's messages as read once the family has seen them. */
export const useMarkChatRead = (studentId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => communicationService.markRead(ids),
    onSuccess: (changed) => {
      if (changed > 0 && studentId) {
        qc.invalidateQueries({ queryKey: queryKeys.parentPortal.chat(studentId) });
      }
    },
    onError: () => undefined,
  });
};
