import { NavLink } from "react-router-dom";
import { useSidebarAccess } from "@/features/rbac";

/**
 * Secondary navigation for the Settings space. Items are gated by the same
 * RBAC submodule ids the main sidebar uses, so revoking access in the
 * permission matrix removes the section here too.
 */
interface Section {
  path: string;
  label: string;
  /** RBAC submodule id used by useSidebarAccess. */
  submodule: string;
}

const SECTIONS: Section[] = [
  { path: "/settings/profile",            label: "Profile",                submodule: "settings.profile" },
  { path: "/settings/change-password",    label: "Change Password",        submodule: "settings.change_password" },
  { path: "/settings/auto-sms",           label: "Auto SMS",               submodule: "settings.auto_sms" },
  { path: "/settings/auto-notifications", label: "Auto Notifications",     submodule: "settings.auto_notifications" },
  { path: "/settings/auto-whatsapp",      label: "Auto WhatsApp",          submodule: "settings.auto_whatsapp" },
  { path: "/settings/my-plan",            label: "My Plan",                submodule: "settings.my_plan" },
  { path: "/settings/sms-plan",           label: "SMS Plan",               submodule: "settings.sms_plan" },
  { path: "/settings/my-referral",        label: "My Referral",            submodule: "settings.my_referral" },
];

export const SettingsSidebar = () => {
  const { canViewSubmodule } = useSidebarAccess();
  const visible = SECTIONS.filter((s) => canViewSubmodule(s.submodule));

  return (
    <nav className="space-y-0.5">
      <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
        Account
      </p>
      {visible.map((s) => (
        <NavLink
          key={s.path}
          to={s.path}
          className={({ isActive }) =>
            `block px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-accent/15 text-accent font-medium"
                : "text-foreground hover:bg-muted/40"
            }`
          }
        >
          {s.label}
        </NavLink>
      ))}
      {visible.length === 0 && (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          No settings sections available for your role.
        </p>
      )}
    </nav>
  );
};
