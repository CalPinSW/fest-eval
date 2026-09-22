import { describe, expect, it } from "vitest";
import { fakeFetch, json } from "./fake-fetch";
import { MusicApiError } from "./http";
import {
  createSpotifyClient,
  exchangeSpotifyCode,
  refreshSpotifyToken,
  SPOTIFY_SCOPES,
  spotifyAuthorizeUrl,
} from "./spotify";

const config = { clientId: "cid", clientSecret: "secret", redirectUri: "http://localhost:3000/api/connect/spotify/callback" };
const noSleep = { sleep: async () => {} };

describe("Spotify OAuth", () => {
  it("builds the authorize URL with scopes and state", () => {
    const url = new URL(spotifyAuthorizeUrl(config, "state-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      scope: SPOTIFY_SCOPES.join(" "),
      redirect_uri: config.redirectUri,
      state: "state-123",
    });
  });

  it("exchanges a code for tokens using client credentials", async () => {
    const { fetch, calls } = fakeFetch({
      "POST /api/token": () => json({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "user-follow-read" }),
    });
    const now = new Date("2026-06-01T00:00:00Z");
    const tokens = await exchangeSpotifyCode(config, "the-code", { fetch, now });
    expect(tokens).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: new Date("2026-06-01T01:00:00Z"),
      scope: "user-follow-read",
    });
    expect(calls[0].headers.get("Authorization")).toBe(`Basic ${Buffer.from("cid:secret").toString("base64")}`);
    expect(calls[0].body).toEqual({ grant_type: "authorization_code", code: "the-code", redirect_uri: config.redirectUri });
  });

  it("keeps the old refresh token when Spotify does not rotate it", async () => {
    const { fetch } = fakeFetch({ "POST /api/token": () => json({ access_token: "new", expires_in: 3600 }) });
    const tokens = await refreshSpotifyToken(config, "old-refresh", { fetch });
    expect(tokens.accessToken).toBe("new");
    expect(tokens.refreshToken).toBe("old-refresh");
  });

  it("surfaces token errors", async () => {
    const { fetch } = fakeFetch({ "POST /api/token": () => json({ error: "invalid_grant" }, { status: 400 }) });
    await expect(exchangeSpotifyCode(config, "bad", { fetch })).rejects.toMatchObject({ status: 400 });
  });
});

