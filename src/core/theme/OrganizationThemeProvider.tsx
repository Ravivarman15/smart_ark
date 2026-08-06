// ──────────────────────────────────────────────────────────────────────────────
// ORGANIZATION THEME ENGINE
//
// Applies a tenant's branding at runtime by writing CSS custom properties onto
// <html>. The existing ThemeProvider (light/dark) is UNTOUCHED — this layers on
// top, overriding only the brand tokens and leaving every other variable, and
// the entire dark-mode system, exactly as it was.
//
// ┌── WHY CSS VARIABLES AND NOT A STYLESHEET PER TENANT ───────────────────┐
// │ The app already styles everything through `hsl(var(--primary))` and    │
// │ friends. Overriding those variables re-skins every button, chart,      │
// │ badge and focus ring in the product with no component changes at all.  │
// │                                                                        │
// │ A per-tenant stylesheet would mean a build step per customer, cache    │
// │ invalidation per customer, and a flash of the wrong brand on every     │
// │ load. Variables are one paint, applied before the first frame the user │
// │ sees.                                                                  │
// └────────────────────────────────────────────────────────────────────────┘
//
// SECURITY: colours are validated as #rrggbb by a database trigger BEFORE they
// are stored, and validated again here before being written into CSS. Two
// checks because these values end up inside a style declaration, and an
// unvalidated string there is a CSS-injection vector — "it is only their own
// tenant" stops being true the moment a parent opens the portal.
// ──────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/core/tenant/OrganizationProvider";

export interface OrganizationBranding {
  appName: string | null;
  portalName: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  themeMode: "system" | "light" | "dark";
  fontFamily: string | null;
  loginBgUrl: string | null;
  supportEmail: string | null;
  poweredByHidden: boolean;
  themeTokens: Record<string, unknown> | null;
}

interface ThemeValue {
  branding: OrganizationBranding | null;
  loading: boolean;
}

const OrganizationThemeContext = createContext<ThemeValue>({ branding: null, loading: false });

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Convert #rrggbb to the `H S% L%` triple Tailwind's `hsl(var(--x))` expects.
 *
 * Returns null for anything that is not a plain hex colour — the second of the
 * two validation layers described above.
 */
export function hexToHslTriple(hex: string): string | null {
  if (!HEX.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Readable foreground for a background — WCAG-ish relative luminance. */
export function foregroundFor(hex: string): string | null {
  if (!HEX.test(hex)) return null;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16));
  // Contrast against white vs black; pick whichever is further from L.
  return L > 0.5 ? "0 0% 10%" : "0 0% 100%";
}

async function loadBranding(): Promise<OrganizationBranding | null> {
  // No .eq() filter: RLS on organization_branding already restricts this to
  // the caller's own organization. Filtering client-side would imply the
  // client knows better than the database.
  const { data, error } = await supabase
    .from("organization_branding" as never)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const r = data as unknown as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    appName: str(r.app_name),
    portalName: str(r.portal_name),
    logoUrl: str(r.logo_url),
    logoDarkUrl: str(r.logo_dark_url),
    faviconUrl: str(r.favicon_url),
    primaryColor: str(r.primary_color),
    secondaryColor: str(r.secondary_color),
    accentColor: str(r.accent_color),
    themeMode: (r.theme_mode as ThemeValue["branding"] extends null ? never : "system") ?? "system",
    fontFamily: str(r.font_family),
    loginBgUrl: str(r.login_bg_url),
    supportEmail: str(r.support_email),
    poweredByHidden: Boolean(r.powered_by_hidden),
    themeTokens: (r.theme_tokens as Record<string, unknown>) ?? null,
  };
}

export const OrganizationThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organizationId } = useOrganization();

  const { data: branding, isLoading } = useQuery({
    queryKey: ["organization-branding", organizationId ?? "none"],
    queryFn: loadBranding,
    enabled: !!organizationId,
    // Branding changes rarely; refetching it on every window focus would be
    // pure noise against a table that changes once a quarter.
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    const root = document.documentElement;
    // Track what we set so unmount / org-switch restores the base theme
    // exactly. Without this, switching organizations would leave the previous
    // tenant's brand colour behind.
    const applied: string[] = [];

    const setVar = (name: string, value: string | null) => {
      if (!value) return;
      root.style.setProperty(name, value);
      applied.push(name);
    };

    if (branding?.primaryColor) {
      setVar("--primary", hexToHslTriple(branding.primaryColor));
      setVar("--primary-foreground", foregroundFor(branding.primaryColor));
      // The focus ring follows the brand, or keyboard focus looks foreign.
      setVar("--ring", hexToHslTriple(branding.primaryColor));
    }
    if (branding?.secondaryColor) {
      setVar("--secondary", hexToHslTriple(branding.secondaryColor));
      setVar("--secondary-foreground", foregroundFor(branding.secondaryColor));
    }
    if (branding?.accentColor) {
      setVar("--accent", hexToHslTriple(branding.accentColor));
      setVar("--accent-foreground", foregroundFor(branding.accentColor));
    }

    const tokens = branding?.themeTokens ?? {};
    if (typeof tokens.radius === "string" && /^[\d.]+rem$/.test(tokens.radius)) {
      setVar("--radius", tokens.radius);
    }

    // Document title and favicon — the two things that make a browser tab feel
    // like the customer's own product rather than ours.
    const previousTitle = document.title;
    if (branding?.appName) document.title = branding.appName;

    let faviconEl: HTMLLinkElement | null = null;
    let previousFavicon: string | null = null;
    if (branding?.faviconUrl) {
      faviconEl = document.querySelector('link[rel="icon"]');
      if (faviconEl) {
        previousFavicon = faviconEl.href;
        faviconEl.href = branding.faviconUrl;
      }
    }

    return () => {
      for (const name of applied) root.style.removeProperty(name);
      document.title = previousTitle;
      if (faviconEl && previousFavicon) faviconEl.href = previousFavicon;
    };
  }, [branding]);

  const value = useMemo<ThemeValue>(
    () => ({ branding: branding ?? null, loading: isLoading }),
    [branding, isLoading],
  );

  return (
    <OrganizationThemeContext.Provider value={value}>
      {children}
    </OrganizationThemeContext.Provider>
  );
};

export const useOrganizationBranding = (): ThemeValue =>
  useContext(OrganizationThemeContext);
