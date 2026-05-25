import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { commsRecipientsService } from "../services";
import type { AudienceFilter } from "../types/communication.types";

export const useStudentCandidates = (filter: AudienceFilter = {}) =>
  useQuery({
    queryKey: queryKeys.communication.recipientCandidates("students", filter),
    queryFn: () => commsRecipientsService.students(filter),
    staleTime: 60_000,
  });

export const useStaffCandidates = (filter: AudienceFilter = {}) =>
  useQuery({
    queryKey: queryKeys.communication.recipientCandidates("staff", filter),
    queryFn: () => commsRecipientsService.staff(filter),
    staleTime: 60_000,
  });

export const useInquiryCandidates = (filter: AudienceFilter = {}) =>
  useQuery({
    queryKey: queryKeys.communication.recipientCandidates("inquiries", filter),
    queryFn: () => commsRecipientsService.inquiries(filter),
    staleTime: 60_000,
  });

export const useAbsentTodayCandidates = (date: string) =>
  useQuery({
    queryKey: queryKeys.communication.recipientCandidates("absent", { date }),
    queryFn: () => commsRecipientsService.absentToday(date),
    enabled: !!date,
    staleTime: 60_000,
  });

export const useBirthdayCandidates = (date: string) =>
  useQuery({
    queryKey: queryKeys.communication.recipientCandidates("birthdays", { date }),
    queryFn: () => commsRecipientsService.birthdaysOn(date),
    enabled: !!date,
    staleTime: 60_000,
  });

export const useFeeStatusCandidates = (scope: "due" | "all" = "due") =>
  useQuery({
    queryKey: queryKeys.communication.recipientCandidates("fee_status", { scope }),
    queryFn: () => commsRecipientsService.studentsWithFeeStatus(scope),
    staleTime: 60_000,
  });
