import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BranchFilter } from "../components/BranchFilter";
import { RowActions } from "../components/RowActions";

// ════════════════════════════════════════════════════════════════════════════
// BRANCH FILTER + ROW ACTIONS
//
// The filter appears on four pages (branches, students, staff, classes). The
// behaviour that matters is when it does NOT appear: almost every tenant has
// exactly one branch today, and a dropdown whose only option is "All branches"
// is furniture on four toolbars at once.
// ════════════════════════════════════════════════════════════════════════════

const campuses = vi.hoisted(() => ({ value: [] as { id: string; name: string }[] }));

vi.mock("../hooks/useSupport", () => ({
  useCampuses: () => ({ data: campuses.value }),
  useTeachers: () => ({ data: [] }),
}));

const setCampuses = (names: string[]) => {
  campuses.value = names.map((name, i) => ({ id: `c${i}`, name }));
};

describe("The branch filter earns its place on the toolbar", () => {
  beforeEach(() => setCampuses([]));

  it("shows for an organization with a single branch", () => {
    // It used to hide here. Reported missing from Manage Students the same day:
    // an absent control and a present-but-inert one look identical, and only
    // one of them makes you wonder whether the feature shipped at all.
    setCampuses(["Main Branch"]);
    render(<BranchFilter value="all" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("still hides on request, for a toolbar genuinely short of room", () => {
    setCampuses(["Main Branch"]);
    const { container } = render(
      <BranchFilter value="all" onChange={() => {}} hideWhenSingle />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the branch list has not loaded", () => {
    const { container } = render(<BranchFilter value="all" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears as soon as there is a second branch", () => {
    setCampuses(["Main Branch", "North Campus"]);
    render(<BranchFilter value="all" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("renders nothing when there are no branches to choose between", () => {
    // Distinct from the single-branch case: an empty dropdown is a dead
    // control, and this is also what an unreadable campus list looks like.
    setCampuses([]);
    const { container } = render(<BranchFilter value="all" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current selection rather than the placeholder", () => {
    setCampuses(["Main Branch", "North Campus"]);
    render(<BranchFilter value="c1" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("North Campus");
  });
});

describe("Row actions render only what is available", () => {
  it("shows View on its own, without edit or delete rights", () => {
    // Read-only access is a real state: a coordinator may be granted the
    // branch list without create/edit/delete. Rendering a disabled Edit that
    // errors on click is worse than not rendering it.
    render(<RowActions onView={() => {}} />);
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("shows all three when all three are given", () => {
    render(<RowActions onView={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    for (const label of ["View", "Edit", "Delete"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("still renders the original Edit/Delete pair with no View", () => {
    // Every other Setup page passes exactly these two — adding onView must not
    // have changed what they render.
    render(<RowActions onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText("View")).toBeNull();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });
});
