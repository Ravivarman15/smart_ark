// ──────────────────────────────────────────────────────────────────────────────
// FAMILY-AWARE WEIGHTED DUPLICATE ENGINE
//
// A mobile number is NEVER a unique student identifier. One parent can have
// many children sharing the same mobile / email / address / parent name — those
// are FAMILY MEMBERS, not duplicates. A record is only a duplicate when enough
// *identity* fields agree to clear a confidence threshold.
//
// Scoring (highest matching rule wins):
//   Student ID (biometric) equal ........................ 100
//   Admission / Enrolment No equal ...................... 100
//   GR No equal ......................................... 100
//   Roll No equal + same Class/Year ..................... 95
//   Name + DOB + Parent Mobile equal .................... 90
//   Name + DOB equal .................................... 80
//   Name + Parent Mobile equal .......................... 70
//   Name + Address equal ................................ 65
//   Roll No equal (no class context) .................... 60
//   Parent Mobile equal ONLY ............................ 10  (family signal)
//   Parent Email equal ONLY ............................. 10  (family signal)
//
// Veto: when both records carry a decisive identifier (Student ID / Admission /
// GR No) and they are present-and-different — and none match — they are
// DIFFERENT people. The score is capped below the duplicate band. This is what
// makes "same name + same DOB, different admission number" import as new.
//
// This module is pure (no I/O) and unit-tested. The importer composes it.
// ──────────────────────────────────────────────────────────────────────────────

export type DuplicateStatus = "new" | "possible_duplicate" | "duplicate";
export type DuplicateAction = "import_new" | "merge" | "update_existing" | "skip";

/** Confidence at/above which a row is treated as a confirmed duplicate. */
export const DUPLICATE_THRESHOLD = 85;
/** Confidence at/above which a row is flagged for human review. */
export const POSSIBLE_THRESHOLD = 50;
/** Veto cap — a differing decisive identifier forces "different person". */
const VETO_CAP = 45;

/** The identity signals the engine compares — drawn from a student or a row. */
export interface IdentityFields {
  studentId?: string; // institutional student id (biometric_id)
  admissionNo?: string; // enrolment_no
  grNo?: string;
  rollNumber?: string;
  name?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  parentMobile?: string;
  parentEmail?: string;
  className?: string; // batch / standard name
  academicYear?: string;
  address?: string;
}

export interface MatchResult {
  /** 0–100 confidence that the two records are the same student. */
  score: number;
  /** Human-readable identity fields that agreed (drives the report). */
  matchedFields: string[];
  /** The matched existing student's id, when scoring against existing data. */
  existingId?: string;
  reason: string;
}

// ── Normalisation ─────────────────────────────────────────────────────────────
const s = (v?: string): string => (v ?? "").trim().toLowerCase();
const digits = (v?: string): string => (v ?? "").replace(/\D/g, "");

/** Phone → comparable form: digits only, country code stripped (last 10). */
export const normMobile = (v?: string): string => {
  const d = digits(v);
  return d.length > 10 ? d.slice(-10) : d;
};

const eq = (a?: string, b?: string): boolean => {
  const x = s(a);
  return x.length > 0 && x === s(b);
};

const mobEq = (a?: string, b?: string): boolean => {
  const x = normMobile(a);
  return x.length >= 7 && x === normMobile(b);
};

/** Is a mobile present and well-formed enough to use as a signal? */
export const isValidMobile = (v?: string): boolean => normMobile(v).length >= 7;

// ── Pairwise scoring ──────────────────────────────────────────────────────────
/**
 * Score how likely two identity records describe the same student. Pure and
 * symmetric. The result never reaches the duplicate band on a phone/email/name
 * match alone — those are family signals.
 */
