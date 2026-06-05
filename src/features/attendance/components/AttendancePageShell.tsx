import { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Extra header-right content (e.g. a date picker). */
  headerExtra?: ReactNode;
  /** Filter slot — sticks to the top on mobile for fast scrolling rosters. */
  toolbar?: ReactNode;
  /** Sticky action bar pinned to the bottom on mobile (Save / Submit). */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Uniform page chrome for the attendance module. Mobile-first: the header and
 * filter toolbar stick to the top and the action bar sticks to the bottom so
 * marking long rosters on the APK stays one-handed.
 */
export const AttendancePageShell = ({
  title,
  description,
  icon,
  headerExtra,
  toolbar,
  footer,
  children,
}: Props) => (
  <div className="space-y-4 pb-20 md:pb-0">
    <header className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/30 md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent md:border-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon && (
            <span className="hidden md:flex w-9 h-9 items-center justify-center rounded-md bg-accent/10 text-accent shrink-0">
              {icon}
            </span>
          )}
          <div>
            <h1 className="text-lg md:text-2xl font-display font-semibold text-foreground">{title}</h1>
            {description && (
              <p className="hidden md:block text-sm text-muted-foreground max-w-2xl">{description}</p>
            )}
          </div>
        </div>
        {headerExtra && <div className="flex items-center gap-2">{headerExtra}</div>}
      </div>
    </header>

    {toolbar && (
      <div className="sticky top-[52px] z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/30 md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent md:border-0">
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
      </div>
    )}

    <div>{children}</div>

    {footer && (
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 bg-background/95 backdrop-blur border-t border-border/40 md:static md:px-0 md:py-0 md:bg-transparent md:border-0 md:backdrop-blur-0">
        <div className="flex items-center gap-2">{footer}</div>
      </div>
    )}
  </div>
);
