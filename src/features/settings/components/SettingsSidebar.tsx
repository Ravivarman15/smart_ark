import { NavLink } from "react-router-dom";
import {
  SETTINGS_GROUP_ORDER,
  useSettingsSections,
} from "../navigation/settingsNav";

/**
 * Secondary navigation for the Settings space.
 *
 * The list is DERIVED from `useNavigation` — the same resolver that builds the
 * main sidebar — so what a user sees here is, by construction, what they see
 * under Settings in the sidebar. See `../navigation/settingsNav.ts` for why
 * this stopped being a hardcoded array.
 *
 * Nothing here decides visibility. This component only lays sections out.
 */
const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive
      ? "bg-accent/15 text-accent font-medium"
      : "text-foreground hover:bg-muted/40"
  }`;

export const SettingsSidebar = () => {
  const visible = useSettingsSections();

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
        {SETTINGS_GROUP_ORDER.map((group) => {
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
