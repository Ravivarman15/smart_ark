import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { reportAggregatorService } from "../services";
import type { ReportFilterValues } from "../types/reports.types";

// Generic single-call hooks. Each report page picks the one matching its
// aggregator method. All KPI / chart / table data comes from a single
// React Query subscription so realtime invalidation (later) refreshes
// the whole report in one go.

export const useExpenseReport = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("expense", filters),
    queryFn: () => reportAggregatorService.expenseReport(filters),
    staleTime: 30_000,
  });

export const useIncomeReport = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("income", filters),
    queryFn: () => reportAggregatorService.incomeReport(filters),
    staleTime: 30_000,
  });

export const usePayrollExpenseReport = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("payroll_expense", filters),
    queryFn: () => reportAggregatorService.payrollExpenseReport(filters),
    staleTime: 30_000,
  });

export const useProfitLossReport = () =>
  useQuery({
    queryKey: queryKeys.reports.data("profit_loss"),
    queryFn: () => reportAggregatorService.profitLossReport(),
    staleTime: 30_000,
  });

export const useProfitLossAnalysis = () =>
  useQuery({
    queryKey: queryKeys.reports.data("profit_loss_analysis"),
    queryFn: () => reportAggregatorService.profitLossAnalysis(),
    staleTime: 30_000,
  });

export const useFeeRows = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("fee_rows", filters),
    queryFn: () => reportAggregatorService.feeRows(filters),
    staleTime: 30_000,
  });

export const useStudentsBasic = () =>
  useQuery({
    queryKey: queryKeys.reports.data("students_basic"),
    queryFn: () => reportAggregatorService.studentsBasic(),
    staleTime: 60_000,
  });

export const useStudentAttendanceRows = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("student_attendance_rows", filters),
    queryFn: () => reportAggregatorService.studentAttendanceRows(filters),
    staleTime: 30_000,
  });

export const useStaffAttendanceRows = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("staff_attendance_rows", filters),
    queryFn: () => reportAggregatorService.staffAttendanceRows(filters),
    staleTime: 30_000,
  });

export const useEnquiryRows = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("enquiry_rows", filters),
    queryFn: () => reportAggregatorService.enquiryRows(filters),
    staleTime: 30_000,
  });

export const useExamSummaryRows = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("exam_summary_rows", filters),
    queryFn: () => reportAggregatorService.examSummaryRows(filters),
    staleTime: 30_000,
  });

export const useExamResultRows = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("exam_result_rows", filters),
    queryFn: () => reportAggregatorService.examResultRows(filters),
    staleTime: 30_000,
  });

export const useTimetableRows = () =>
  useQuery({
    queryKey: queryKeys.reports.data("timetable_rows"),
    queryFn: () => reportAggregatorService.timetableRows(),
    staleTime: 60_000,
  });

export const useMessageRows = (filters: ReportFilterValues) =>
  useQuery({
    queryKey: queryKeys.reports.data("message_rows", filters),
    queryFn: () => reportAggregatorService.messageRows(filters),
    staleTime: 30_000,
  });
