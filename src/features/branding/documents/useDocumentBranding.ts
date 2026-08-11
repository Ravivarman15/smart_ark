import { useQuery } from "@tanstack/react-query";
import {
  resolveDocumentBranding,
  NEUTRAL_DOCUMENT_BRANDING,
} from "./documentBranding.service";
import type { DocumentBranding } from "./documentBranding.types";

/**
 * Branding for the current tenant's documents.
 *
 * Never returns undefined. A document dialog that has to guard `branding?.name`
 * on every line is a document that will print "undefined" the first time the
 * guard is forgotten — so the neutral identity is returned while loading and on
 * failure. It names no tenant, which is the safe thing to render when we do not
 * yet know whose document this is.
 *
 * `staleTime` is deliberately long: this is an organization's letterhead, not a
 * live figure, and re-fetching it per receipt in a list would be one request
 * per row. The branding save path calls `invalidateDocumentBranding()` and
 * invalidates this key, so an edit still lands without a reload.
 */
export const DOCUMENT_BRANDING_KEY = ["organization-branding", "documents"] as const;

export const useDocumentBranding = (): { branding: DocumentBranding; isLoading: boolean } => {
  const { data, isLoading } = useQuery({
    queryKey: DOCUMENT_BRANDING_KEY,
    queryFn: resolveDocumentBranding,
    staleTime: 5 * 60 * 1000,
  });

  return { branding: data ?? NEUTRAL_DOCUMENT_BRANDING, isLoading };
};
