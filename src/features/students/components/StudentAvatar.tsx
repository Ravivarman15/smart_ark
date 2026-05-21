import { initials } from "../utils/helpers";

interface Props {
  name: string;
  imageUrl?: string;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "w-8 h-8 text-[11px]",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-lg",
};

/** Circular student avatar — profile image with an initials fallback. */
export const StudentAvatar = ({ name, imageUrl, size = "md" }: Props) => {
  const cls = SIZES[size];
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${cls} rounded-full object-cover border border-border/60 shrink-0`}
      />
    );
  }
  return (
    <span
      className={`${cls} rounded-full bg-accent/15 text-accent font-semibold flex items-center justify-center shrink-0`}
    >
      {initials(name) || "?"}
    </span>
  );
};
