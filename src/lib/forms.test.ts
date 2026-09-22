import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/data/errors";
import { parseLineupForm, parsePriority } from "./forms";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const id = "5b0f1a9e-9a1c-4d3a-8f4e-2b6c1d0e9f11";

describe("parseLineupForm", () => {
  it("converts local times in the festival's zone", () => {
    const change = parseLineupForm(
      form({
        kind: "add_performance",
        artistName: " Wet Leg ",
        stageName: "Tent",
        startsAt: "2026-06-26T21:00",
        endsAt: "2026-06-26T22:15",
      }),
      "Europe/London",
    );
    expect(change).toEqual({
      kind: "add_performance",
      artistName: "Wet Leg",
      stageName: "Tent",
      startsAt: "2026-06-26T20:00:00.000Z",
      endsAt: "2026-06-26T21:15:00.000Z",
    });
  });

  it("treats blank optional fields as unknown", () => {
    expect(parseLineupForm(form({ kind: "add_performance", artistName: "A", stageName: "", startsAt: "" }), "UTC")).toEqual({
      kind: "add_performance",
      artistName: "A",
      stageName: null,
      startsAt: null,
      endsAt: null,
    });
  });

  it("builds updates and removals", () => {
    expect(
      parseLineupForm(form({ kind: "update_performance", performanceId: id, stageName: "Main", startsAt: "2026-06-26T10:00" }), "UTC"),
    ).toMatchObject({ kind: "update_performance", performanceId: id, startsAt: "2026-06-26T10:00:00.000Z", endsAt: null });
    expect(parseLineupForm(form({ kind: "remove_performance", performanceId: id }), "UTC")).toEqual({
      kind: "remove_performance",
      performanceId: id,
    });
  });

  it.each([
    [{ kind: "add_performance", artistName: "" }, /artist's name/],
    [{ kind: "add_performance", artistName: "A", startsAt: "2026-06-26T10:00", endsAt: "2026-06-26T09:00" }, /end time/],
    [{ kind: "add_performance", artistName: "A", startsAt: "soon" }, /date and time/],
    [{ kind: "remove_performance", performanceId: "x" }, /doesn't look right/],
    [{ kind: "hack" }, /doesn't look right/],
  ])("explains invalid input %#", (fields, message) => {
    expect(() => parseLineupForm(form(fields as Record<string, string>), "UTC")).toThrow(message);
    expect(() => parseLineupForm(form(fields as Record<string, string>), "UTC")).toThrow(UserFacingError);
  });
});

describe("parsePriority", () => {
  it("parses and clears", () => {
    expect(parsePriority("4")).toBe(4);
    expect(parsePriority("")).toBeNull();
    expect(parsePriority("0")).toBeNull();
    expect(parsePriority(null)).toBeNull();
    expect(() => parsePriority("9")).toThrow(UserFacingError);
  });
});
