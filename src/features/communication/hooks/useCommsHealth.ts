import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { commsHealthService, type HealthTestResult } from "../services";

/** Live communication health snapshot (queue counts, latest sends, templates). */
export const useCommsHealth = () =>
  useQuery({
    queryKey: queryKeys.communication.systemHealth(),
    queryFn: () => commsHealthService.snapshot(),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

/** Per-template usage facts (sent/failed/last-used) for the Deployment Manager. */
export const useTemplateUsage = () =>
  useQuery({
    queryKey: [...queryKeys.communication.systemHealth(), "template-usage"],
    queryFn: () => commsHealthService.templateUsage(),
    staleTime: 30_000,
  });

export type CommsTestInput =
  | { kind: "whatsapp"; destination: string }
  | { kind: "email"; email: string }
  | { kind: "queue" }
  | { kind: "retry" };

/** Run a real, individual health probe and return its PASS/FAIL result. */
export const useCommsTest = () =>
  useMutation<HealthTestResult, Error, CommsTestInput>({
    mutationFn: async (input) => {
      switch (input.kind) {
        case "whatsapp":
          return commsHealthService.testWhatsApp(input.destination);
        case "email":
          return commsHealthService.testEmail(input.email);
        case "queue":
          return commsHealthService.testQueue();
        case "retry":
          return commsHealthService.testRetry();
      }
    },
  });
