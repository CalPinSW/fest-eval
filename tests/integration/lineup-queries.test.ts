import { describe, expect, it } from "vitest";
import { applyLineupChange } from "@/lib/data/lineup";
import {
  escapeLikePattern,
  getDayPerformances,
  getFestivalDays,
  getLikedLineupArtists,
  getLineupArtistsByIds,
  getLineupPage,
  getPerformancesByIds,
  getUnscheduledArtistNames,
} from "@/lib/data/lineup-queries";
import { saveSpotifyConnection, syncLikedArtists } from "@/lib/data/music";
import { adminClient, anonClient, createFestival, createUser, uniq } from "./helpers";

/** A festival with `count` artists (names zero-padded so they sort predictably). */
async function bigFestival(count: number) {
  const admin = adminClient();
  const festival = await createFestival();
  const suffix = uniq();
  const { data: stage } = await admin.from("stages").insert({ festival_id: festival.id, name: "Main" }).select("id").single();
  const artists = Array.from({ length: count }, (_, i) => ({
    name: `Band ${String(i).padStart(4, "0")} ${suffix}`,
    normalized_name: `band ${String(i).padStart(4, "0")} ${suffix}`,
  }));
  const ids: string[] = [];
  for (let i = 0; i < artists.length; i += 500) {
    const { data, error } = await admin.from("artists").insert(artists.slice(i, i + 500)).select("id, name").order("name");
    if (error) throw error;
    ids.push(...data.map((a) => a.id));
  }
  const performances = ids.map((artist_id, i) => ({
    festival_id: festival.id,
    artist_id,
    stage_id: stage!.id,
    starts_at: new Date(Date.UTC(2027, 5, 25 + (i % 3), 12) + (i % 300) * 60_000).toISOString(),
    ends_at: new Date(Date.UTC(2027, 5, 25 + (i % 3), 12) + ((i % 300) + 1) * 60_000).toISOString(),
  }));
  for (let i = 0; i < performances.length; i += 500) {
    const { error } = await admin.from("performances").insert(performances.slice(i, i + 500));
    if (error) throw error;
  }
  return { festival, suffix, artistIds: ids };
}

