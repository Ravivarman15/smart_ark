// Colour-coded grade badge. The colour keys off the first letter so it works
// with any grading scheme (A* → green, B* → blue, C* → amber, D* → orange,
// F / AB → red).

const toneFor = (grade: string): string => {
  const g = (grade || "").trim().toUpperCase();
  if (g === "AB") return "bg-rose-50 text-rose-600 border-rose-200";
  const head = g.charAt(0);
  switch (head) {
    case "A":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "B":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "C":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "D":
      return "bg-orange-50 text-orange-700 border-orange-200";
    default:
      return "bg-rose-50 text-rose-600 border-rose-200";
  }
};

export const GradeBadge = ({ grade }: { grade?: string | null }) => {
  if (!grade) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2.25rem] text-xs font-semibold px-1.5 py-0.5 rounded border ${toneFor(
        grade,
      )}`}
    >
      {grade}
    </span>
  );
};