describe("Spotify client", () => {
  it("lists followed and top artists, following pagination and de-duplicating", async () => {
    const { fetch, calls } = fakeFetch({
      "GET /v1/me/following": [
        () =>
          json({
            artists: {
              items: [{ id: "1", name: "Bicep" }],
              next: "https://api.spotify.com/v1/me/following?type=artist&limit=50&after=1",
            },
          }),
        () => json({ artists: { items: [{ id: "2", name: "Björk" }], next: null } }),
      ],
      "GET /v1/me/top/artists": [
        () => json({ items: [{ id: "2", name: "Björk" }, { id: "3", name: "Idles" }] }),
        () => json({ items: [] }),
      ],
    });
    const client = createSpotifyClient("token", { fetch });
    const artists = await client.listLikedArtists();
    expect(artists.map((a) => a.name)).toEqual(["Bicep", "Björk", "Idles"]);
    expect(calls[0].headers.get("Authorization")).toBe("Bearer token");
    expect(calls[1].url.searchParams.get("after")).toBe("1");
  });

  it("finds an artist by normalised name", async () => {
    const { fetch, calls } = fakeFetch({
      "GET /v1/search": () =>
        json({ artists: { items: [{ id: "x", name: "Chemical Brothers Tribute" }, { id: "y", name: "The Chemical Brothers" }] } }),
    });
    const artist = await createSpotifyClient("t", { fetch }).findArtist('Chemical Brothers "DJ"');
    expect(artist).toBeNull();
    const found = await createSpotifyClient("t", { fetch }).findArtist("Chemical Brothers");
    expect(found).toEqual({ id: "y", name: "The Chemical Brothers" });
    expect(calls[0].url.searchParams.get("q")).toBe('artist:"Chemical Brothers DJ"');
    expect(calls[0].url.searchParams.get("type")).toBe("artist");
  });

  it("builds top tracks from search, keeping only the artist's own distinct songs", async () => {
    const track = (id: string, name: string, artistId = "a1") => ({
      id,
      name,
      uri: `spotify:track:${id}`,
      artists: [{ id: artistId, name: "X" }],
    });
    const { fetch, calls } = fakeFetch({
      "GET /v1/search": [
        () =>
          json({
            tracks: {
              items: [
                track("1", "Glue"),
                track("2", "Cover of Glue", "someone-else"),
                track("3", "Glue - Live at Glastonbury"),
                track("4", "Atlas"),
              ],
              next: "more",
            },
          }),
        () => json({ tracks: { items: [track("5", "Apricots"), track("6", "Saku")], next: null } }),
      ],
    });
    const tracks = await createSpotifyClient("t", { fetch }).topTracks({ id: "a1", name: "Bicep" }, 3);
    expect(tracks).toEqual([
      { id: "spotify:track:1", name: "Glue" },
      { id: "spotify:track:4", name: "Atlas" },
      { id: "spotify:track:5", name: "Apricots" },
    ]);
    expect(calls.map((c) => c.url.searchParams.get("offset"))).toEqual(["0", "10"]);
    expect(calls[0].url.searchParams.get("limit")).toBe("10");
  });

  it("stops paging when results run out", async () => {
    const { fetch, calls } = fakeFetch({ "GET /v1/search": () => json({ tracks: { items: [], next: null } }) });
    expect(await createSpotifyClient("t", { fetch }).topTracks({ id: "a", name: "A" }, 5)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("creates a private playlist and adds tracks in batches of 100", async () => {
    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:${i}`);
    const { fetch, calls } = fakeFetch({
      "POST /v1/me/playlists": () => json({ id: "pl1", external_urls: { spotify: "https://open.spotify.com/playlist/pl1" } }),
      "POST /v1/playlists/pl1/items": () => json({ snapshot_id: "s" }, { status: 201 }),
    });
    const result = await createSpotifyClient("t", { fetch }).savePlaylist({ name: "Fest", description: "d", trackIds: uris });
    expect(result).toEqual({ id: "pl1", url: "https://open.spotify.com/playlist/pl1" });
    expect(calls[0].body).toEqual({ name: "Fest", description: "d", public: false });
    expect((calls[1].body as { uris: string[] }).uris).toHaveLength(100);
    expect((calls[2].body as { uris: string[] }).uris).toHaveLength(50);
  });

  it("replaces the tracks of an existing playlist", async () => {
    const { fetch, calls } = fakeFetch({ "PUT /v1/playlists/old/items": () => json({ snapshot_id: "s" }) });
    const result = await createSpotifyClient("t", { fetch }).savePlaylist({
      name: "Fest",
      description: "d",
      trackIds: ["spotify:track:1"],
      existingPlaylistId: "old",
    });
    expect(result.id).toBe("old");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ uris: ["spotify:track:1"] });
  });

  it("creates a new playlist when the old one was deleted", async () => {
    const { fetch } = fakeFetch({
      "PUT /v1/playlists/old/items": () => json({ error: "not found" }, { status: 404 }),
      "POST /v1/me/playlists": () => json({ id: "new" }),
      "POST /v1/playlists/new/items": () => json({}),
    });
    const result = await createSpotifyClient("t", { fetch }).savePlaylist({
      name: "Fest",
      description: "d",
      trackIds: ["spotify:track:1"],
      existingPlaylistId: "old",
    });
    expect(result).toEqual({ id: "new", url: "https://open.spotify.com/playlist/new" });
  });

  it("does not swallow other errors when replacing", async () => {
    const { fetch } = fakeFetch({ "PUT /v1/playlists/old/items": () => json({}, { status: 500 }) });
    await expect(
      createSpotifyClient("t", { fetch }).savePlaylist({ name: "F", description: "", trackIds: [], existingPlaylistId: "old" }),
    ).rejects.toBeInstanceOf(MusicApiError);
  });

  it("retries after rate limiting", async () => {
    const { fetch, calls } = fakeFetch({
      "GET /v1/me": [
        () => new Response("", { status: 429, headers: { "Retry-After": "1" } }),
        () => json({ id: "me", display_name: "Me" }),
      ],
    });
    expect(await createSpotifyClient("t", { fetch, ...noSleep }).getCurrentUser()).toEqual({ id: "me", displayName: "Me" });
    expect(calls).toHaveLength(2);
  });
});
