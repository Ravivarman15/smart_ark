interface Props {
  color?: string | null;
  size?: number;
}

export const CategoryDot = ({ color, size = 10 }: Props) => (
  <span
    aria-hidden
    className="inline-block rounded-full border border-black/10"
    style={{
      width: size,
      height: size,
      backgroundColor: color ?? "#94a3b8",
    }}
  />
);