export function scoreMatch(a: IdentityFields, b: IdentityFields): MatchResult {
  const sidSame = eq(a.studentId, b.studentId);
  const admSame = eq(a.admissionNo, b.admissionNo);
  const grSame = eq(a.grNo, b.grNo);
  const decisiveSame = sidSame || admSame || grSame;

  const bothPresentDiff = (x?: string, y?: string, same?: boolean) =>
    s(x).length > 0 && s(y).length > 0 && !same;
  const decisiveDiff =
    bothPresentDiff(a.studentId, b.studentId, sidSame) ||
    bothPresentDiff(a.admissionNo, b.admissionNo, admSame) ||
    bothPresentDiff(a.grNo, b.grNo, grSame);

  const nameSame = eq(a.name, b.name);
  const dobSame = eq(a.dob, b.dob);
  const mobSame = mobEq(a.parentMobile, b.parentMobile);
  const addrSame = eq(a.address, b.address);
  const rollSame = eq(a.rollNumber, b.rollNumber);
  const classSame = eq(a.className, b.className);
  const yearSame = eq(a.academicYear, b.academicYear);
  const emailSame = eq(a.parentEmail, b.parentEmail);

  const rules: { score: number; fields: string[] }[] = [];
  if (sidSame) rules.push({ score: 100, fields: ["Student ID"] });
  if (admSame) rules.push({ score: 100, fields: ["Admission/Enrolment No"] });
  if (grSame) rules.push({ score: 100, fields: ["GR No"] });
  if (rollSame && (classSame || yearSame))
    rules.push({ score: 95, fields: ["Roll No", "Class/Year"] });
  if (nameSame && dobSame && mobSame)
    rules.push({ score: 90, fields: ["Name", "DOB", "Parent Mobile"] });
  if (nameSame && dobSame) rules.push({ score: 80, fields: ["Name", "DOB"] });
  if (nameSame && mobSame) rules.push({ score: 70, fields: ["Name", "Parent Mobile"] });
  if (nameSame && addrSame) rules.push({ score: 65, fields: ["Name", "Address"] });
  if (rollSame && !classSame && !yearSame) rules.push({ score: 60, fields: ["Roll No"] });
  if (mobSame) rules.push({ score: 10, fields: ["Parent Mobile"] });
  if (emailSame) rules.push({ score: 10, fields: ["Parent Email"] });

  const best = rules.reduce(
    (m, r) => (r.score > m.score ? r : m),
    { score: 0, fields: [] as string[] }
  );

  let score = best.score;
  let reason: string;
  if (decisiveDiff && !decisiveSame && score > VETO_CAP) {
    // Different institutional identity wins — these are different students.
    score = VETO_CAP;
    reason = `Different identifier present — treated as a new student (matched ${
      best.fields.join(" + ") || "weak signals"
    })`;
  } else if (score === 0) {
    reason = "No identity match";
  } else {
    reason = `Matched ${best.fields.join(" + ")} (${score}% confidence)`;
  }

  return { score, matchedFields: best.fields, reason };
}

/** Classify a confidence score into a status band. */
export const classify = (score: number): DuplicateStatus =>
  score >= DUPLICATE_THRESHOLD
    ? "duplicate"
    : score >= POSSIBLE_THRESHOLD
    ? "possible_duplicate"
    : "new";

// ── Indexed candidate matching (O(1)-ish per row for large files) ─────────────
interface IndexedRecord {
  id?: string;
  identity: IdentityFields;
}

export interface DuplicateIndex {
  byStudentId: Map<string, IndexedRecord[]>;
  byAdmission: Map<string, IndexedRecord[]>;
  byGr: Map<string, IndexedRecord[]>;
  byRoll: Map<string, IndexedRecord[]>;
  byNameDob: Map<string, IndexedRecord[]>;
  byNameMobile: Map<string, IndexedRecord[]>;
  byMobile: Map<string, IndexedRecord[]>;
  byName: Map<string, IndexedRecord[]>;
}

export const emptyDuplicateIndex = (): DuplicateIndex => ({
  byStudentId: new Map(),
  byAdmission: new Map(),
  byGr: new Map(),
  byRoll: new Map(),
  byNameDob: new Map(),
  byNameMobile: new Map(),
  byMobile: new Map(),
  byName: new Map(),
});

const push = (map: Map<string, IndexedRecord[]>, key: string, rec: IndexedRecord) => {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(rec);
  else map.set(key, [rec]);
};

/** Add one record to every applicable lookup bucket. */
export function indexAdd(index: DuplicateIndex, identity: IdentityFields, id?: string): void {
  const rec: IndexedRecord = { id, identity };
  push(index.byStudentId, s(identity.studentId), rec);
  push(index.byAdmission, s(identity.admissionNo), rec);
  push(index.byGr, s(identity.grNo), rec);
  push(index.byRoll, s(identity.rollNumber), rec);
  if (s(identity.name) && s(identity.dob))
    push(index.byNameDob, `${s(identity.name)}|${s(identity.dob)}`, rec);
  if (s(identity.name) && isValidMobile(identity.parentMobile))
    push(index.byNameMobile, `${s(identity.name)}|${normMobile(identity.parentMobile)}`, rec);
  if (isValidMobile(identity.parentMobile))
    push(index.byMobile, normMobile(identity.parentMobile), rec);
  push(index.byName, s(identity.name), rec);
}

/** Build a lookup index over existing students' identities. */
export function buildExistingIndex(records: { id?: string; identity: IdentityFields }[]): DuplicateIndex {
  const index = emptyDuplicateIndex();
  for (const r of records) indexAdd(index, r.identity, r.id);
  return index;
}

