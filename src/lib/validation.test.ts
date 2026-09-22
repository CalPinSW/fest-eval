import { describe, expect, it } from "vitest";
import {
  festivalInputSchema,
  firstIssue,
  lineupChangeSchema,
  signUpSchema,
  slugify,
  usernameSchema,
} from "./validation";

const uuid = "5b0f1a9e-9a1c-4d3a-8f4e-2b6c1d0e9f11";

describe("lineupChangeSchema", () => {
  it("accepts an added performance with and without times", () => {
    expect(lineupChangeSchema.parse({ kind: "add_performance", artistName: "  Wet Leg " })).toEqual({
      kind: "add_performance",
      artistName: "Wet Leg",
    });
    expect(
      lineupChangeSchema.safeParse({
        kind: "add_performance",
        artistName: "Wet Leg",
        stageName: "Tent",
        startsAt: "2026-06-26T18:00:00Z",
        endsAt: "2026-06-26T19:00:00+00:00",
      }).success,
    ).toBe(true);
  });

  it("rejects end before start and end without start", () => {
    const bad = lineupChangeSchema.safeParse({
      kind: "add_performance",
      artistName: "A",
      startsAt: "2026-06-26T19:00:00Z",
      endsAt: "2026-06-26T18:00:00Z",
    });
    expect(bad.success).toBe(false);
    expect(firstIssue(bad.error!)).toMatch(/end time/);
    expect(
      lineupChangeSchema.safeParse({ kind: "update_performance", performanceId: uuid, endsAt: "2026-06-26T18:00:00Z" })
        .success,
    ).toBe(false);
  });

  it("requires a valid performance id for updates and removals", () => {
    expect(lineupChangeSchema.safeParse({ kind: "remove_performance", performanceId: uuid }).success).toBe(true);
    expect(lineupChangeSchema.safeParse({ kind: "remove_performance", performanceId: "nope" }).success).toBe(false);
  });

  it("rejects unknown kinds and empty names", () => {
    expect(lineupChangeSchema.safeParse({ kind: "drop_table" }).success).toBe(false);
    expect(lineupChangeSchema.safeParse({ kind: "add_performance", artistName: "   " }).success).toBe(false);
  });

  it("rejects timestamps without a zone", () => {
    expect(
      lineupChangeSchema.safeParse({ kind: "add_performance", artistName: "A", startsAt: "2026-06-26T18:00" }).success,
    ).toBe(false);
  });
});

describe("user input", () => {
  it("validates usernames", () => {
    expect(usernameSchema.safeParse("festival_fan").success).toBe(true);
    for (const bad of ["ab", "has space", "x".repeat(25), "emoji🎸"]) {
      expect(usernameSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("validates sign-up", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "longenough", username: "abc" }).success).toBe(true);
    const short = signUpSchema.safeParse({ email: "a@b.co", password: "short", username: "abc" });
    expect(firstIssue(short.error!)).toBe("Use at least 8 characters");
  });
});

describe("festivalInputSchema", () => {
  const base = { name: "Green Man", location: "", timezone: "Europe/London", startsOn: "2026-08-20", endsOn: "2026-08-23" };

  it("normalises optional fields", () => {
    expect(festivalInputSchema.parse({ ...base, startsOn: "", endsOn: "" })).toEqual({
      name: "Green Man",
      location: null,
      timezone: "Europe/London",
      startsOn: null,
      endsOn: null,
    });
  });

  it("rejects unknown zones and reversed dates", () => {
    expect(festivalInputSchema.safeParse({ ...base, timezone: "Nowhere" }).success).toBe(false);
    const reversed = festivalInputSchema.safeParse({ ...base, endsOn: "2026-08-19" });
    expect(firstIssue(reversed.error!)).toMatch(/end on or after/);
  });
});

describe("slugify", () => {
  it.each([
    ["Glastonbury 2026", "glastonbury-2026"],
    ["  Rock Werchter!! ", "rock-werchter"],
    ["Øya Festival", "ya-festival"],
    ["Förest Fest", "forest-fest"],
    ["---", ""],
  ])("%s -> %s", (input, slug) => {
    expect(slugify(input)).toBe(slug);
  });

  it("caps length without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});
