import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/data/errors";
import {
  applyLineupChange,
  canEditFestival,
  createFestival as createFestivalData,
  ensureArtist,
  getFestivalBySlug,
  getLineup,
  lineupArtists,
  listFestivals,
} from "@/lib/data/lineup";
import { adminClient, anonClient, createFestival, createUser, trackFestival, uniq } from "./helpers";

describe("festivals", () => {
  it("lets any signed-in user create a festival they own, with a unique slug", async () => {
    const user = await createUser();
    const name = `Green Fields ${uniq()}`;
    const input = { name, location: "Somerset", timezone: "Europe/London", startsOn: "2026-06-24", endsOn: "2026-06-28" };
    const first = await createFestivalData(user.client, user.id, input);
    const second = await createFestivalData(user.client, user.id, input);
    trackFestival(first.id);
    trackFestival(second.id);

    expect(first.created_by).toBe(user.id);
    expect(second.slug).toBe(`${first.slug}-2`);
    expect(await getFestivalBySlug(anonClient(), first.slug)).toMatchObject({ name });
    expect((await listFestivals(anonClient(), name)).map((f) => f.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("does not let signed-out visitors create festivals", async () => {
    const result = await anonClient().from("festivals").insert({ slug: `x-${uniq()}`, name: "Nope" });
    expect(result.error).not.toBeNull();
  });

  it("does not let users claim Clashfinder-backed festivals or take ownership", async () => {
    const [owner, other] = await Promise.all([createUser(), createUser()]);
    const claim = await owner.client
      .from("festivals")
      .insert({ slug: `cf-${uniq()}`, name: "Claim", created_by: owner.id, clashfinder_id: `cf${uniq()}` });
    expect(claim.error?.code).toBe("42501");

    const festival = await createFestival(owner);
    const steal = await owner.client.from("festivals").update({ created_by: other.id }).eq("id", festival.id);
    expect(steal.error?.code).toBe("42501");
  });

  it("only lets the owner or a moderator rename a festival", async () => {
    const [owner, stranger, moderator] = await Promise.all([createUser(), createUser(), createUser("moderator")]);
    const festival = await createFestival(owner);

    await stranger.client.from("festivals").update({ name: "Stranger" }).eq("id", festival.id);
    expect((await getFestivalBySlug(anonClient(), festival.slug))!.name).toBe(festival.name);

    await moderator.client.from("festivals").update({ name: "Moderated" }).eq("id", festival.id);
    expect((await getFestivalBySlug(anonClient(), festival.slug))!.name).toBe("Moderated");

    expect(await canEditFestival(owner.client, owner.id, festival.id)).toBe(true);
    expect(await canEditFestival(stranger.client, stranger.id, festival.id)).toBe(false);
    expect(await canEditFestival(moderator.client, moderator.id, festival.id)).toBe(true);
    expect(await canEditFestival(anonClient(), null, festival.id)).toBe(false);
  });
});

describe("lineup editing", () => {
  it("lets the owner add, update and remove performances", async () => {
    const owner = await createUser();
    const festival = await createFestival(owner);
    const artist = `Band ${uniq()}`;

    const { performanceId } = await applyLineupChange(owner.client, festival.id, {
      kind: "add_performance",
      artistName: artist,
      stageName: "Main Stage",
      startsAt: "2026-06-26T18:00:00Z",
      endsAt: "2026-06-26T19:00:00Z",
    });
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: `Tba ${uniq()}` });

    let lineup = await getLineup(anonClient(), festival.id);
    expect(lineup.stages.map((s) => s.name)).toEqual(["Main Stage"]);
    expect(lineup.performances).toHaveLength(2);
    expect(lineup.performances[0]).toMatchObject({
      artistName: artist,
      stageName: "Main Stage",
      startsAt: new Date("2026-06-26T18:00:00Z"),
      source: "manual",
      locallyModified: false,
    });
    expect(lineup.performances[1]).toMatchObject({ stageId: null, startsAt: null });

    await applyLineupChange(owner.client, festival.id, {
      kind: "update_performance",
      performanceId: performanceId!,
      stageName: "Tent",
      startsAt: "2026-06-26T20:00:00Z",
      endsAt: "2026-06-26T21:00:00Z",
    });
    lineup = await getLineup(anonClient(), festival.id);
    const updated = lineup.performances.find((p) => p.id === performanceId)!;
    expect(updated).toMatchObject({ stageName: "Tent", startsAt: new Date("2026-06-26T20:00:00Z"), locallyModified: true });
    expect(lineup.stages.map((s) => [s.name, s.sortOrder])).toEqual([
      ["Main Stage", 0],
      ["Tent", 1],
    ]);

    await applyLineupChange(owner.client, festival.id, { kind: "remove_performance", performanceId: performanceId! });
    expect((await getLineup(anonClient(), festival.id)).performances).toHaveLength(1);
  });

  it("refuses edits from users who don't own the festival", async () => {
    const [owner, stranger] = await Promise.all([createUser(), createUser()]);
    const festival = await createFestival(owner);
    const { performanceId } = await applyLineupChange(owner.client, festival.id, {
      kind: "add_performance",
      artistName: `Owned ${uniq()}`,
    });

    await expect(
      applyLineupChange(stranger.client, festival.id, { kind: "add_performance", artistName: `Sneaky ${uniq()}` }),
    ).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      applyLineupChange(stranger.client, festival.id, { kind: "remove_performance", performanceId: performanceId! }),
    ).rejects.toThrow(/no longer exists, or you can't edit it/);
    await expect(
      applyLineupChange(stranger.client, festival.id, { kind: "update_performance", performanceId: performanceId!, stageName: null }),
    ).rejects.toBeInstanceOf(UserFacingError);
    expect((await getLineup(anonClient(), festival.id)).performances).toHaveLength(1);
  });

  it("lets moderators edit any festival", async () => {
    const moderator = await createUser("moderator");
    const festival = await createFestival();
    await applyLineupChange(moderator.client, festival.id, { kind: "add_performance", artistName: `Mod ${uniq()}` });
    expect((await getLineup(anonClient(), festival.id)).performances).toHaveLength(1);
  });

  it("rejects performances that end before they start", async () => {
    const owner = await createUser();
    const festival = await createFestival(owner);
    const artistId = await ensureArtist(owner.client, `Backwards ${uniq()}`);
    const result = await owner.client.from("performances").insert({
      festival_id: festival.id,
      artist_id: artistId,
      starts_at: "2026-06-26T19:00:00Z",
      ends_at: "2026-06-26T18:00:00Z",
    });
    expect(result.error?.code).toBe("23514");
  });
});

describe("artist catalogue", () => {
  it("de-duplicates artists by normalised name across festivals", async () => {
    const user = await createUser();
    const suffix = uniq();
    const a = await ensureArtist(user.client, `The Bänd ${suffix}`);
    const b = await ensureArtist(user.client, `Band ${suffix} (DJ Set)`);
    expect(b).toBe(a);
  });

  it("groups a lineup by artist", async () => {
    const owner = await createUser();
    const festival = await createFestival(owner);
    const name = `Twice ${uniq()}`;
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: name });
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: `${name} (live)` });
    const artists = lineupArtists(await getLineup(anonClient(), festival.id));
    expect(artists).toHaveLength(1);
    expect(artists[0].performances).toHaveLength(2);
  });

  it("only lets moderators rename artists", async () => {
    const [user, moderator] = await Promise.all([createUser(), createUser("moderator")]);
    const id = await ensureArtist(user.client, `Rename ${uniq()}`);
    await user.client.from("artists").update({ name: "Vandalised" }).eq("id", id);
    expect((await adminClient().from("artists").select("name").eq("id", id).single()).data!.name).not.toBe("Vandalised");
    await moderator.client.from("artists").update({ name: "Corrected" }).eq("id", id);
    expect((await adminClient().from("artists").select("name").eq("id", id).single()).data!.name).toBe("Corrected");
  });
});
