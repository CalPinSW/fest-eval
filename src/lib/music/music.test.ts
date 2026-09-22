import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { suggestArtists } from "@/lib/domain/suggestions";
import { chunk, mapWithConcurrency, MusicApiError, requestJson } from "./http";
import { collectPlaylistTracks, orderPicks, type PlaylistPick } from "./playlist";
import { decryptToken, encryptToken, loadEncryptionKey } from "./token-crypto";

describe("token encryption", () => {
  const key = randomBytes(32);

  it("round-trips", () => {
    const secret = "BQD-spotify-access-token";
    const encrypted = encryptToken(secret, key);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(secret);
    expect(decryptToken(encrypted, key)).toBe(secret);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("rejects tampering and wrong keys", () => {
    const encrypted = encryptToken("secret", key);
    const parts = encrypted.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."), key)).toThrow();
    expect(() => decryptToken(encrypted, randomBytes(32))).toThrow();
    expect(() => decryptToken("plain-text", key)).toThrow(/Unrecognised/);
  });

  it("validates the configured key", () => {
    expect(() => loadEncryptionKey(undefined)).toThrow(/not set/);
    expect(() => loadEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(loadEncryptionKey(key.toString("base64"))).toEqual(key);
  });
});

describe("requestJson", () => {
  it("returns null for empty bodies", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await requestJson("https://x.test/a", {}, { fetch: fetchMock })).toBeNull();
  });

  it("gives up after the retry budget", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    const sleep = vi.fn(async () => {});
    await expect(requestJson("https://x.test/a", {}, { fetch: fetchMock, sleep, maxRetries: 2 })).rejects.toBeInstanceOf(
      MusicApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it("keeps non-JSON error bodies", async () => {
    const fetchMock = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    await expect(requestJson("https://x.test/a", { method: "POST" }, { fetch: fetchMock })).rejects.toMatchObject({
      status: 502,
      body: "bad gateway",
      message: "POST /a failed (502)",
    });
  });
});

describe("helpers", () => {
  it("chunks arrays", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it("maps with bounded concurrency, preserving order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([5, 1, 3, 2, 4], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(result).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });
});

describe("playlists", () => {
  const pick = (artistName: string, priority: 1 | 2 | 3 | 4 | 5, start: string | null = null): PlaylistPick => ({
    artistName,
    priority,
    firstStartsAt: start ? new Date(start) : null,
  });

  it("orders by priority, then set time, then name", () => {
    const ordered = orderPicks([
      pick("Zed", 3),
      pick("Late", 5, "2026-06-27T20:00:00Z"),
      pick("Early", 5, "2026-06-26T20:00:00Z"),
      pick("Alpha", 3),
      pick("Timed", 3, "2026-06-26T12:00:00Z"),
    ]);
    expect(ordered.map((p) => p.artistName)).toEqual(["Early", "Late", "Timed", "Alpha", "Zed"]);
  });

  it("collects more tracks for higher priorities and reports missing artists", async () => {
    const client = {
      findArtist: vi.fn(async (name: string) => (name === "Unknown" ? null : { id: name, name })),
      topTracks: vi.fn(async (artist: { id: string }, limit: number) =>
        Array.from({ length: limit }, (_, i) => ({ id: `${artist.id}-${i}`, name: `t${i}` })),
      ),
    };
    const result = await collectPlaylistTracks(client, [pick("Low", 1), pick("Unknown", 5), pick("High", 5)]);
    expect(result.trackIds).toEqual([...Array.from({ length: 10 }, (_, i) => `High-${i}`), "Low-0", "Low-1"]);
    expect(result.notFound).toEqual(["Unknown"]);
  });

  it("drops duplicate tracks shared by collaborating artists", async () => {
    const client = {
      findArtist: async (name: string) => ({ id: name, name }),
      topTracks: async () => [{ id: "shared", name: "Collab" }],
    };
    const result = await collectPlaylistTracks(client, [pick("A", 1), pick("B", 1)]);
    expect(result.trackIds).toEqual(["shared"]);
    expect(result.notFound).toEqual([]);
  });

  it("counts artists with no tracks as not found", async () => {
    const client = { findArtist: async (name: string) => ({ id: name, name }), topTracks: async () => [] };
    expect((await collectPlaylistTracks(client, [pick("Quiet", 2)])).notFound).toEqual(["Quiet"]);
  });
});

describe("suggestArtists", () => {
  const lineup = [
    { id: "1", name: "Wet Leg", normalizedName: "wet leg" },
    { id: "2", name: "Bicep", normalizedName: "bicep" },
    { id: "3", name: "Idles", normalizedName: "idles" },
  ];

  it("suggests liked, unpicked lineup artists with the services they came from", () => {
    const suggestions = suggestArtists(
      lineup,
      [
        { provider: "spotify", normalizedName: "wet leg" },
        { provider: "apple_music", normalizedName: "wet leg" },
        { provider: "spotify", normalizedName: "wet leg" },
        { provider: "spotify", normalizedName: "idles" },
        { provider: "spotify", normalizedName: "not playing" },
      ],
      ["3"],
    );
    expect(suggestions).toEqual([{ artist: lineup[0], providers: ["apple_music", "spotify"] }]);
  });

  it("returns nothing without liked artists", () => {
    expect(suggestArtists(lineup, [], [])).toEqual([]);
  });
});
