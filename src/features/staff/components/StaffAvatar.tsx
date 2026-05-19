import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  name?: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-lg",
};

const initials = (name?: string): string => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Staff avatar — shows the profile picture, falls back to initials. Used in
 * the staff table, the profile drawer, and the topbar.
 */
export const StaffAvatar = ({ name, src, size = "md", className = "" }: Props) => (
  <Avatar className={`${SIZE_CLASS[size]} ${className}`}>
    {src ? <AvatarImage src={src} alt={name ?? "Staff avatar"} /> : null}
    <AvatarFallback className="bg-muted text-muted-foreground font-medium">
      {initials(name)}
    </AvatarFallback>
  </Avatar>
);
