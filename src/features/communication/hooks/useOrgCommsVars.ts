// ──────────────────────────────────────────────────────────────────────────────
// React access to the organization's communication identity.
//
// The services resolve org variables directly via orgContextService, which is
// promise-based and cached. UI that needs the same values SYNCHRONOUSLY — a
// `perRecipientDefaults` closure, a report subtitle — cannot await, so this
// hook exposes them as state with a safe empty default.
//
// The empty default is deliberate: a page that renders one frame with a blank
// organization name is fine; one that renders a FALLBACK name would put a
// competitor's identity on screen, which is the defect orgContextService
// exists to remove.
// ──────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { orgContextService, type OrgCommsVars } from "../services/orgContext.service";

const EMPTY: OrgCommsVars = {
  org_name: "",
  org_short_name: "",
  org_legal_name: "",
  org_phone: "",
  org_email: "",
  org_website: "",
  org_address: "",
};

/** Org identity for the CURRENT tenant. Never throws; never guesses a name. */
export const useOrgCommsVars = (): OrgCommsVars => {
  const { data } = useQuery({
    queryKey: ["comms", "org-vars"],
    queryFn: () => orgContextService.vars(),
    // Identity changes at most a couple of times a year, and orgContextService
    // caches underneath — this staleTime just stops React Query re-running the
    // resolved promise on every mount.
    staleTime: 15 * 60_000,
  });
  return data ?? EMPTY;
};
