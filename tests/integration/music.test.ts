import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { applyLineupChange } from "@/lib/data/lineup";
import {
  disconnect,
  exportFestivalPlaylist,
  getLikedArtists,
  getPlaylistExports,
  getProviderClient,
  listConnections,
  saveAppleMusicConnection,
  saveSpotifyConnection,
  syncLikedArtists,
  type MusicConfig,
} from "@/lib/data/music";
import { fakeFetch, json } from "@/lib/music/fake-fetch";
import { decryptToken } from "@/lib/music/token-crypto";
import type { MusicProviderClient } from "@/lib/music/types";
import { adminClient, createFestival, createUser } from "./helpers";

const encryptionKey = randomBytes(32);
const spotify = { clientId: "cid", clientSecret: "secret", redirectUri: "http://localhost/cb" };

function fakeProvider(overrides: Partial<MusicProviderClient> = {}): MusicProviderClient {
  return {
    provider: "spotify",
    listLikedArtists: async () => [],
    findArtist: async (name) => ({ id: name, name }),
    topTracks: async (artist, limit) => Array.from({ length: limit }, (_, i) => ({ id: `${artist.id}:${i}`, name: `t${i}` })),
    savePlaylist: vi.fn(async ({ existingPlaylistId }) => ({
      id: existingPlaylistId ?? "playlist-1",
      url: `https://open.spotify.com/playlist/${existingPlaylistId ?? "playlist-1"}`,
    })),
    ...overrides,
  };
}

