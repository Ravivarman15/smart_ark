import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { riskAnalyticsService, staffAnalyticsService, studentAnalyticsService } from "../services";
import type { StaffAnalyticsRange, StudentAnalyticsFilters } from "../types/analytics.types";

export const useStudentAnalytics = (filters: StudentAnalyticsFilters, enabled = true) =>
  useQuery({
    queryKey: queryKeys.attendance.analytics("student", filters as Record<string, unknown>),
    queryFn: () => studentAnalyticsService.analyze(filters),
    enabled,
  });

export const useStaffAnalytics = (range: StaffAnalyticsRange, enabled = true) =>
  useQuery({
    queryKey: queryKeys.attendance.analytics("staff", range as Record<string, unknown>),
    queryFn: () => staffAnalyticsService.analyze(range),
    enabled,
  });

export const useRiskAnalytics = (filters: StudentAnalyticsFilters, enabled = true) =>
  useQuery({
    queryKey: queryKeys.attendance.analytics("risk", filters as Record<string, unknown>),
    queryFn: () => riskAnalyticsService.analyze(filters),
    enabled,
  });
