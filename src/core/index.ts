// Public surface of the core layer. Outer code should import from `@/core`
// rather than reaching into subfolders so we can rearrange internals freely.
export { APP_CONFIG } from "./constants/config";
export { ROLES, SUPER_ROLES, ROLE_HOME_ROUTE, type Role } from "./constants/roles";
export { queryKeys } from "./constants/queryKeys";
export { AppProviders } from "./providers/AppProviders";
export { QueryProvider } from "./providers/QueryProvider";
export { ProtectedRoute } from "./routing/ProtectedRoute";
export { ParentProtectedRoute } from "./routing/ParentProtectedRoute";
export { AuthRedirect } from "./routing/AuthRedirect";
export { usePermissions, PermissionGate } from "./permissions";
export {
  NAV_CONFIG,
  useNavigation,
  useHomeRoute,
  type NavGroupConfig,
  type NavItemConfig,
} from "./navigation";
export {
  ThemeProvider,
  ThemeToggle,
  useTheme,
  useThemeMode,
  THEMES,
  THEME_LIST,
  DEFAULT_THEME,
  isThemeId,
  type ThemeId,
  type ThemeMode,
  type ThemeDefinition,
  type ThemeToggleProps,
} from "./theme";
