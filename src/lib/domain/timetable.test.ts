import { describe, expect, it } from "vitest";
import { layoutTimetable, UNASSIGNED_STAGE_NAME } from "./timetable";
import type { ScheduledPerformance, Stage } from "./types";

const T = (hhmm: string) => new Date(`2026-06-26T${hhmm}:00Z`);

const stages: Stage[] = [
  { id: "tent", name: "Tent", sortOrder: 2 },
  { id: "main", name: "Main", sortOrder: 1 },
  { id: "field", name: "Field", sortOrder: 3 },
];

function perf(id: string, stageId: string | null, start: string, end: string): ScheduledPerformance {
  return { id, artistId: id, artistName: id, stageId, stageName: stageId, startsAt: T(start), endsAt: T(end) };
}

describe("layoutTimetable", () => {
  it("returns null for an empty day", () => {
    expect(layoutTimetable([], stages)).toBeNull();
  });

  it("spans whole hours around the sets", () => {
    const layout = layoutTimetable([perf("a", "main", "18:15", "19:00"), perf("b", "tent", "20:30", "21:45")], stages)!;
    expect(layout.start).toEqual(T("18:00"));
    expect(layout.end).toEqual(T("22:00"));
    expect(layout.totalMinutes).toBe(240);
    expect(layout.hours.map((h) => h.toISOString().slice(11, 16))).toEqual([
      "18:00",
      "19:00",
      "20:00",
      "21:00",
      "22:00",
    ]);
  });

  it("orders columns by stage sort order and drops empty stages", () => {
    const layout = layoutTimetable([perf("a", "tent", "18:00", "19:00"), perf("b", "main", "18:00", "19:00")], stages)!;
    expect(layout.columns.map((c) => c.stageName)).toEqual(["Main", "Tent"]);
  });

  it("keeps empty stages when asked", () => {
    const layout = layoutTimetable([perf("a", "tent", "18:00", "19:00")], stages, { keepEmptyStages: true })!;
    expect(layout.columns.map((c) => c.stageName)).toEqual(["Main", "Tent", "Field"]);
  });

  it("positions items relative to the grid start", () => {
    const layout = layoutTimetable([perf("a", "main", "18:15", "19:00"), perf("b", "main", "19:30", "20:45")], stages)!;
    const [a, b] = layout.columns[0].items;
    expect([a.offsetMinutes, a.durationMinutes]).toEqual([15, 45]);
    expect([b.offsetMinutes, b.durationMinutes]).toEqual([90, 75]);
    expect([a.lane, a.laneCount, b.lane, b.laneCount]).toEqual([0, 1, 0, 1]);
  });

  it("puts sets without a known stage in a trailing TBA column", () => {
    const layout = layoutTimetable([perf("a", null, "18:00", "19:00"), perf("b", "gone", "18:00", "19:00")], stages)!;
    expect(layout.columns).toHaveLength(1);
    expect(layout.columns[0].stageName).toBe(UNASSIGNED_STAGE_NAME);
    expect(layout.columns[0].items).toHaveLength(2);
  });

  it("splits overlapping sets on one stage into lanes", () => {
    const layout = layoutTimetable(
      [
        perf("a", "main", "18:00", "19:30"),
        perf("b", "main", "19:00", "20:00"),
        perf("c", "main", "19:45", "21:00"),
        perf("d", "main", "22:00", "23:00"),
      ],
      stages,
    )!;
    const lanes = Object.fromEntries(layout.columns[0].items.map((i) => [i.performance.id, [i.lane, i.laneCount]]));
    expect(lanes).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });
});
