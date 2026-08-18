import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCampuses } from "../hooks/useSupport";

// ──────────────────────────────────────────────────────────────────────────────
// BRANCH FILTER
//
// One dropdown, reused by every list that can be narrowed to a branch —
// students, staff, classes. Four copies of "map campuses to <SelectItem>" would
// drift into four different empty-state behaviours and four different labels
// for the same thing.
//
// Reads `campuses` rather than the branch directory ON PURPOSE: `campus_id` is
// the column being filtered on students, profiles and batches, so the options
// are exactly the values that can appear there. It also keeps a deactivated
// branch selectable — you still need to find the records attached to one.
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  /** "all" or a campus id. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /**
   * Render nothing when the organization has fewer than two branches.
   *
   * Most tenants have exactly one, and a filter with a single option is
   * furniture: it takes toolbar space on four pages and can never change a
   * result. It appears by itself the day a second branch is created.
   */
  hideWhenSingle?: boolean;
}

export const BranchFilter = ({
  value,
  onChange,
  className,
  hideWhenSingle = true,
}: Props) => {
  const { data: campuses = [] } = useCampuses();

  if (hideWhenSingle && campuses.length < 2) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 w-44", className)}>
        <SelectValue placeholder="Branch" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All branches</SelectItem>
        {campuses.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
