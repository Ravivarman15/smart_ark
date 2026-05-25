// ──────────────────────────────────────────────────────────────────────────────
// rbacDebug — opt-in development logger for the RBAC realtime / invalidation
// lifecycle. Logs nothing in production builds.
//
// Toggle at runtime:
//   - via env: VITE_RBAC_DEBUG=true (build-time)
//   - via dev console: window.__rbacDebug = true   (live toggle, no rebuild)
// ──────────────────────────────────────────────────────────────────────────────

const isDev = (() => {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
})();

const envFlag = (() => {
  try {
    return import.meta.env.VITE_RBAC_DEBUG === "true";
  } catch {
    return false;
  }
})();

declare global {
  interface Window {
    __rbacDebug?: boolean;
  }
}

const enabled = (): boolean => {
  if (!isDev) return false;
  if (typeof window !== "undefined" && window.__rbacDebug === true) return true;
  return envFlag;
};

type RbacEvent =
  | "subscribe"
  | "unsubscribe"
  | "realtime"
  | "invalidate"
  | "refetch"
  | "decision"
  | "mutation"
  | "info";

export const rbacDebug = (event: RbacEvent, detail?: unknown): void => {
  if (!enabled()) return;
  // eslint-disable-next-line no-console
  console.log(`%c[RBAC ${event}]`, "color:#0ea5e9;font-weight:600", detail ?? "");
};

/** One-line convenience to enable from the dev console: `window.__rbacDebug = true`. */
export const enableRbacDebug = () => {
  if (typeof window !== "undefined") window.__rbacDebug = true;
};
