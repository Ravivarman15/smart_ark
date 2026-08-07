import { NavLink } from "react-router-dom";
import {
  User, KeyRound, MessageSquare, BellRing, MessageCircle,
  BadgeCheck, Gauge, Gift, CreditCard, Palette,
} from "lucide-react";
import { useSidebarAccess } from "@/features/rbac";

/**
 * Secondary navigation for the Settings space.
 *
 * Items are gated by the same RBAC submodule ids the main sidebar uses, so
 * revoking access in the permission matrix removes the section here too.
 *
 * ┌── TWO SECTIONS WERE MISSING ───────────────────────────────────────────┐
 * │ Billing & Subscription and Branding & White Label have routes, RBAC    │
 * │ submodules and entries in menu.config — but not here. So once a user   │
 * │ was inside Settings there was no way to reach either without typing    │
 * │ the URL. Added, and a gate now asserts this list matches the Settings  │
 * │ group in menu.config, because the two drifted silently once already.   │
 * └────────────────────────────────────────────────────────────────────────┘
 */
interface Section {
  path: string;
  label: string;
  /** RBAC submodule id used by useSidebarAccess. */
  submodule: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Account" | "Automation" | "Plan & billing";
}

const SECTIONS: Section[] = [
  { path: "/settings/profile",            label: "Profile",                 submodule: "settings.profile",            icon: User,          group: "Account" },
  { path: "/settings/change-password",    label: "Change Password",         submodule: "settings.change_password",    icon: KeyRound,      group: "Account" },
  { path: "/settings/auto-sms",           label: "Auto SMS",                submodule: "settings.auto_sms",           icon: MessageSquare, group: "Automation" },
  { path: "/settings/auto-notifications", label: "Auto Notifications",      submodule: "settings.auto_notifications", icon: BellRing,      group: "Automation" },
  { path: "/settings/auto-whatsapp",      label: "Auto WhatsApp",           submodule: "settings.auto_whatsapp",      icon: MessageCircle, group: "Automation" },
  { path: "/settings/my-plan",            label: "My Plan",                 submodule: "settings.my_plan",            icon: BadgeCheck,    group: "Plan & billing" },
  { path: "/settings/sms-plan",           label: "SMS Plan",                submodule: "settings.sms_plan",           icon: Gauge,         group: "Plan & billing" },
  { path: "/settings/my-referral",        label: "My Referral",             submodule: "settings.my_referral",        icon: Gift,          group: "Plan & billing" },
  { path: "/settings/billing",            label: "Billing & Subscription",  submodule: "settings.billing",            icon: CreditCard,    group: "Plan & billing" },
  { path: "/settings/branding",           label: "Branding & White Label",  submodule: "settings.branding",           icon: Palette,       group: "Plan & billing" },
];

const GROUP_ORDER: Section["group"][] = ["Account", "Automation", "Plan & billing"];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive
      ? "bg-accent/15 text-accent font-medium"
      : "text-foreground hover:bg-muted/40"
  }`;

export const SettingsSidebar = () => {
  const { canViewSubmodule } = useSidebarAccess();
  const visible = SECTIONS.filter((s) => canViewSubmodule(s.submodule));

  if (visible.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground">
        No settings sections available for your role.
      </p>
    );
  }

  return (
    <>
      {/* Mobile: one horizontally scrollable row. A ten-item vertical list
          stacked above the content meant more scrolling to reach a page than
          the page itself contained. */}
      <nav
        className="lg:hidden -mx-4 mb-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Settings sections"
      >
        <div className="flex w-max gap-1.5">
          {visible.map((s) => (
            <NavLink
              key={s.path}
              to={s.path}
              className={({ isActive }) =>
                `flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[13px] transition-colors ${
                  isActive
                    ? "border-accent/40 bg-accent/15 font-medium text-accent"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Desktop: grouped vertical nav. */}
      <nav className="hidden lg:block space-y-4" aria-label="Settings sections">
        {GROUP_ORDER.map((group) => {
          const items = visible.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="space-y-0.5">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group}
              </p>
              {items.map((s) => (
                <NavLink key={s.path} to={s.path} className={linkClass}>
                  <s.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </>
  );
};
