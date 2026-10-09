import { describe, expect, it, vi } from "vitest";
import {
  clashfinderCredentialsFromEnv,
  clashfinderEventUrl,
  fetchClashfinderEvent,
  parseClashfinderId,
} from "./client";
import { sampleClashfinderFeed } from "./fixtures";
import { ClashfinderError, parseClashfinderEvent } from "./parse";

const creds = { username: "planner", publicKey: "abc123" };

describe("parseClashfinderEvent", () => {
  it("parses stages and acts, converting local times to UTC", () => {
    const event = parseClashfinderEvent(sampleClashfinderFeed);
    expect(event.id).toBe("samplefest26");
    expect(event.name).toBe("Sample Fest 2026");
    expect(event.timezone).toBe("Europe/London");
    expect(event.stages).toEqual(["Main Stage", "Tent"]);
    expect(event.acts).toHaveLength(4);
    expect(event.acts[0]).toEqual({
      externalKey: "openin(1)",
      artistName: "The Opening Band",
      stageName: "Main Stage",
      startsAt: new Date("2026-06-26T17:00:00Z"),
      endsAt: new Date("2026-06-26T18:00:00Z"),
    });
    expect(event.rejected).toEqual([]);
  });

  it("rejects failed authentication", () => {
    expect(() => parseClashfinderEvent({ ...sampleClashfinderFeed, auth: { result: "fail" } })).toThrow(
      /authentication failed: fail/,
    );
  });

  it("rejects non-object responses", () => {
    expect(() => parseClashfinderEvent("nope")).toThrow(ClashfinderError);
    expect(() => parseClashfinderEvent({ locations: "nope" })).toThrow(ClashfinderError);
  });

  it("drops bad entries and reports why", () => {
    const event = parseClashfinderEvent({
      timezone: "Europe/London",
      locations: [
        { name: "  ", events: [{ name: "Ignored, stage has no name", start: "2026-06-26 10:00", end: "2026-06-26 11:00" }] },
        {
          name: "Main",
          events: [
            { short: "noname(1)", start: "2026-06-26 10:00", end: "2026-06-26 11:00" },
            { name: "No End", start: "2026-06-26 10:00" },
            { name: "Bad Time", start: "tomorrow", end: "later" },
            { name: "Backwards", start: "2026-06-26 11:00", end: "2026-06-26 10:00" },
            { name: "Dup", short: "dup(1)", start: "2026-06-26 12:00", end: "2026-06-26 13:00" },
            { name: "Dup", short: "dup(1)", start: "2026-06-26 12:00", end: "2026-06-26 13:00" },
            { name: "  Spaced   Out  ", start: "2026-06-26 14:00", end: "2026-06-26 15:00" },
          ],
        },
      ],
    });
    expect(event.acts.map((a) => a.artistName)).toEqual(["Dup", "Spaced Out"]);
    expect(event.acts[1].externalKey).toBe("Main|Spaced Out|2026-06-26 14:00");
    expect(event.rejected).toEqual([
      { entry: "noname(1)", reason: "missing name" },
      { entry: "No End", reason: "missing start or end time" },
      { entry: "Bad Time", reason: "unreadable time" },
      { entry: "Backwards", reason: "ends before it starts" },
      { entry: "Dup", reason: "duplicate entry" },
    ]);
  });

  it("falls back to the supplied time zone when the feed has none or an invalid one", () => {
    const feed = {
      locations: [{ name: "Main", events: [{ name: "A", start: "2026-07-01 20:00", end: "2026-07-01 21:00" }] }],
    };
    expect(parseClashfinderEvent(feed, "Europe/Berlin").acts[0].startsAt.toISOString()).toBe("2026-07-01T18:00:00.000Z");
    expect(parseClashfinderEvent({ ...feed, timezone: "Nowhere/Land" }, "UTC").timezone).toBe("UTC");
  });

  it("shortens over-long names instead of rejecting them", () => {
    const event = parseClashfinderEvent({
      locations: [{ name: "Theatre", events: [{ name: "x".repeat(500), start: "2026-06-26 10:00", end: "2026-06-26 11:00" }] }],
    });
    expect(event.acts[0].artistName).toHaveLength(200);
    expect(event.rejected).toEqual([]);
  });

  it("handles an empty feed", () => {
    expect(parseClashfinderEvent({})).toMatchObject({ stages: [], acts: [], rejected: [] });
  });
});

describe("parseClashfinderId", () => {
  it.each([
    ["glasto2026", "glasto2026"],
    ["  ep26 ", "ep26"],
    ["https://clashfinder.com/s/glasto2026/", "glasto2026"],
    ["https://clashfinder.com/m/glasto2026/?user=abc", "glasto2026"],
    ["https://clashfinder.com/data/event/wacken2026.json", "wacken2026"],
  ])("%s -> %s", (input, id) => {
    expect(parseClashfinderId(input)).toBe(id);
  });

  it.each(["", "has spaces", "../../etc/passwd", "https://example.com/s/x y/"])("rejects %j", (input) => {
    expect(parseClashfinderId(input)).toBeNull();
  });
});

describe("clashfinderEventUrl", () => {
  it("adds authentication to the query string", () => {
    expect(clashfinderEventUrl("glasto2026", creds)).toBe(
      "https://clashfinder.com/data/event/glasto2026.json?authUsername=planner&authPublicKey=abc123",
    );
  });

  it("refuses ids that could escape the path", () => {
    expect(() => clashfinderEventUrl("../x", creds)).toThrow(ClashfinderError);
  });
});

describe("fetchClashfinderEvent", () => {
  it("fetches and parses the feed", async () => {
    const fetchMock = vi.fn(async () => Response.json(sampleClashfinderFeed));
    const event = await fetchClashfinderEvent("samplefest26", creds, { fetch: fetchMock });
    expect(event.acts).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/data/event/samplefest26.json?authUsername=planner"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("reports missing events", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    await expect(fetchClashfinderEvent("nope", creds, { fetch: fetchMock })).rejects.toThrow(/No Clashfinder event/);
  });

  it("reports server errors", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    await expect(fetchClashfinderEvent("x", creds, { fetch: fetchMock })).rejects.toThrow(/failed \(500\)/);
  });

  it("reports invalid JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>", { status: 200 }));
    await expect(fetchClashfinderEvent("x", creds, { fetch: fetchMock })).rejects.toThrow(/invalid JSON/);
  });
});

describe("clashfinderCredentialsFromEnv", () => {
  it("reads both variables or returns null", () => {
    expect(clashfinderCredentialsFromEnv({ CLASHFINDER_USERNAME: "u", CLASHFINDER_PUBLIC_KEY: "k" } as never)).toEqual({
      username: "u",
      publicKey: "k",
    });
    expect(clashfinderCredentialsFromEnv({ CLASHFINDER_USERNAME: "u" } as never)).toBeNull();
  });
});
