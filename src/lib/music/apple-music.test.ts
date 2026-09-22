import { exportPKCS8, generateKeyPair, decodeProtectedHeader, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { createAppleDeveloperToken, createAppleMusicClient, fetchAppleStorefront } from "./apple-music";
import { fakeFetch, json } from "./fake-fetch";

const auth = { developerToken: "dev", userToken: "user", storefront: "gb" };

describe("createAppleDeveloperToken", () => {
  it("signs an ES256 JWT with the team as issuer and the key id in the header", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const now = new Date("2026-06-01T00:00:00Z");
    const token = await createAppleDeveloperToken(
      { teamId: "TEAM123", keyId: "KEY456", privateKey: pem.replace(/\n/g, "\\n") },
      { now, ttlSeconds: 3600, origin: "https://fest.example" },
    );
    expect(decodeProtectedHeader(token)).toEqual({ alg: "ES256", kid: "KEY456" });
    const { payload } = await jwtVerify(token, publicKey, { currentDate: now });
    expect(payload).toMatchObject({ iss: "TEAM123", iat: 1780272000, exp: 1780275600, origin: ["https://fest.example"] });
  });

  it("caps the lifetime at Apple's six-month maximum", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const now = new Date("2026-06-01T00:00:00Z");
    const token = await createAppleDeveloperToken(
      { teamId: "T", keyId: "K", privateKey: await exportPKCS8(privateKey) },
      { now, ttlSeconds: 10 ** 9 },
    );
    const { payload } = await jwtVerify(token, publicKey, { currentDate: now });
    expect(payload.exp! - payload.iat!).toBe(15_777_000);
  });
});

describe("Apple Music client", () => {
  it("sends developer and user tokens", async () => {
    const { fetch, calls } = fakeFetch({ "GET /v1/me/library/artists": () => json({ data: [] }) });
    await createAppleMusicClient(auth, { fetch }).listLikedArtists();
    expect(calls[0].headers.get("Authorization")).toBe("Bearer dev");
    expect(calls[0].headers.get("Music-User-Token")).toBe("user");
  });

  it("pages through library artists", async () => {
    const { fetch, calls } = fakeFetch({
      "GET /v1/me/library/artists": [
        () =>
          json({
            data: [{ id: "r.1", type: "library-artists", attributes: { name: "Fontaines D.C." } }, { id: "r.x", type: "library-artists" }],
            next: "/v1/me/library/artists?offset=100",
          }),
        () => json({ data: [{ id: "r.2", type: "library-artists", attributes: { name: "Wet Leg" } }] }),
      ],
    });
    const artists = await createAppleMusicClient(auth, { fetch }).listLikedArtists();
    expect(artists).toEqual([
      { providerArtistId: "r.1", name: "Fontaines D.C." },
      { providerArtistId: "r.2", name: "Wet Leg" },
    ]);
    expect(calls[1].url.searchParams.get("offset")).toBe("100");
  });

  it("finds catalogue artists in the user's storefront", async () => {
    const { fetch, calls } = fakeFetch({
      "GET /v1/catalog/gb/search": () =>
        json({ results: { artists: { data: [{ id: "99", type: "artists", attributes: { name: "Wet Leg" } }] } } }),
    });
    const client = createAppleMusicClient(auth, { fetch });
    expect(await client.findArtist("wet leg")).toEqual({ id: "99", name: "Wet Leg" });
    expect(await client.findArtist("Wet Legs")).toBeNull();
    expect(calls[0].url.searchParams.get("term")).toBe("wet leg");
  });

  it("returns null when search has no artists section", async () => {
    const { fetch } = fakeFetch({ "GET /v1/catalog/gb/search": () => json({ results: {} }) });
    expect(await createAppleMusicClient(auth, { fetch }).findArtist("x")).toBeNull();
  });

  it("gets top songs", async () => {
    const { fetch, calls } = fakeFetch({
      "GET /v1/catalog/gb/artists/99/view/top-songs": () =>
        json({ data: [{ id: "s1", type: "songs", attributes: { name: "Chaise Longue" } }, { id: "s2", type: "songs" }] }),
    });
    const tracks = await createAppleMusicClient(auth, { fetch }).topTracks({ id: "99", name: "Wet Leg" }, 1);
    expect(tracks).toEqual([{ id: "s1", name: "Chaise Longue" }]);
    expect(calls[0].url.searchParams.get("limit")).toBe("1");
  });

  it("creates a library playlist with the tracks", async () => {
    const { fetch, calls } = fakeFetch({
      "POST /v1/me/library/playlists": () => json({ data: [{ id: "p.abc", type: "library-playlists" }] }, { status: 201 }),
    });
    const result = await createAppleMusicClient(auth, { fetch }).savePlaylist({
      name: "Fest",
      description: "Picks",
      trackIds: ["s1", "s2"],
      existingPlaylistId: "ignored",
    });
    expect(result).toEqual({ id: "p.abc", url: "https://music.apple.com/library/playlist/p.abc" });
    expect(calls[0].body).toEqual({
      attributes: { name: "Fest", description: "Picks" },
      relationships: { tracks: { data: [{ id: "s1", type: "songs" }, { id: "s2", type: "songs" }] } },
    });
  });

  it("fails clearly if no playlist comes back", async () => {
    const { fetch } = fakeFetch({ "POST /v1/me/library/playlists": () => json({ data: [] }) });
    await expect(
      createAppleMusicClient(auth, { fetch }).savePlaylist({ name: "F", description: "", trackIds: [] }),
    ).rejects.toThrow(/did not return/);
  });

  it("reads the storefront, defaulting to us", async () => {
    const { fetch } = fakeFetch({
      "GET /v1/me/storefront": [() => json({ data: [{ id: "gb", type: "storefronts" }] }), () => json({ data: [] })],
    });
    expect(await fetchAppleStorefront(auth, { fetch })).toBe("gb");
    expect(await fetchAppleStorefront(auth, { fetch })).toBe("us");
  });
});
