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
   * Hide the control while the organization has fewer than two branches.
   *
   * DEFAULTS TO FALSE — the filter is always shown.
   *
   * It defaulted to true at first, on the reasoning that a dropdown whose only
   * option is your one branch cannot change a result. That reasoning was
   * wrong in practice: the filter was reported missing from Manage Students
   * within a day, because "the control is not there" and "the control is there
   * and does nothing" look identical from the outside, and only one of them
   * makes you doubt the feature shipped. A visible filter also shows people
   * where branch filtering WILL appear once they add a second branch.
   *
   * Kept as an opt-in for anywhere genuinely short of toolbar space.
   */
  hideWhenSingle?: boolean;
}

export const BranchFilter = ({
  value,
  onChange,
  className,
  hideWhenSingle = false,
}: Props) => {
  const { data: campuses = [] } = useCampuses();

  // Nothing to choose from at all — the list has not loaded, or this session
  // cannot read campuses. Rendering an empty dropdown would be a dead control.
  if (campuses.length === 0) return null;
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
