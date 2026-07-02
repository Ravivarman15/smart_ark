import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { examInsightsService, type InsightsFilters } from "../services";

// Query hooks for the analytics engine (Phase 5 / 11 / AI). Filters bound the
// gathered set so the same engine scales from one class to the whole school.

export const useExamAnalyticsBundle = (filters: InsightsFilters = {}) =>
  useQuery({
    queryKey: queryKeys.exams.lookups(`analytics:${JSON.stringify(filters)}`),
    queryFn: () => examInsightsService.analytics(filters),
  });

export const useExamDashboard = (filters: InsightsFilters = {}) =>
  useQuery({
    queryKey: queryKeys.exams.lookups(`dashboard:${JSON.stringify(filters)}`),
    queryFn: () => examInsightsService.dashboard(filters),
  });

export const useExamAiInsights = (filters: InsightsFilters = {}) =>
  useQuery({
    queryKey: queryKeys.exams.lookups(`ai:${JSON.stringify(filters)}`),
    queryFn: () => examInsightsService.aiInsights(filters),
  });
