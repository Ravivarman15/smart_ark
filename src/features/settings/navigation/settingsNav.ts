// ──────────────────────────────────────────────────────────────────────────────
// SETTINGS SUB-NAVIGATION — DERIVED, NOT DECLARED
//
// ┌── THE BUG THIS EXISTS TO KILL ─────────────────────────────────────────┐
// │ A coordinator granted exactly two settings submodules saw two links in │
// │ the main sidebar and FOUR sections inside Settings — including Billing │
// │ & Subscription and Branding & White Label.                             │
// │                                                                        │
// │ Two lists, two filters. The sidebar runs `useNavigation`, which        │
// │ applies the menu-config role gate, explicit RBAC grants, module gates  │
// │ and action gates. The settings sub-nav was a SECOND hardcoded array    │
// │ filtered by `canViewSubmodule` alone — and that check is deliberately  │
// │ fail-open, so anything the RBAC catalog has no row for renders. Billing│
// │ and Branding are admin/management-only in menu.config and nowhere else,│
// │ so the sub-nav never learned about the restriction.                    │
// │                                                                        │
// │ Adding the missing filter to the copy would fix today's symptom and    │
// │ leave the shape that caused it. The list is now DERIVED from the same  │
// │ resolver the sidebar uses, so the two cannot disagree: there is only   │
// │ one filter, and only one place a settings link is declared             │
// │ (`NAV_CONFIG`, group `settings`).                                      │
// └────────────────────────────────────────────────────────────────────────┘
//
// What stays here is presentation only — an icon and a section heading per
// submodule. Both fall back gracefully, so a settings item added to
// menu.config renders correctly without touching this file; a build gate
// nudges you to give it a proper icon and group.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, type ComponentType } from "react";
import {
  User,
  KeyRound,
  MessageSquare,
  BellRing,
  MessageCircle,
  BadgeCheck,
  Gauge,
  Gift,
  CreditCard,
  Palette,
  MapPin,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useNavigation } from "@/core/navigation";

/** Section headings, in render order. */
export const SETTINGS_GROUP_ORDER = [
  "Account",
  "Automation",
  "Plan & billing",
  "Organisation",
  "Other",
] as const;

export type SettingsGroup = (typeof SETTINGS_GROUP_ORDER)[number];

type IconComponent = ComponentType<{ className?: string }>;

/**
 * Presentation metadata per submodule id.
 *
 * `Check-in & Check-out` was previously grouped under "Organisation" while the
 * render loop only iterated Account / Automation / Plan & billing — so the
 * section existed, passed its RBAC gate, and was still invisible to everyone.
 * The group list and this map are now the same closed set, and a test asserts
 * every group used here is one the renderer walks.
 */
export const SETTINGS_PRESENTATION: Record<
  string,
  { icon: IconComponent; group: SettingsGroup }
> = {
  "settings.profile": { icon: User, group: "Account" },
  "settings.change_password": { icon: KeyRound, group: "Account" },
  "settings.auto_sms": { icon: MessageSquare, group: "Automation" },
  "settings.auto_notifications": { icon: BellRing, group: "Automation" },
  "settings.auto_whatsapp": { icon: MessageCircle, group: "Automation" },
  "settings.my_plan": { icon: BadgeCheck, group: "Plan & billing" },
  "settings.sms_plan": { icon: Gauge, group: "Plan & billing" },
  "settings.my_referral": { icon: Gift, group: "Plan & billing" },
  "settings.billing": { icon: CreditCard, group: "Plan & billing" },
  "settings.branding": { icon: Palette, group: "Plan & billing" },
  "settings.checkin": { icon: MapPin, group: "Organisation" },
  "settings.parent_portal": { icon: Users, group: "Organisation" },
};

const FALLBACK = { icon: SlidersHorizontal, group: "Other" as SettingsGroup };

export interface SettingsSection {
  path: string;
  label: string;
  /** RBAC submodule id this link was resolved from, when it has one. */
  submodule?: string;
  icon: IconComponent;
  group: SettingsGroup;
}

/**
 * The settings sections the CURRENT user may see, in menu-config order.
 *
 * Returns exactly the items the main sidebar renders under Settings — same
 * resolver, same call, no second filter. An empty array is a real answer: it
 * means every settings submodule is revoked for this user.
 */
export const useSettingsSections = (): SettingsSection[] => {
  const groups = useNavigation();

  return useMemo(() => {
    const settings = groups.find((g) => g.key === "settings");
    if (!settings) return [];

    return settings.items.map((item) => {
      const meta =
        (item.submodule && SETTINGS_PRESENTATION[item.submodule]) || FALLBACK;
      return {
        path: item.path,
        label: item.label,
        submodule: item.submodule,
        icon: meta.icon,
        group: meta.group,
      };
    });
  }, [groups]);
};

/** Where `/settings` should land, or null when the user may see none of it. */
export const settingsLanding = (sections: SettingsSection[]): string | null => {
  // Profile is the conventional landing page and the one /settings has always
  // redirected to. Menu-config order puts Change Password first, so taking
  // `sections[0]` would quietly move everyone's landing page as a side effect
  // of deriving this list. Fall through only when Profile is revoked.
  const preferred =
    sections.find((s) => s.submodule === "settings.profile") ?? sections[0];
  if (!preferred) return null;
  // Defensive: only ever hand back a path inside the settings shell, so a
  // malformed nav entry can never turn the redirect into a loop.
  return preferred.path.startsWith("/settings/") ? preferred.path : null;
};
