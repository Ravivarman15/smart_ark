import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { credentialsService, type VerifyInput } from "../services";

/** Read-only credential health snapshot (staff auth linkage + student backend). */
export const useCredentialHealth = () =>
  useQuery({
    queryKey: queryKeys.communication.credentialHealth(),
    queryFn: () => credentialsService.health(),
    staleTime: 30_000,
  });

/**
 * Verify (staff: provision + prove login) a credential before sending. Returns
 * the verify result; callers MUST check `verified` before enqueuing the message.
 */
export const useVerifyCredentials = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VerifyInput) => credentialsService.verify(input),
    onSuccess: () => {
      // A verify rotates the password / repairs email — refresh health.
      qc.invalidateQueries({ queryKey: queryKeys.communication.credentialHealth() });
    },
  });
};
