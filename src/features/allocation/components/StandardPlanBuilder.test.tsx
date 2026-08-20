import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Batch, Standard, Subject } from "@/features/setup/types/setup.types";
import type { Section } from "../types/allocation.types";
import { StandardPlanBuilder } from "./StandardPlanBuilder";
import type { PlanDraft } from "../utils/standardPlan";

// ─────────────────────────────────────────────────────────────────────────────
// These render for one reason: the reported failure was "there is no drop down
// for selecting the subject". The pure rules were all correct and all tested —
// the options simply never became reachable on screen. A unit test of
// `subjectsForStandard` cannot fail that way, so the assertion has to be made
// against the actual DOM: the subject options are PRESENT and CLICKABLE without
// opening anything.
// ─────────────────────────────────────────────────────────────────────────────

const std = (id: string, name: string): Standard => ({ id, name, displayOrder: 0 });

const subject = (id: string, name: string, standardId?: string): Subject => ({
  id,
  name,
  standardId,
  isOptional: false,
  isActive: true,
  displayOrder: 0,
});

const batch = (id: string, name: string, standardId?: string): Batch =>
  ({ id, name, standardId }) as Batch;

const section = (id: string, name: string, standardId?: string): Section => ({
  id,
  name,
  standardId,
  sortOrder: 0,
  isActive: true,
});

// ARK's real shape: subjects named per standard, plus institute-wide ones.
const STANDARDS = [std("s8", "8th STD"), std("s9", "9th STD"), std("s2", "2nd STD")];
const SUBJECTS = [
  subject("m8", "Mathematics - 8th STD", "s8"),
  subject("sci8", "Science - 8th STD", "s8"),
  subject("t8", "Tamil - 8th STD", "s8"),
  subject("m9", "Mathematics - 9th STD", "s9"),
  subject("bio", "Biology"), // institute-wide
  subject("gone", "Retired - 8th STD", "s8"),
];
SUBJECTS[5].isActive = false;
const BATCHES = [batch("bA", "8th STD (Batch A)", "s8"), batch("bB", "9th Morning", "s9")];
const SECTIONS = [section("secA", "A", "s8")];

/** The builder is controlled; the harness owns the state the page owns. */
const Harness: React.FC<{ initial?: PlanDraft[] }> = ({ initial = [] }) => {
  const [plan, setPlan] = useState<PlanDraft[]>(initial);
  return (
    <StandardPlanBuilder
      standards={STANDARDS}
      subjects={SUBJECTS}
      batches={BATCHES}
      sections={SECTIONS}
      value={plan}
      onChange={setPlan}
    />
  );
};

const addStandard = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

/** The card for a standard — scoped so "8th STD" in the picker never matches. */
const cardFor = (label: string): HTMLElement => {
  const heading = screen.getAllByText(label).find((el) => el.className.includes("truncate"));
  if (!heading) throw new Error(`no card for ${label}`);
  return heading.closest("div.rounded-md") as HTMLElement;
};

