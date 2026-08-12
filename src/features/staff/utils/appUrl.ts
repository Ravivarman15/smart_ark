// Public base URL of the app — embedded in onboarding emails (welcome + reset).
//
// WHY THIS EXISTS
//   Email links must point at the URL the staff member will actually open on
//   THEIR device. `window.location.origin` is whatever the admin's browser is
//   on — if they trigger onboarding from a `localhost` dev session, every
//   email link would say `localhost`, which is useless to the new staff member.
//
//   Set `VITE_PUBLIC_APP_URL` to the deployed site (e.g. https://erp.example.com)
//   and links are pinned there regardless of where onboarding is triggered.
//   When the var is unset it falls back to the current origin (fine for a
//   same-machine dev test).

/** Deployed app base URL, trailing slash stripped. */
export const appBaseUrl = (): string => {
  const configured = (
    import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  )?.trim();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Normalise: extract only the origin (scheme + host + port) so a
  // misconfigured value like "https://example.com/login" doesn't produce
  // double-path URLs ("https://example.com/login/login").
  const raw = configured || origin;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
};

/** Login-page URL used as the link / redirect target in onboarding emails. */
export const loginUrl = (): string => `${appBaseUrl()}/login`;

