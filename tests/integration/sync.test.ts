import { describe, expect, it } from "vitest";
import { sampleClashfinderFeed } from "@/lib/clashfinder/fixtures";
import { parseClashfinderEvent } from "@/lib/clashfinder/parse";
import { applyLineupChange, getLineup } from "@/lib/data/lineup";
import { applyClashfinderEvent, createFestivalFromClashfinder } from "@/lib/data/sync";
import { adminClient, anonClient, createUser, trackFestival, uniq } from "./helpers";

/** The sample feed with artist names made unique to this test run. */
function feed(mutate?: (f: typeof sampleClashfinderFeed) => void) {
  const suffix = uniq();
  const copy = structuredClone(sampleClashfinderFeed);
  for (const loc of copy.locations) for (const e of loc.events) e.name = `${e.name} ${suffix}`;
  mutate?.(copy);
  return { event: parseClashfinderEvent(copy), suffix };
}

async function importFeed(event: ReturnType<typeof parseClashfinderEvent>, createdBy: string | null = null) {
  const admin = adminClient();
  const festival = await createFestivalFromClashfinder(admin, `cf${uniq()}`, event, createdBy);
  trackFestival(festival.id);
  const summary = await applyClashfinderEvent(admin, festival.id, event, new Date("2026-06-01T00:00:00Z"));
  return { festival, summary };
}

describe("Clashfinder sync", () => {
  it("imports a festival with its stages and set times", async () => {
    const { event, suffix } = feed();
    const { festival, summary } = await importFeed(event);

    expect(festival.slug).toMatch(/^sample-fest-2026/);
    expect(summary).toMatchObject({ inserted: 4, updated: 0, deleted: 0, unchanged: 0 });

    const { data } = await anonClient().from("festivals").select("*").eq("id", festival.id).single();
    expect(data).toMatchObject({
      timezone: "Europe/London",
      starts_on: "2026-06-26",
      ends_on: "2026-06-27",
      last_synced_at: "2026-06-01T00:00:00+00:00",
    });

    const lineup = await getLineup(anonClient(), festival.id);
    expect(lineup.stages.map((s) => s.name)).toEqual(["Main Stage", "Tent"]);
    expect(lineup.performances.every((p) => p.source === "clashfinder")).toBe(true);
    // "Headliner" plays twice: one artist, two performances.
    const headliner = lineup.performances.filter((p) => p.artistName === `Headliner ${suffix}`);
    expect(headliner).toHaveLength(2);
    expect(new Set(headliner.map((p) => p.artistId)).size).toBe(1);
  });

  it("is idempotent", async () => {
    const { event } = feed();
    const { festival } = await importFeed(event);
    const again = await applyClashfinderEvent(adminClient(), festival.id, event);
    expect(again).toMatchObject({ inserted: 0, updated: 0, deleted: 0, unchanged: 4 });
  });

  it("applies upstream changes and removals but keeps community edits", async () => {
    const { event, suffix } = feed();
    const moderator = await createUser("moderator");
    const { festival } = await importFeed(event);
    const before = await getLineup(anonClient(), festival.id);
    const opener = before.performances.find((p) => p.externalKey === "openin(1)")!;

    // A moderator corrects the headliner's first set time.
    const headliner = before.performances.find((p) => p.externalKey === "headli(1)")!;
    await applyLineupChange(moderator.client, festival.id, {
      kind: "update_performance",
      performanceId: headliner.id,
      startsAt: "2026-06-26T21:15:00Z",
      endsAt: "2026-06-26T23:00:00Z",
    });

    // Upstream: opener moves, late DJ is cancelled, headliner time changes too.
    const { event: changed } = feed((f) => {
      for (const loc of f.locations) for (const e of loc.events) e.name = `${e.name.split(" ").slice(0, -1).join(" ")} ${suffix}`;
      f.locations[0].events[0].start = "2026-06-26 18:30";
      f.locations[0].events[1].start = "2026-06-26 21:30";
      f.locations[1].events = f.locations[1].events.filter((e) => e.short !== "latedj(1)");
    });
    const summary = await applyClashfinderEvent(adminClient(), festival.id, changed);
    expect(summary).toMatchObject({ updated: 1, deleted: 1, keptLocalEdits: 1, inserted: 0 });

    const after = await getLineup(anonClient(), festival.id);
    expect(after.performances.find((p) => p.id === opener.id)!.startsAt).toEqual(new Date("2026-06-26T17:30:00Z"));
    expect(after.performances.find((p) => p.id === headliner.id)!.startsAt).toEqual(new Date("2026-06-26T21:15:00Z"));
    expect(after.performances.some((p) => p.externalKey === "latedj(1)")).toBe(false);
  });

  it("links hand-added sets instead of duplicating them", async () => {
    const owner = await createUser();
    const { event, suffix } = feed();
    const admin = adminClient();
    const festival = await createFestivalFromClashfinder(admin, `cf${uniq()}`, event, owner.id);
    trackFestival(festival.id);

    // Before the feed is loaded, the owner adds the opener by hand.
    await applyLineupChange(owner.client, festival.id, {
      kind: "add_performance",
      artistName: `The Opening Band ${suffix}`,
      startsAt: "2026-06-26T17:00:00Z",
      endsAt: "2026-06-26T18:00:00Z",
    });

    const summary = await applyClashfinderEvent(admin, festival.id, event);
    expect(summary).toMatchObject({ inserted: 3, matchedManual: 1 });
    const lineup = await getLineup(anonClient(), festival.id);
    expect(lineup.performances).toHaveLength(4);
    expect(lineup.performances.find((p) => p.artistName.startsWith("The Opening Band"))).toMatchObject({
      source: "clashfinder",
      externalKey: "openin(1)",
      stageName: "Main Stage",
    });
  });

  it("refuses to import the same Clashfinder event twice", async () => {
    const { event } = feed();
    const admin = adminClient();
    const id = `cf${uniq()}`;
    const first = await createFestivalFromClashfinder(admin, id, event, null);
    trackFestival(first.id);
    await expect(createFestivalFromClashfinder(admin, id, event, null)).rejects.toThrow();
  });
});