describe("lineup queries", () => {
  it("pages through artists in name order with a total count", async () => {
    const { festival, suffix } = await bigFestival(250);
    const first = await getLineupPage(anonClient(), festival.id);
    expect(first.total).toBe(250);
    expect(first.artists).toHaveLength(100);
    expect(first.artists[0].name).toBe(`Band 0000 ${suffix}`);

    const last = await getLineupPage(anonClient(), festival.id, { page: 3 });
    expect(last.artists.map((a) => a.name)).toEqual(
      Array.from({ length: 50 }, (_, i) => `Band ${String(200 + i).padStart(4, "0")} ${suffix}`),
    );
    expect((await getLineupPage(anonClient(), festival.id, { page: 9 })).artists).toEqual([]);
  });

  it("searches by name, treating wildcards literally", async () => {
    const owner = await createUser();
    const festival = await createFestival(owner);
    const suffix = uniq();
    for (const name of [`100% Silk ${suffix}`, `100 Gecs ${suffix}`, `Under_score ${suffix}`, `Underscore ${suffix}`]) {
      await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: name });
    }
    const names = async (search: string) => (await getLineupPage(anonClient(), festival.id, { search })).artists.map((a) => a.name);
    expect(await names("100%")).toEqual([`100% Silk ${suffix}`]);
    expect(await names("under_")).toEqual([`Under_score ${suffix}`]);
    expect((await names("gecs")).length).toBe(1);
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("groups an artist's performances and filters to given artists", async () => {
    const owner = await createUser();
    const festival = await createFestival(owner);
    const name = `Twice ${uniq()}`;
    await applyLineupChange(owner.client, festival.id, {
      kind: "add_performance",
      artistName: name,
      stageName: "Tent",
      startsAt: "2027-06-26T20:00:00Z",
      endsAt: "2027-06-26T21:00:00Z",
    });
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: name });
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: `Other ${uniq()}` });

    const { artists } = await getLineupPage(anonClient(), festival.id);
    const twice = artists.find((a) => a.name === name)!;
    expect(twice.performances.map((p) => [p.stageName, p.startsAt])).toEqual([
      ["Tent", new Date("2027-06-26T20:00:00Z")],
      [null, null],
    ]);
    expect(twice.performances[0]).toMatchObject({ source: "manual", locallyModified: false, artistName: name });

    expect((await getLineupArtistsByIds(anonClient(), festival.id, [twice.id])).map((a) => a.name)).toEqual([name]);
    expect(await getLineupPage(anonClient(), festival.id, { onlyArtistIds: [] })).toEqual({ artists: [], total: 0 });
  });

  it("fetches every picked artist even beyond one page", async () => {
    const { festival, artistIds } = await bigFestival(620);
    const artists = await getLineupArtistsByIds(anonClient(), festival.id, artistIds);
    expect(artists).toHaveLength(620);
  });

  it("lists festival days and loads a single day, across more than one page of rows", async () => {
    const { festival } = await bigFestival(3300);
    expect(await getFestivalDays(anonClient(), festival.id)).toEqual(["2027-06-25", "2027-06-26", "2027-06-27"]);
    const day = await getDayPerformances(anonClient(), festival, "2027-06-26");
    expect(day).toHaveLength(1100);
    expect(day.every((p) => p.startsAt.toISOString().startsWith("2027-06-26"))).toBe(true);
  });

  it("keeps after-midnight sets on the previous festival day", async () => {
    const owner = await createUser();
    const festival = await createFestival(owner);
    const name = `Late ${uniq()}`;
    await applyLineupChange(owner.client, festival.id, {
      kind: "add_performance",
      artistName: name,
      startsAt: "2027-06-27T00:30:00Z", // 01:30 BST
      endsAt: "2027-06-27T02:00:00Z",
    });
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: `Tba ${uniq()}` });
    expect(await getFestivalDays(anonClient(), festival.id)).toEqual(["2027-06-26"]);
    expect((await getDayPerformances(anonClient(), festival, "2027-06-26")).map((p) => p.artistName)).toEqual([name]);
    expect(await getUnscheduledArtistNames(anonClient(), festival.id)).toHaveLength(1);
  });

  it("loads only the performances asked for", async () => {
    const owner = await createUser();
    const festival = await createFestival(owner);
    const { performanceId } = await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: `One ${uniq()}` });
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: `Two ${uniq()}` });
    const found = await getPerformancesByIds(anonClient(), festival.id, [performanceId!]);
    expect([...found.keys()]).toEqual([performanceId]);
  });

  it("suggests only lineup artists the signed-in user follows", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const festival = await createFestival(user);
    const suffix = uniq();
    await applyLineupChange(user.client, festival.id, { kind: "add_performance", artistName: `The Followed ${suffix}` });
    await applyLineupChange(user.client, festival.id, { kind: "add_performance", artistName: `Unknown ${suffix}` });

    const admin = adminClient();
    await saveSpotifyConnection(
      admin,
      user.id,
      { accessToken: "a", refreshToken: null, expiresAt: new Date(Date.now() + 3600_000), scope: "" },
      "u",
      { encryptionKey: Buffer.alloc(32, 1) },
    );
    await syncLikedArtists(admin, user.id, {
      provider: "spotify",
      listLikedArtists: async () => [
        { providerArtistId: "1", name: `Followed ${suffix}` },
        { providerArtistId: "2", name: `Not Playing ${suffix}` },
      ],
    });

    const liked = await getLikedLineupArtists(user.client, festival.id);
    expect(liked.map((l) => [l.artist.name, l.providers])).toEqual([[`The Followed ${suffix}`, ["spotify"]]]);
    expect(await getLikedLineupArtists(other.client, festival.id)).toEqual([]);
    expect((await anonClient().rpc("festival_liked_artists", { fid: festival.id })).error).not.toBeNull();
  });
});