describe("streaming connections", () => {
  it("stores tokens encrypted and never exposes them to users", async () => {
    const user = await createUser();
    const admin = adminClient();
    await saveSpotifyConnection(
      admin,
      user.id,
      { accessToken: "access-abc", refreshToken: "refresh-xyz", expiresAt: new Date(Date.now() + 3600_000), scope: "" },
      "spotify-user",
      { encryptionKey },
    );

    const { data: row } = await admin.from("music_connections").select("*").eq("user_id", user.id).single();
    expect(row!.access_token).not.toContain("access-abc");
    expect(decryptToken(row!.access_token, encryptionKey)).toBe("access-abc");
    expect(decryptToken(row!.refresh_token!, encryptionKey)).toBe("refresh-xyz");

    const direct = await user.client.from("music_connections").select("*");
    expect(direct.error?.message).toMatch(/permission denied/);

    expect(await listConnections(admin, user.id)).toMatchObject([{ provider: "spotify", lastSyncedAt: null, likedArtistCount: 0 }]);
  });

  it("refreshes an expired Spotify token and saves the new one", async () => {
    const user = await createUser();
    const admin = adminClient();
    const now = new Date("2026-06-01T12:00:00Z");
    await saveSpotifyConnection(
      admin,
      user.id,
      { accessToken: "stale", refreshToken: "refresh-1", expiresAt: new Date(now.getTime() - 1000), scope: "" },
      "spotify-user",
      { encryptionKey },
    );

    const { fetch, calls } = fakeFetch({
      "POST /api/token": () => json({ access_token: "fresh", refresh_token: "refresh-2", expires_in: 3600 }),
      "GET /v1/me/following": () => json({ artists: { items: [], next: null } }),
      "GET /v1/me/top/artists": () => json({ items: [] }),
    });
    const config: MusicConfig = { spotify, apple: null, encryptionKey, fetch, now: () => now };
    const client = await getProviderClient(admin, user.id, "spotify", config);
    await client.listLikedArtists();

    expect(calls[0].body).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh-1" });
    expect(calls[1].headers.get("Authorization")).toBe("Bearer fresh");
    const { data: row } = await admin.from("music_connections").select("*").eq("user_id", user.id).single();
    expect(decryptToken(row!.access_token, encryptionKey)).toBe("fresh");
    expect(decryptToken(row!.refresh_token!, encryptionKey)).toBe("refresh-2");
    expect(row!.expires_at).toBe("2026-06-01T13:00:00+00:00");
  });

  it("uses a valid token without refreshing", async () => {
    const user = await createUser();
    const admin = adminClient();
    await saveSpotifyConnection(
      admin,
      user.id,
      { accessToken: "valid", refreshToken: "r", expiresAt: new Date(Date.now() + 3600_000), scope: "" },
      "u",
      { encryptionKey },
    );
    const { fetch, calls } = fakeFetch({ "GET /v1/search": () => json({ artists: { items: [] } }) });
    const client = await getProviderClient(admin, user.id, "spotify", { spotify, apple: null, encryptionKey, fetch });
    await client.findArtist("x");
    expect(calls.map((c) => c.url.pathname)).toEqual(["/v1/search"]);
  });

  it("asks the user to reconnect when Spotify revokes access", async () => {
    const user = await createUser();
    const admin = adminClient();
    await saveSpotifyConnection(
      admin,
      user.id,
      { accessToken: "a", refreshToken: "revoked", expiresAt: new Date(0), scope: "" },
      "u",
      { encryptionKey },
    );
    const { fetch } = fakeFetch({ "POST /api/token": () => json({ error: "invalid_grant" }, { status: 400 }) });
    await expect(getProviderClient(admin, user.id, "spotify", { spotify, apple: null, encryptionKey, fetch })).rejects.toThrow(
      /reconnect/,
    );
  });

  it("explains when a service is not connected or not configured", async () => {
    const user = await createUser();
    const admin = adminClient();
    await expect(getProviderClient(admin, user.id, "spotify", { spotify, apple: null, encryptionKey })).rejects.toThrow(
      /Connect the service first/,
    );
    await saveAppleMusicConnection(admin, user.id, "music-user-token", "gb", { encryptionKey });
    await expect(getProviderClient(admin, user.id, "apple_music", { spotify, apple: null, encryptionKey })).rejects.toThrow(
      /isn't configured/,
    );
  });

  it("syncs liked artists, visible only to their owner, and clears them on disconnect", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const admin = adminClient();
    await saveSpotifyConnection(
      admin,
      user.id,
      { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3600_000), scope: "" },
      "u",
      { encryptionKey },
    );

    const provider = fakeProvider({
      listLikedArtists: async () => [
        { providerArtistId: "1", name: "Björk" },
        { providerArtistId: "2", name: "The Cure" },
      ],
    });
    expect(await syncLikedArtists(admin, user.id, provider)).toBe(2);
    expect(await syncLikedArtists(admin, user.id, provider)).toBe(2); // replaces, not appends

    expect((await getLikedArtists(user.client)).map((a) => a.normalizedName).sort()).toEqual(["bjork", "cure"]);
    expect(await getLikedArtists(other.client)).toEqual([]);
    const [status] = await listConnections(admin, user.id);
    expect(status.likedArtistCount).toBe(2);
    expect(status.lastSyncedAt).not.toBeNull();

    const forged = await user.client
      .from("liked_artists")
      .insert({ user_id: user.id, provider: "spotify", provider_artist_id: "x", name: "x", normalized_name: "x" });
    expect(forged.error).not.toBeNull();

    await disconnect(admin, user.id, "spotify");
    expect(await getLikedArtists(user.client)).toEqual([]);
    expect(await listConnections(admin, user.id)).toEqual([]);
  });

  it("exports a playlist and updates the same one next time", async () => {
    const user = await createUser();
    const admin = adminClient();
    const festival = await createFestival();
    const provider = fakeProvider();

    await expect(exportFestivalPlaylist(admin, user.id, festival, provider, [])).rejects.toThrow(/Pick some artists/);

    const picks = [
      { artistName: "Low", priority: 1 as const, firstStartsAt: null },
      { artistName: "High", priority: 5 as const, firstStartsAt: null },
    ];
    const first = await exportFestivalPlaylist(admin, user.id, festival, provider, picks);
    expect(first).toEqual({ playlistUrl: "https://open.spotify.com/playlist/playlist-1", trackCount: 12, notFound: [] });
    expect(provider.savePlaylist).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: `${festival.name} picks`, existingPlaylistId: null }),
    );

    await exportFestivalPlaylist(admin, user.id, festival, provider, picks);
    expect(provider.savePlaylist).toHaveBeenLastCalledWith(expect.objectContaining({ existingPlaylistId: "playlist-1" }));

    const exports = await getPlaylistExports(user.client, festival.id);
    expect(exports).toMatchObject([{ provider: "spotify", track_count: 12 }]);
  });

  it("fails clearly when no picks can be found on the service", async () => {
    const user = await createUser();
    const festival = await createFestival(user);
    await applyLineupChange(user.client, festival.id, { kind: "add_performance", artistName: "Obscure" });
    const provider = fakeProvider({ findArtist: async () => null });
    await expect(
      exportFestivalPlaylist(adminClient(), user.id, festival, provider, [
        { artistName: "Obscure", priority: 3, firstStartsAt: null },
      ]),
    ).rejects.toThrow(/None of your picks/);
  });
});
