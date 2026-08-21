import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { onlineTestService } from "../services/onlineTest.service";
import type { TestLink, TestLinkOptions } from "../services/onlineTest.service";

// ─────────────────────────────────────────────────────────────────────────────
// The share link, from the staff side.
//
// Minting, revoking and reading the link all go through the AUTHENTICATED
// `online-test` function, never the public one: `public-test` runs with
// verify_jwt = false and must never be able to create the credential it also
// accepts.
// ─────────────────────────────────────────────────────────────────────────────

export const useTestLink = (examId: string | null) =>
  useQuery<TestLink>({
    queryKey: [...queryKeys.exams.all, "link", examId ?? ""],
    queryFn: () => onlineTestService.linkStatus(examId as string),
    enabled: !!examId,
    // The token is a secret in the ordinary sense — it should not sit in a
    // cache that outlives the panel showing it.
    gcTime: 0,
  });

export const useIssueTestLink = (examId: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (options: TestLinkOptions = {}) =>
      onlineTestService.issueLink(examId as string, options),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...queryKeys.exams.all, "link", examId ?? ""] });
      qc.invalidateQueries({ queryKey: queryKeys.exams.all });
    },
  });
};

export const useRevokeTestLink = (examId: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => onlineTestService.revokeLink(examId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...queryKeys.exams.all, "link", examId ?? ""] });
      qc.invalidateQueries({ queryKey: queryKeys.exams.all });
    },
  });
};