/**
 * Find the best-scoring existing match for one identity. Gathers a small
 * candidate set from the lookup buckets (never a full scan), scores each, and
 * returns the highest. A score of 0 means no candidate shared any signal.
 */
export function findBestMatch(identity: IdentityFields, index: DuplicateIndex): MatchResult {
  const candidates = new Set<IndexedRecord>();
  const collect = (map: Map<string, IndexedRecord[]>, key: string) => {
    const arr = map.get(key);
    if (arr) for (const r of arr) candidates.add(r);
  };
  collect(index.byStudentId, s(identity.studentId));
  collect(index.byAdmission, s(identity.admissionNo));
  collect(index.byGr, s(identity.grNo));
  collect(index.byRoll, s(identity.rollNumber));
  if (s(identity.name) && s(identity.dob))
    collect(index.byNameDob, `${s(identity.name)}|${s(identity.dob)}`);
  if (s(identity.name) && isValidMobile(identity.parentMobile))
    collect(index.byNameMobile, `${s(identity.name)}|${normMobile(identity.parentMobile)}`);
  // Name-only candidates catch "same name, possibly same DOB/address" pairs.
  collect(index.byName, s(identity.name));

  let best: MatchResult = { score: 0, matchedFields: [], reason: "No identity match" };
  for (const cand of candidates) {
    const r = scoreMatch(identity, cand.identity);
    if (r.score > best.score) best = { ...r, existingId: cand.id };
  }
  return best;
}

// ── Family grouping ───────────────────────────────────────────────────────────
export interface FamilyGroup {
  id: string; // FAM-0001
  parentName?: string;
  parentMobile?: string;
  address?: string;
  /** Indexes (into the input array) of the rows belonging to this family. */
  memberRows: number[];
}

export interface FamilyAssignment {
  /** rowIndex → familyId (only for rows that share a family link). */
  familyByRow: Map<number, string>;
  families: FamilyGroup[];
}

/**
 * The family-link signals a row exposes: a shared parent mobile, parent email,
 * or a guardian name + address. Two rows that share ANY signal belong to the
 * same family (resolved transitively via union-find below), so a sheet that
 * mixes "father mobile" on one sibling and "mother email" on another still
 * groups them correctly.
 */
const familySignals = (id: IdentityFields): string[] => {
  const out: string[] = [];
  if (isValidMobile(id.parentMobile)) out.push(`m:${normMobile(id.parentMobile)}`);
  if (s(id.parentEmail)) out.push(`e:${s(id.parentEmail)}`);
  const parent = s(id.fatherName) || s(id.motherName);
  if (parent && s(id.address)) out.push(`na:${parent}|${s(id.address)}`);
  return out;
};

/**
 * Group rows into families using union-find over shared signals (parent mobile /
 * email / name+address). Rows with no signal are left unassigned (a lone student
 * with no parent contact isn't grouped).
 *
 * One parent → many children is the whole point: siblings land in one family,
 * and the importer treats them as DISTINCT students, never duplicates.
 */
export function groupFamilies(identities: IdentityFields[]): FamilyAssignment {
  const n = identities.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) [x, parent[x]] = [parent[x], r];
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  // First row that introduced each signal — union later rows that reuse it.
  const signalOwner = new Map<string, number>();
  const hasSignal: boolean[] = new Array(n).fill(false);
  identities.forEach((id, i) => {
    for (const sig of familySignals(id)) {
      hasSignal[i] = true;
      const owner = signalOwner.get(sig);
      if (owner === undefined) signalOwner.set(sig, i);
      else union(owner, i);
    }
  });

  // Collect connected components (only rows that carry a signal).
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    if (!hasSignal[i]) continue;
    const root = find(i);
    const arr = byRoot.get(root);
    if (arr) arr.push(i);
    else byRoot.set(root, [i]);
  }

  // Assign FAM ids in order of first appearance.
  const families: FamilyGroup[] = [];
  const familyByRow = new Map<number, string>();
  const ordered = [...byRoot.values()].sort((a, b) => a[0] - b[0]);
  ordered.forEach((rows, idx) => {
    const fid = `FAM-${String(idx + 1).padStart(4, "0")}`;
    const first = identities[rows[0]];
    families.push({
      id: fid,
      parentName: first.fatherName || first.motherName,
      parentMobile: first.parentMobile,
      address: first.address,
      memberRows: rows,
    });
    for (const r of rows) familyByRow.set(r, fid);
  });

  return { familyByRow, families };
}

/** Default action the UI proposes for a flagged row. */
export const suggestedActionFor = (status: DuplicateStatus): DuplicateAction =>
  status === "duplicate" ? "skip" : "import_new";
