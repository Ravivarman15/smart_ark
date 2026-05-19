import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "../components/SettingsCard";
import { changePasswordSchema, type ChangePasswordValues } from "../schemas/settings.schema";
import { useChangePassword } from "../hooks/useChangePassword";
import { estimatePassword } from "../utils/passwordStrength";

const strengthColor: Record<string, string> = {
  empty: "bg-muted",
  "very weak": "bg-destructive",
  weak: "bg-amber-500",
  okay: "bg-yellow-400",
  strong: "bg-emerald-500",
};

const ChangePasswordPage = () => {
  const [show, setShow] = useState<{ cur: boolean; n: boolean; c: boolean }>({
    cur: false, n: false, c: false,
  });
  const change = useChangePassword();

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const newPwd = form.watch("newPassword");
  const strength = estimatePassword(newPwd);

  const onSubmit = form.handleSubmit(async (values) => {
    await change.mutateAsync({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    form.reset();
    // Hook handles toast + forced sign-out.
  });

  return (
    <div className="space-y-5 max-w-xl">
      <SettingsCard
        title="Change Password"
        description="Use a strong, unique password. You will be signed out after saving."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <FieldRow
            label="Current password"
            id="cur"
            show={show.cur}
            onToggle={() => setShow((s) => ({ ...s, cur: !s.cur }))}
            error={form.formState.errors.currentPassword?.message}
            inputProps={form.register("currentPassword")}
          />
          <FieldRow
            label="New password"
            id="n"
            show={show.n}
            onToggle={() => setShow((s) => ({ ...s, n: !s.n }))}
            error={form.formState.errors.newPassword?.message}
            inputProps={form.register("newPassword")}
          />
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${strengthColor[strength.label]}`}
                style={{ width: `${(strength.score / 4) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground capitalize">
              Strength: <span className="text-foreground">{strength.label}</span>
              {strength.hints.length > 0 && (
                <span> · {strength.hints[0]}</span>
              )}
            </p>
          </div>
          <FieldRow
            label="Confirm new password"
            id="c"
            show={show.c}
            onToggle={() => setShow((s) => ({ ...s, c: !s.c }))}
            error={form.formState.errors.confirmPassword?.message}
            inputProps={form.register("confirmPassword")}
          />
          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              Update password
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={change.isPending}
              onClick={() => form.reset()}
            >
              Reset
            </Button>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
};

interface FieldProps {
  label: string;
  id: string;
  show: boolean;
  onToggle: () => void;
  error?: string;
  inputProps: ReturnType<ReturnType<typeof useForm>["register"]>;
}

const FieldRow = ({ label, id, show, onToggle, error, inputProps }: FieldProps) => (
  <div className="space-y-1">
    <Label htmlFor={id} className="text-xs">
      {label}
    </Label>
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        className="pr-10"
        {...inputProps}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
    {error && <p className="text-[11px] text-destructive">{error}</p>}
  </div>
);

export default ChangePasswordPage;
