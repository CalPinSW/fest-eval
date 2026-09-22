import { describe, expect, it } from "vitest";
import { planLineupSync, type ExistingPerformance, type IncomingPerformance } from "./lineup-sync";

const T = (hhmm: string) => new Date(`2026-06-26T${hhmm}:00Z`);

function incoming(key: string, name: string, start = "18:00", end = "19:00", stage = "Main"): IncomingPerformance {
  return { externalKey: key, artistName: name, stageName: stage, startsAt: T(start), endsAt: T(end) };
}

function existing(
  id: string,
  over: Partial<ExistingPerformance> & { artistName: string },
): ExistingPerformance {
  return {
    id,
    source: "clashfinder",
    externalKey: id,
    locallyModified: false,
    stageName: "Main",
    startsAt: T("18:00"),
    endsAt: T("19:00"),
    ...over,
  };
}

describe("planLineupSync", () => {
  it("inserts everything into an empty festival", () => {
    const acts = [incoming("a", "A"), incoming("b", "B")];
    expect(planLineupSync([], acts)).toMatchObject({ inserts: acts, updates: [], deletes: [], unchanged: 0 });
  });

  it("leaves identical rows alone", () => {
    const plan = planLineupSync([existing("a", { artistName: "A" })], [incoming("a", "A")]);
    expect(plan).toMatchObject({ inserts: [], updates: [], deletes: [], unchanged: 1 });
  });

  it.each([
    ["time", incoming("a", "A", "18:30", "19:30")],
    ["stage", incoming("a", "A", "18:00", "19:00", "Tent")],
    ["name spelling", incoming("a", "A!")],
    ["end time", incoming("a", "A", "18:00", "19:15")],
  ])("updates rows whose %s changed upstream", (_, act) => {
    const plan = planLineupSync([existing("a", { artistName: "A" })], [act]);
    expect(plan.updates).toEqual([{ id: "a", incoming: act }]);
  });

  it("updates rows that had no times yet", () => {
    const act = incoming("a", "A");
    const plan = planLineupSync([existing("a", { artistName: "A", startsAt: null, endsAt: null })], [act]);
    expect(plan.updates).toEqual([{ id: "a", incoming: act }]);
  });

  it("deletes imported rows that disappeared upstream", () => {
    const plan = planLineupSync([existing("a", { artistName: "A" }), existing("b", { artistName: "B" })], [incoming("a", "A")]);
    expect(plan.deletes).toEqual(["b"]);
  });

  it("never overwrites or deletes locally edited rows", () => {
    const edited = existing("a", { artistName: "A", locallyModified: true, stageName: "Tent" });
    const editedGone = existing("b", { artistName: "B", locallyModified: true });
    const plan = planLineupSync([edited, editedGone], [incoming("a", "A")]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.keptLocalEdits.sort()).toEqual(["a", "b"]);
  });

  it("counts locally edited rows that already agree as unchanged", () => {
    const plan = planLineupSync([existing("a", { artistName: "A", locallyModified: true })], [incoming("a", "A")]);
    expect(plan).toMatchObject({ keptLocalEdits: [], unchanged: 1 });
  });

  it("never touches manual rows and matches them instead of duplicating", () => {
    const manualRow = existing("m1", {
      artistName: "The Headliner",
      source: "manual",
      externalKey: null,
      startsAt: T("21:00"),
      endsAt: T("22:30"),
    });
    const otherManual = existing("m2", { artistName: "Local Band", source: "manual", externalKey: null });
    const act = incoming("h", "Headliner", "21:00", "22:30");
    const plan = planLineupSync([manualRow, otherManual], [act]);
    expect(plan.inserts).toEqual([]);
    expect(plan.matchedManual).toEqual([{ id: "m1", incoming: act }]);
    expect(plan.deletes).toEqual([]);
  });

  it("does not match a manual row at a different time", () => {
    const manualRow = existing("m1", { artistName: "A", source: "manual", externalKey: null, startsAt: T("12:00") });
    const act = incoming("a", "A", "18:00");
    expect(planLineupSync([manualRow], [act]).inserts).toEqual([act]);
  });

  it("matches each manual row at most once", () => {
    const manualRow = existing("m1", { artistName: "A", source: "manual", externalKey: null });
    const acts = [incoming("a1", "A", "18:00"), incoming("a2", "A", "18:00", "19:00", "Tent")];
    const plan = planLineupSync([manualRow], acts);
    expect(plan.matchedManual).toHaveLength(1);
    expect(plan.inserts).toEqual([acts[1]]);
  });
});
