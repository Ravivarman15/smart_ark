import type { ClientContext } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Client context capture — device / browser / IP / GPS stamped on Start Class,
// End Class and every audit row (Phase 3 + 12).
//
// Everything here is BEST-EFFORT and non-blocking:
//   • device + browser are derived locally from the user agent (no network),
//   • GPS is optional and only read when the caller asks AND the user has
//     already granted permission — we never prompt in a blocking way,
//   • the public IP is resolved from a lightweight public endpoint with a short
//     timeout; if it is blocked, offline, or slow the field is simply omitted.
//
// A failure in any of these NEVER prevents a class from starting or ending.
// ─────────────────────────────────────────────────────────────────────────────

/** Coarse device class from the UA string. */
export const detectDevice = (ua: string): string => {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "Tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(s)) return "Mobile";
  if (/android/.test(s)) return "Tablet";
  if (/macintosh|mac os x/.test(s)) return "Mac";
  if (/windows/.test(s)) return "Windows";
  if (/linux|x11/.test(s)) return "Linux";
  return "Unknown";
};

/** Browser family + major version from the UA string. */
export const detectBrowser = (ua: string): string => {
  // Order matters — Edge/Opera/Samsung all claim to be Chrome.
  const rules: [string, RegExp][] = [
    ["Edge", /edg(?:e|a|ios)?\/([\d.]+)/i],
    ["Opera", /(?:opr|opera)[\s/]([\d.]+)/i],
    ["Samsung Internet", /samsungbrowser\/([\d.]+)/i],
    ["Firefox", /(?:firefox|fxios)\/([\d.]+)/i],
    ["Chrome", /(?:chrome|crios)\/([\d.]+)/i],
    ["Safari", /version\/([\d.]+).*safari/i],
  ];
  for (const [name, re] of rules) {
    const m = re.exec(ua);
    if (m) return `${name} ${String(m[1] ?? "").split(".")[0]}`.trim();
  }
  return "Unknown";
};

/** Cached so we resolve the public IP at most once per session. */
let ipCache: string | undefined;
let ipTried = false;

const resolveIp = async (timeoutMs = 1500): Promise<string | undefined> => {
  if (ipTried) return ipCache;
  ipTried = true;
  if (typeof fetch !== "function") return undefined;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    const json = (await res.json()) as { ip?: string };
    ipCache = json.ip;
    return ipCache;
  } catch {
    return undefined; // blocked / offline / timed out — the field stays empty
  }
};

/** Read GPS only if permission was already granted (never blocks the click). */
const resolveGeo = async (
  timeoutMs = 2000,
): Promise<{ lat?: number; lng?: number }> => {
  if (typeof navigator === "undefined" || !navigator.geolocation) return {};
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      const status = await perms.query({ name: "geolocation" as PermissionName });
      if (status.state !== "granted") return {};
    }
  } catch {
    return {};
  }
  return new Promise((resolve) => {
    const done = (v: { lat?: number; lng?: number }) => resolve(v);
    const timer = setTimeout(() => done({}), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        done({});
      },
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
};

/** Synchronous part only — safe anywhere, no awaits, no network. */
export const localContext = (): ClientContext => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (!ua) return {};
  return { device: detectDevice(ua), browser: detectBrowser(ua) };
};

/**
 * Full context (device + browser + best-effort IP + optional GPS).
 * Always resolves — never rejects.
 */
export const captureContext = async (
  opts: { geo?: boolean } = {},
): Promise<ClientContext> => {
  const base = localContext();
  const [ip, geo] = await Promise.all([
    resolveIp().catch(() => undefined),
    opts.geo ? resolveGeo().catch(() => ({})) : Promise.resolve({}),
  ]);
  return { ...base, ip, ...geo };
};
