import { describe, expect, it } from "vitest";
import {
  festivalDayOf,
  festivalDays,
  festivalDayWindow,
  formatDayLabel,
  formatLocalTime,
  instantToLocalInput,
  isValidTimeZone,
  localDateTimeToInstant,
} from "./time";

const LONDON = "Europe/London";

describe("localDateTimeToInstant", () => {
  it("converts summer (BST) wall-clock time to UTC", () => {
    expect(localDateTimeToInstant("2026-06-26 21:30", LONDON).toISOString()).toBe(
      "2026-06-26T20:30:00.000Z",
    );
  });

  it("converts winter (GMT) wall-clock time to UTC", () => {
    expect(localDateTimeToInstant("2026-01-10 21:30", LONDON).toISOString()).toBe(
      "2026-01-10T21:30:00.000Z",
    );
  });

  it("accepts the datetime-local T separator and seconds", () => {
    expect(localDateTimeToInstant("2026-04-12T20:05:30", "America/Los_Angeles").toISOString()).toBe(
      "2026-04-13T03:05:30.000Z",
    );
  });

  it.each(["", "2026-06-26", "26/06/2026 21:00", "2026-13-01 10:00", "2026-02-30 10:00", "2026-06-26 24:00"])(
    "rejects %j",
    (bad) => {
      expect(() => localDateTimeToInstant(bad, LONDON)).toThrow(/Invalid/);
    },
  );
});

describe("formatting", () => {
  const instant = new Date("2026-06-26T23:15:00Z");

  it("formats local time in the festival zone", () => {
    expect(formatLocalTime(instant, LONDON)).toBe("00:15");
    expect(formatLocalTime(instant, "America/New_York")).toBe("19:15");
  });

  it("round-trips through the datetime-local format", () => {
    const local = instantToLocalInput(instant, LONDON);
    expect(local).toBe("2026-06-27T00:15");
    expect(localDateTimeToInstant(local, LONDON)).toEqual(instant);
  });

  it("labels days", () => {
    expect(formatDayLabel("2026-06-26")).toBe("Fri 26 Jun");
    expect(formatDayLabel("nonsense")).toBe("nonsense");
  });
});

describe("festival days", () => {
  it("assigns after-midnight sets to the previous day", () => {
    const lateSet = localDateTimeToInstant("2026-06-27 01:30", LONDON);
    expect(festivalDayOf(lateSet, LONDON, 6)).toBe("2026-06-26");
  });

  it("starts a new day at the boundary hour", () => {
    const morning = localDateTimeToInstant("2026-06-27 06:00", LONDON);
    expect(festivalDayOf(morning, LONDON, 6)).toBe("2026-06-27");
    expect(festivalDayOf(morning, LONDON, 0)).toBe("2026-06-27");
  });

  it("uses calendar days when the boundary is midnight", () => {
    const lateSet = localDateTimeToInstant("2026-06-27 01:30", LONDON);
    expect(festivalDayOf(lateSet, LONDON, 0)).toBe("2026-06-27");
  });

  it("computes the window of a day", () => {
    const { start, end } = festivalDayWindow("2026-06-26", LONDON, 6);
    expect(start.toISOString()).toBe("2026-06-26T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-27T05:00:00.000Z");
  });

  it("rejects malformed days", () => {
    expect(() => festivalDayWindow("26-06-2026", LONDON, 6)).toThrow();
  });

  it("lists unique sorted days", () => {
    const instants = ["2026-06-27 14:00", "2026-06-26 20:00", "2026-06-27 02:00", "2026-06-28 12:00"].map((s) =>
      localDateTimeToInstant(s, LONDON),
    );
    expect(festivalDays(instants, LONDON, 6)).toEqual(["2026-06-26", "2026-06-27", "2026-06-28"]);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
