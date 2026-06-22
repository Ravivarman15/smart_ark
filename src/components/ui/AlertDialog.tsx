import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Enterprise replacement for window.confirm / window.alert / window.prompt.
//
// Built on the Radix Dialog primitive so we inherit, for free: focus trap,
// ESC-to-close, click-outside-to-close, scroll locking, ARIA wiring and full
// keyboard navigation. The visual layer follows the ARK enterprise spec
// (dark #111827 surface, icon-in-circle header, 20px radius, soft shadow,
// fade + scale-in animation).
//
// Two ways to use it:
//   1. Declaratively — render <AlertDialog open ... /> and own the state.
//   2. Imperatively — call useConfirm()/usePrompt()/useAlert() from the
//      ConfirmDialogProvider (see ./confirm-dialog.tsx). The imperative API is
//      the drop-in replacement for the native dialogs across the app.

export type AlertDialogType = "success" | "warning" | "error" | "info" | "danger";

const TYPE_STYLES: Record<
  AlertDialogType,
  { Icon: typeof Info; circle: string; icon: string; confirm: string }
> = {
  success: {
    Icon: CheckCircle2,
    circle: "bg-emerald-500/15",
    icon: "text-emerald-400",
    confirm: "bg-emerald-600 hover:bg-emerald-500 text-white",
  },
  warning: {
    Icon: AlertTriangle,
    circle: "bg-amber-500/15",
    icon: "text-amber-400",
    confirm: "bg-amber-600 hover:bg-amber-500 text-white",
  },
  error: {
    Icon: XCircle,
    circle: "bg-red-500/15",
    icon: "text-red-400",
    confirm: "bg-red-600 hover:bg-red-500 text-white",
  },
  danger: {
    Icon: ShieldAlert,
    circle: "bg-red-500/15",
    icon: "text-red-400",
    confirm: "bg-red-600 hover:bg-red-500 text-white",
  },
  info: {
    Icon: Info,
    circle: "bg-sky-500/15",
    icon: "text-sky-400",
    confirm: "bg-sky-600 hover:bg-sky-500 text-white",
  },
};

export interface AlertDialogProps {
  open: boolean;
  type?: AlertDialogType;
  title: string;
  description?: React.ReactNode;
  /** Text for the confirm/primary button. Defaults to "Confirm". */
  confirmText?: string;
  /**
   * Text for the cancel button. Pass null/undefined for an alert-style dialog
   * with only the primary button (e.g. a success acknowledgement).
   */
  cancelText?: string | null;
  /** Disables buttons and shows a spinner on the confirm button. */
  loading?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  /** Optional extra content rendered between the description and the footer. */
  children?: React.ReactNode;
}

/**
 * Controlled, accessible confirmation dialog. Closing via ESC, the overlay or
 * the X always routes through onCancel so callers can resolve their promise.
 */
export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  type = "info",
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const { Icon, circle, icon, confirm } = TYPE_STYLES[type];

  const handleOpenChange = (next: boolean) => {
    // Radix reports open=false for ESC / overlay / X — treat all as cancel.
    if (!next && !loading) onCancel?.();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => loading && e.preventDefault()}
          onInteractOutside={(e) => loading && e.preventDefault()}
          style={{ boxShadow: "0 25px 50px rgba(0,0,0,.45)", borderRadius: 20 }}
          className={cn(
            "fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2",
            "w-[95vw] max-w-[420px] border border-white/10 bg-[#111827] p-6 text-slate-100",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
            <div className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-full", circle)}>
              <Icon className={cn("h-6 w-6", icon)} />
            </div>
            <DialogPrimitive.Title className="text-lg font-semibold leading-tight tracking-tight text-white">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-slate-400">
                {description}
              </DialogPrimitive.Description>
            ) : (
              // Radix warns without a Description — provide an a11y-only one.
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>

          {children ? <div className="mt-4">{children}</div> : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {cancelText ? (
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => onCancel?.()}
                className="border-white/15 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white"
              >
                {cancelText}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={loading}
              onClick={() => onConfirm?.()}
              className={cn("gap-2 border-0", confirm)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirmText}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

AlertDialog.displayName = "AlertDialog";

export default AlertDialog;
