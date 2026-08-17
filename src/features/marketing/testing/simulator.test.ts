import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePaper } from "@/features/exams/utils/paperParser";

// ════════════════════════════════════════════════════════════════════════════
// LANDING-PAGE SIMULATOR — THE DEMO MUST BE THE PRODUCT
//
// The AI parser tab was a static mockup: fixed input JSX, fixed output JSX, and
// a "Re-run AI" button that set a boolean for 800ms and changed nothing.
//
// That is not merely a shortcut — it drifted. Its sample text used a syntax the
// real parser rejects (`[Correct]`, `[Marks: +4, Neg: -1, Subject: Biology]`),
// so a visitor who copied the format they were shown would get subject
// "Biology]", one mark instead of four, and no correct answer detected.
//
// These tests exist to keep the demo honest: it must run the PRODUCT'S parser,
// on text the parser genuinely accepts, and it must not display a field the
// parser does not populate.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..", "..");
const SIM = "src/features/marketing/components/InteractiveSimulator.tsx";
const source = readFileSync(join(ROOT, SIM), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The seed text exactly as the component ships it. */
const SAMPLE = (() => {
  const m = source.match(/const SAMPLE_PAPER = `([\s\S]*?)`;/);
  if (!m) throw new Error("SAMPLE_PAPER not found in InteractiveSimulator");
  return m[1];
})();

describe("The demo runs the real parser", () => {
  it("imports the product's parser rather than re-implementing one", () => {
    expect(code).toMatch(
      /import \{ parsePaper \} from "@\/features\/exams\/utils\/paperParser"/,
    );
  });

  it("no longer hardcodes the answer it claims to have parsed", () => {
    // The old card printed "Mitochondria" as literal JSX. If the parser broke,
    // the landing page kept showing a perfect result.
    const outputTab = code.slice(code.indexOf('activeTab === "ai"'));
    expect(outputTab).not.toMatch(/Mitochondria/);
    expect(outputTab).not.toMatch(/power house of the cell/);
    // …because it renders whatever came back instead.
    expect(outputTab).toMatch(/parsed\.questions\.map/);
  });

  it("the input is editable, so 'paste your paper' is true", () => {
    expect(code).toMatch(/<textarea/);
    expect(code).toMatch(/onChange=\{\(e\) => setPaperText\(e\.target\.value\)\}/);
  });

  it("reports a measured parse time, not a claimed one", () => {
    expect(code).not.toMatch(/Parsed in 0\.2s/);
    expect(code).toMatch(/performance\.now\(\)/);
    expect(code).toMatch(/Parsed in \{/);
  });
});

describe("The sample text parses at full confidence", () => {
  const result = parsePaper(SAMPLE);

  it("is written in the syntax the parser actually accepts", () => {
    // The whole point. A demo that teaches a format the product cannot read
    // sends every visitor who copies it into a failed import.
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
    expect(result.meta.subject).toBe("Biology");
    // "Biology]" was what the OLD mockup's text produced — bracket included.
    expect(result.meta.subject).not.toContain("]");
  });

  it("finds the marks the paper declares", () => {
    const q1 = result.questions[0];
    expect(q1.marks).toBe(4);
  });

  it("identifies the correct option", () => {
    const q1 = result.questions[0];
    expect(q1.options.length).toBe(4);
    const correct = q1.options.filter((o) => o.isCorrect);
    expect(correct).toHaveLength(1);
    expect(correct[0].text).toMatch(/Mitochondria/);
  });

  it("every MCQ in the sample resolves an answer", () => {
    // A demo question showing no correct answer looks like a broken product.
    const mcqs = result.questions.filter((q) => q.options.length > 0);
    expect(mcqs.length).toBeGreaterThanOrEqual(2);
    for (const q of mcqs) {
      expect(
        q.options.some((o) => o.isCorrect),
        `Q${q.questionNo} has options but no correct one`,
      ).toBe(true);
    }
  });

  it("every MCQ clears the review threshold", () => {
    // The headline claim is about multiple-choice questions. One of those
    // showing an amber "needs checking" badge would read as a product that
    // cannot do the thing the section is selling.
    for (const q of result.questions.filter((x) => x.options.length > 0)) {
      expect(q.confidence, `Q${q.questionNo} at ${q.confidence}%`).toBeGreaterThanOrEqual(75);
    }
  });

  it("but the sample also includes a question BELOW the threshold", () => {
    // Deliberate. The copy promises that anything under 75% is flagged for a
    // teacher rather than guessed at, and a sample of uniformly perfect
    // questions leaves that claim unverifiable on screen. A short-answer
    // question with no answer key is exactly the honest 'I could not read
    // this' case, and it renders in amber next to the confident ones.
    const flagged = result.questions.filter((q) => q.confidence < 75);
    expect(
      flagged.length,
      "sample no longer demonstrates the review flag",
    ).toBeGreaterThan(0);
  });

  it("the UI actually renders that distinction", () => {
    // Otherwise the low-confidence question above is indistinguishable from
    // the rest and the demo silently drops the claim.
    expect(code).toMatch(/q\.confidence >= 75/);
    expect(code).toMatch(/amber/);
  });

  it("shows more than one question type, so detection is visible", () => {
    const types = new Set(result.questions.map((q) => q.questionType));
    expect(types.size).toBeGreaterThan(1);
  });
});

describe("The demo does not display what the parser cannot produce", () => {
  it("negative marking is shown only when the paper declares it", () => {
    // `negativeMarks` is hardcoded to 0 in the parser — it is never extracted.
    // The old card printed "+4 / -1 Mark" unconditionally, which is a claim the
    // product does not back.
    for (const q of parsePaper(SAMPLE).questions) {
      expect(q.negativeMarks).toBe(0);
    }
    expect(code).not.toMatch(/\+4 \/ -1/);
    // Rendered conditionally, so it is correct if extraction is added later.
    expect(code).toMatch(/q\.negativeMarks > 0 \?/);
  });

  it("surfaces the parser's confidence rather than hiding it", () => {
    expect(code).toMatch(/q\.confidence/);
  });

  it("states the local, no-upload claim the architecture actually supports", () => {
    // True because `parsePaper` is a pure local function with no network call.
    expect(code).toMatch(/nothing is uploaded/i);
  });
});

describe("The other two simulator tabs still respond", () => {
  it("attendance toggling drives the notification card", () => {
    expect(code).toMatch(/toggleStudentStatus/);
    expect(code).toMatch(/setLastNotification/);
    expect(code).toMatch(/setMsgCount/);
  });

  it("fee collection updates the total and issues a receipt number", () => {
    expect(code).toMatch(/handleCollectFee/);
    expect(code).toMatch(/setCollectedTotal/);
    expect(code).toMatch(/setReceiptNo/);
  });
});
