import * as React from "react";

import { AlertDialog, type AlertDialogType } from "@/components/ui/AlertDialog";
import { Input } from "@/components/ui/input";

// Imperative, promise-based bridge over <AlertDialog>. This is the drop-in
// replacement for window.confirm / window.alert / window.prompt:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "Delete lead?", type: "danger" }))) return;
//
//   const reason = await prompt({ title: "Override reason" });
//   if (reason == null) return; // user cancelled
//
//   await alert({ title: "Saved", type: "success" });
//
// One ConfirmDialogProvider is mounted once at the app root; dialogs queue so
// overlapping requests never clobber each other.

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  type?: AlertDialogType;
  confirmText?: string;
  cancelText?: string;
}

export interface AlertOptions {
  title: string;
  description?: React.ReactNode;
  type?: AlertDialogType;
  confirmText?: string;
}

export interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  defaultValue?: string;
  /** When true (default), an empty/whitespace value keeps the confirm disabled. */
  required?: boolean;
  inputType?: React.HTMLInputTypeAttribute;
}

type Request =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "alert"; options: AlertOptions; resolve: (value: true) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<true>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = React.useState<Request[]>([]);
  const [value, setValue] = React.useState("");
  const active = queue[0] ?? null;

  // Reset the prompt input each time a new request becomes active.
  React.useEffect(() => {
    if (active?.kind === "prompt") setValue(active.options.defaultValue ?? "");
  }, [active]);

  const enqueue = React.useCallback((req: Request) => {
    setQueue((q) => [...q, req]);
  }, []);

  const api = React.useMemo<ConfirmContextValue>(
    () => ({
      confirm: (options) => new Promise<boolean>((resolve) => enqueue({ kind: "confirm", options, resolve })),
      alert: (options) => new Promise<true>((resolve) => enqueue({ kind: "alert", options, resolve })),
      prompt: (options) => new Promise<string | null>((resolve) => enqueue({ kind: "prompt", options, resolve })),
    }),
    [enqueue],
  );

  const close = React.useCallback(() => setQueue((q) => q.slice(1)), []);

  const handleConfirm = React.useCallback(() => {
    if (!active) return;
    if (active.kind === "prompt") active.resolve(value);
    else if (active.kind === "alert") active.resolve(true);
    else active.resolve(true);
    close();
  }, [active, value, close]);

  const handleCancel = React.useCallback(() => {
    if (!active) return;
    if (active.kind === "prompt") active.resolve(null);
    else if (active.kind === "confirm") active.resolve(false);
    else active.resolve(true); // alert: only one button, dismiss resolves it
    close();
  }, [active, close]);

  const promptRequired = active?.kind === "prompt" ? active.options.required !== false : false;
  const confirmDisabled = promptRequired && value.trim().length === 0;

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {active ? (
        <AlertDialog
          open
          type={active.options.type ?? (active.kind === "alert" ? "info" : "warning")}
          title={active.options.title}
          description={active.options.description}
          confirmText={active.options.confirmText ?? (active.kind === "alert" ? "OK" : "Confirm")}
          cancelText={active.kind === "alert" ? null : (active.options as ConfirmOptions).cancelText ?? "Cancel"}
          onConfirm={confirmDisabled ? undefined : handleConfirm}
          onCancel={handleCancel}
        >
          {active.kind === "prompt" ? (
            <Input
              autoFocus
              type={active.options.inputType ?? "text"}
              value={value}
              placeholder={active.options.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !confirmDisabled) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              className="border-white/15 bg-white/5 text-slate-100 placeholder:text-slate-500"
            />
          ) : null}
        </AlertDialog>
      ) : null}
    </ConfirmContext.Provider>
  );
};

function useConfirmContext(): ConfirmContextValue {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm/usePrompt/useAlert must be used within a ConfirmDialogProvider");
  return ctx;
}

export const useConfirm = () => useConfirmContext().confirm;
export const usePrompt = () => useConfirmContext().prompt;
export const useAlert = () => useConfirmContext().alert;
