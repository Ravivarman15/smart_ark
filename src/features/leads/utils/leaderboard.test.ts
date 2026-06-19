import { describe, it, expect } from "vitest";
import {
  computeLeaderboard,
  computeResponseStats,
  responseMinutesFor,
  categoryLeader,
  type LeaderboardLead,
} from "./leaderboard";

const iso = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min, 0)).toISOString();

describe("responseMinutesFor", () => {
  it("computes minutes between creation and first response", () => {
    expect(responseMinutesFor({ createdAt: iso(0), firstResponseAt: iso(15) })).toBe(15);
  });
  it("returns null when no response yet", () => {
    expect(responseMinutesFor({ createdAt: iso(0) })).toBeNull();
  });
  it("never goes negative", () => {
    expect(responseMinutesFor({ createdAt: iso(30), firstResponseAt: iso(10) })).toBe(0);
  });
});

describe("computeResponseStats", () => {
  it("handles empty input", () => {
    expect(computeResponseStats([])).toEqual({
      count: 0, average: null, median: null, fastest: null, slowest: null,
    });
  });
  it("computes average / median / fastest / slowest", () => {
    const s = computeResponseStats([10, 20, 30, 40]);
    expect(s.count).toBe(4);
    expect(s.average).toBe(25);
    expect(s.median).toBe(25); // (20+30)/2
    expect(s.fastest).toBe(10);
    expect(s.slowest).toBe(40);
  });
  it("computes odd-length median", () => {
    expect(computeResponseStats([5, 1, 9]).median).toBe(5);
  });
});

describe("computeLeaderboard", () => {
  const names = new Map([
    ["c1", "Counselor NEET 1"],
    ["c2", "Counselor NEET 2"],
  ]);

  const leads: LeaderboardLead[] = [
    // c1: 3 leads, 2 admissions, fast responses
    { assignedTo: "c1", status: "admission", createdAt: iso(0), firstResponseAt: iso(5) },
    { assignedTo: "c1", status: "admission", createdAt: iso(0), firstResponseAt: iso(10) },
    { assignedTo: "c1", status: "contacted", createdAt: iso(0), firstResponseAt: iso(12) },
    // c2: 2 leads, 0 admissions, slow
    { assignedTo: "c2", status: "new", createdAt: iso(0), firstResponseAt: iso(120) },
    { assignedTo: "c2", status: "contacted", createdAt: iso(0) },
    // unassigned — ignored
    { status: "new", createdAt: iso(0) },
  ];

  it("groups by counselor and ignores unassigned", () => {
    const rows = computeLeaderboard(leads, names);
    expect(rows).toHaveLength(2);
    const c1 = rows.find((r) => r.counselorId === "c1")!;
    expect(c1.leadsHandled).toBe(3);
    expect(c1.admissions).toBe(2);
    expect(c1.conversionRate).toBeCloseTo(66.7, 1);
    expect(c1.fastestResponseMinutes).toBe(5);
  });

  it("ranks the stronger counselor first", () => {
    const rows = computeLeaderboard(leads, names);
    expect(rows[0].counselorId).toBe("c1");
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });

  it("folds followup/demo completion from aux", () => {
    const aux = new Map([["c1", { followupsTotal: 4, followupsCompleted: 3, demosTotal: 2, demosCompleted: 1 }]]);
    const rows = computeLeaderboard(leads, names, aux);
    const c1 = rows.find((r) => r.counselorId === "c1")!;
    expect(c1.followupCompletion).toBe(75);
    expect(c1.demoCompletion).toBe(50);
  });

  it("category leaders resolve correctly", () => {
    const rows = computeLeaderboard(leads, names);
    expect(categoryLeader(rows, "admissions")?.counselorId).toBe("c1");
    expect(categoryLeader(rows, "fastest")?.counselorId).toBe("c1");
    expect(categoryLeader([], "overall")).toBeNull();
  });
});
