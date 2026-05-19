import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "../components/SettingsCard";
import { profileUpdateSchema, type ProfileUpdateValues } from "../schemas/settings.schema";
import { useProfile, useUpdateProfile, useUploadProfileAvatar } from "../hooks/useProfile";

const ProfileSettingsPage = () => {
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const upload = useUploadProfileAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const form = useForm<ProfileUpdateValues>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      name: "",
      email: "",
      mobile: "",
      address: "",
      designation: "",
      department: "",
      profilePictureUrl: "",
    },
  });

  // Rehydrate form once the profile loads (or changes after avatar upload).
  useEffect(() => {
    if (!profile) return;
    form.reset({
      name: profile.name,
      email: profile.email,
      mobile: profile.mobile ?? "",
      address: profile.address ?? "",
      designation: profile.designation ?? "",
      department: profile.department ?? "",
      profilePictureUrl: profile.profilePictureUrl ?? "",
    });
    setPreview(profile.profilePictureUrl ?? null);
  }, [profile, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await update.mutateAsync({
      name: values.name,
      email: values.email,
      mobile: values.mobile || undefined,
      address: values.address || undefined,
      designation: values.designation || undefined,
      department: values.department || undefined,
    });
  });

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show optimistic preview while the upload runs.
    setPreview(URL.createObjectURL(file));
    try {
      await upload.mutateAsync(file);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <SettingsCard
        title="Profile picture"
        description="JPG or PNG, up to a few MB. Visible to other staff in your campus."
      >
        <div className="flex items-center gap-5">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border border-border/60"
            />
          ) : (
            <span className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <User className="w-7 h-7 text-muted-foreground" />
            </span>
          )}
          <div className="space-y-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 mr-1.5" />
              )}
              Upload new picture
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Stored in the <code>profile-pictures</code> Supabase bucket.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Personal details" description="Used across staff lists, attendance and admission records.">
        <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField id="name" label="Full name" error={form.formState.errors.name?.message}>
            <Input id="name" autoComplete="name" {...form.register("name")} />
          </FormField>
          <FormField id="email" label="Email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          </FormField>
          <FormField id="mobile" label="Mobile" error={form.formState.errors.mobile?.message}>
            <Input id="mobile" autoComplete="tel" {...form.register("mobile")} />
          </FormField>
          <FormField id="designation" label="Designation" error={form.formState.errors.designation?.message}>
            <Input id="designation" {...form.register("designation")} />
          </FormField>
          <FormField id="department" label="Department" error={form.formState.errors.department?.message}>
            <Input id="department" {...form.register("department")} />
          </FormField>
          <FormField id="address" label="Address" error={form.formState.errors.address?.message} className="sm:col-span-2">
            <Input id="address" {...form.register("address")} />
          </FormField>
          <div className="sm:col-span-2 flex items-center gap-2 pt-2">
            <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
              {update.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save changes
            </Button>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
};

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

const FormField = ({ id, label, error, children, className }: FormFieldProps) => (
  <div className={`space-y-1 ${className ?? ""}`}>
    <Label htmlFor={id} className="text-xs">
      {label}
    </Label>
    {children}
    {error && <p className="text-[11px] text-destructive">{error}</p>}
  </div>
);

export default ProfileSettingsPage;