describe("picking a subject", () => {
  it("shows every subject of the standard WITHOUT opening anything", () => {
    // The regression this file exists for. The options must be in the document
    // straight after the standard is added — no popup, no second interaction.
    render(<Harness />);
    addStandard("8th STD");

    const card = cardFor("8th STD");
    expect(within(card).getByText("Mathematics - 8th STD")).toBeTruthy();
    expect(within(card).getByText("Science - 8th STD")).toBeTruthy();
    expect(within(card).getByText("Tamil - 8th STD")).toBeTruthy();
  });

  it("offers institute-wide subjects too, marked as shared", () => {
    render(<Harness />);
    addStandard("8th STD");
    const card = cardFor("8th STD");
    expect(within(card).getByText(/Biology/)).toBeTruthy();
    expect(within(card).getByText("· all")).toBeTruthy();
  });

  it("never offers another standard's subject", () => {
    render(<Harness />);
    addStandard("8th STD");
    const card = cardFor("8th STD");
    expect(within(card).queryByText("Mathematics - 9th STD")).toBeNull();
  });

  it("hides a deactivated subject", () => {
    render(<Harness />);
    addStandard("8th STD");
    expect(within(cardFor("8th STD")).queryByText("Retired - 8th STD")).toBeNull();
  });

  it("names the standard when Setup has no subjects for it", () => {
    render(
      <StandardPlanBuilder
        standards={STANDARDS}
        subjects={[]}
        batches={BATCHES}
        sections={[]}
        value={[{ standardId: "s8", subjectId: "", batchId: "", sectionId: "" }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/No subjects for 8th STD/)).toBeTruthy();
  });
});

describe("finishing a standard before adding the next", () => {
  it("blocks the next standard and names what is missing", () => {
    render(<Harness />);
    addStandard("8th STD");

    expect(screen.getByText(/Choose/).textContent).toContain("a subject");
    expect(screen.getByRole("button", { name: "9th STD" })).toHaveProperty("disabled", true);
  });

  it("asks for the batch once the subject is chosen, then unblocks", () => {
    render(<Harness />);
    addStandard("8th STD");

    fireEvent.click(within(cardFor("8th STD")).getByText("Mathematics - 8th STD"));
    // The message must move on rather than repeat itself — it is the only thing
    // telling the operator what is still outstanding.
    expect(screen.getByText(/Choose/).textContent).toContain("a batch");
    expect(screen.getByRole("button", { name: "9th STD" })).toHaveProperty("disabled", true);

    fireEvent.click(within(cardFor("8th STD")).getByText("All batches"));
    expect(screen.queryByText(/Choose .* first/)).toBeNull();
    expect(screen.getByRole("button", { name: "9th STD" })).toHaveProperty("disabled", false);
  });

  it("gives the second standard its OWN subject list", () => {
    // The whole point: 8th STD doing Maths while 9th STD does something else,
    // in the same period.
    render(<Harness />);
    addStandard("8th STD");
    fireEvent.click(within(cardFor("8th STD")).getByText("Mathematics - 8th STD"));
    fireEvent.click(within(cardFor("8th STD")).getByText("All batches"));
    addStandard("9th STD");

    const second = cardFor("9th STD");
    expect(within(second).getByText("Mathematics - 9th STD")).toBeTruthy();
    expect(within(second).queryByText("Science - 8th STD")).toBeNull();
    // …and the first standard keeps what it was given.
    expect(within(cardFor("8th STD")).getByText("Mathematics - 8th STD")).toBeTruthy();
  });

  it("marks the first standard as primary only once there are two", () => {
    render(<Harness />);
    addStandard("8th STD");
    expect(screen.queryByText("primary")).toBeNull();

    fireEvent.click(within(cardFor("8th STD")).getByText("Mathematics - 8th STD"));
    fireEvent.click(within(cardFor("8th STD")).getByText("All batches"));
    addStandard("9th STD");
    expect(screen.getByText("primary")).toBeTruthy();
  });

  it("removes a standard and frees it to be added again", () => {
    render(<Harness />);
    addStandard("8th STD");
    expect(screen.queryByRole("button", { name: "8th STD" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove 8th STD" }));
    expect(screen.getByRole("button", { name: "8th STD" })).toBeTruthy();
  });
});

describe("optional fields", () => {
  it("offers a section only where the standard has one", () => {
    render(<Harness />);
    addStandard("8th STD");
    expect(within(cardFor("8th STD")).getByText("Section")).toBeTruthy();

    fireEvent.click(within(cardFor("8th STD")).getByText("Mathematics - 8th STD"));
    fireEvent.click(within(cardFor("8th STD")).getByText("All batches"));
    addStandard("9th STD");
    expect(within(cardFor("9th STD")).queryByText("Section")).toBeNull();
  });

  it("lets a section be un-chosen — it is optional, so there must be a way back", () => {
    render(<Harness />);
    addStandard("8th STD");
    const sectionChip = () => within(cardFor("8th STD")).getByRole("button", { name: "A" });

    fireEvent.click(sectionChip());
    expect(sectionChip().className).toContain("bg-primary");
    fireEvent.click(sectionChip());
    expect(sectionChip().className).not.toContain("bg-primary");
  });

  it("does not demand a batch for a standard that has none", () => {
    render(
      <StandardPlanBuilder
        standards={STANDARDS}
        subjects={SUBJECTS}
        batches={[]}
        sections={[]}
        value={[{ standardId: "s8", subjectId: "m8", batchId: "", sectionId: "" }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/the whole standard is used/)).toBeTruthy();
    expect(screen.queryByText(/Choose .* first/)).toBeNull();
  });
});
