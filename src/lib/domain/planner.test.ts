import { describe, expect, it } from "vitest";
import { findClashes, overlaps, planDay, type PickedPerformance } from "./planner";
import type { Priority } from "./priority";

const T = (hhmm: string) => new Date(`2026-06-26T${hhmm}:00Z`);

function perf(
  id: string,
  start: string,
  end: string,
  priority: Priority,
  opts: { stage?: string; artist?: string } = {},
): PickedPerformance {
  return {
    id,
    artistId: opts.artist ?? `artist-${id}`,
    artistName: opts.artist ?? id,
    stageId: opts.stage ?? "main",
    stageName: opts.stage ?? "Main",
    startsAt: T(start),
    endsAt: T(end),
    priority,
  };
}

const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("overlaps", () => {
  it("treats back-to-back sets on the same stage as compatible", () => {
    expect(overlaps(perf("a", "18:00", "19:00", 3), perf("b", "19:00", "20:00", 3))).toBe(false);
  });

  it("detects overlap", () => {
    expect(overlaps(perf("a", "18:00", "19:00", 3), perf("b", "18:59", "20:00", 3))).toBe(true);
  });

  it("applies changeover time only between different stages", () => {
    const a = perf("a", "18:00", "19:00", 3, { stage: "main" });
    const sameStage = perf("b", "19:05", "20:00", 3, { stage: "main" });
    const otherStage = perf("c", "19:05", "20:00", 3, { stage: "tent" });
    expect(overlaps(a, sameStage, 10)).toBe(false);
    expect(overlaps(a, otherStage, 10)).toBe(true);
    expect(overlaps(a, otherStage, 5)).toBe(false);
  });
});

describe("findClashes", () => {
  it("maps each performance to the ones it clashes with", () => {
    const a = perf("a", "18:00", "19:00", 3);
    const b = perf("b", "18:30", "19:30", 3, { stage: "tent" });
    const c = perf("c", "19:15", "20:00", 3, { stage: "field" });
    const d = perf("d", "21:00", "22:00", 3);
    const clashes = findClashes([d, c, b, a]);
    expect(clashes.get("a")).toEqual(["b"]);
    expect(clashes.get("b")?.sort()).toEqual(["a", "c"]);
    expect(clashes.get("c")).toEqual(["b"]);
    expect(clashes.get("d")).toEqual([]);
  });

  it("returns an empty map for no performances", () => {
    expect(findClashes([]).size).toBe(0);
  });
});

describe("planDay", () => {
  it("keeps everything when nothing clashes", () => {
    const plan = planDay([perf("b", "20:00", "21:00", 1), perf("a", "18:00", "19:00", 2)]);
    expect(ids(plan.chosen)).toEqual(["a", "b"]);
    expect(plan.skipped).toEqual([]);
  });

  it("prefers the higher priority of two clashing sets", () => {
    const low = perf("low", "18:00", "19:00", 2);
    const high = perf("high", "18:30", "19:30", 4, { stage: "tent" });
    const plan = planDay([low, high]);
    expect(ids(plan.chosen)).toEqual(["high"]);
    expect(plan.skipped).toEqual([{ performance: low, lostTo: high }]);
  });

  it("lets one must-see beat two really-wants", () => {
    const mustSee = perf("must", "18:00", "20:00", 5);
    const a = perf("a", "18:00", "19:00", 4, { stage: "tent" });
    const b = perf("b", "19:00", "20:00", 4, { stage: "tent" });
    expect(ids(planDay([mustSee, a, b]).chosen)).toEqual(["must"]);
  });

  it("prefers several lower sets over one slightly higher set", () => {
    // Four "would like"s (4 x 3 = 12) outscore one "want to see" (9).
    const long = perf("long", "18:00", "22:00", 3);
    const a = perf("a", "18:00", "19:00", 2, { stage: "tent" });
    const b = perf("b", "19:00", "20:00", 2, { stage: "tent" });
    const c = perf("c", "20:00", "21:00", 2, { stage: "tent" });
    const d = perf("d", "21:00", "22:00", 2, { stage: "tent" });
    expect(ids(planDay([long, a, b, c, d]).chosen)).toEqual(["a", "b", "c", "d"]);
  });

  it("respects changeover time between stages", () => {
    const a = perf("a", "18:00", "19:00", 3, { stage: "main" });
    const b = perf("b", "19:05", "20:00", 3, { stage: "tent" });
    expect(ids(planDay([a, b]).chosen)).toEqual(["a", "b"]);
    expect(ids(planDay([a, b], { changeoverMinutes: 15 }).chosen)).toHaveLength(1);
  });

  it("only schedules an artist playing twice once", () => {
    const first = perf("first", "14:00", "15:00", 5, { artist: "x" });
    const second = perf("second", "20:00", "21:00", 5, { artist: "x" });
    const plan = planDay([first, second]);
    expect(ids(plan.chosen)).toEqual(["first"]);
    expect(plan.skipped).toEqual([{ performance: second, lostTo: first }]);
  });

  it("is deterministic when scores tie", () => {
    const a = perf("a", "18:00", "19:00", 3);
    const b = perf("b", "18:00", "19:00", 3, { stage: "tent" });
    expect(ids(planDay([a, b]).chosen)).toEqual(ids(planDay([b, a]).chosen));
  });

  it("handles an empty day", () => {
    expect(planDay([])).toEqual({ chosen: [], skipped: [] });
  });

  it("finds the optimum on a larger schedule", () => {
    // Greedy-by-priority would take X (5) and lose both Ys; optimum is X + Z.
    const x = perf("x", "18:00", "19:30", 5);
    const y1 = perf("y1", "17:00", "18:30", 4, { stage: "tent" });
    const y2 = perf("y2", "19:00", "20:30", 4, { stage: "field" });
    const z = perf("z", "19:30", "21:00", 3, { stage: "main" });
    const plan = planDay([x, y1, y2, z]);
    expect(ids(plan.chosen)).toEqual(["x", "z"]);
  });
});
