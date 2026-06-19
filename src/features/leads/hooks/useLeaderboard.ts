import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { leaderboardService } from "../services/leaderboard.service";

/** Counselor leaderboard + response stats for a window (default: this month). */
export const useLeaderboard = (params: { from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: queryKeys.leads.leaderboard(params as Record<string, unknown>),
    queryFn: () => leaderboardService.build(params),
  });
