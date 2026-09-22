import { importPKCS8, SignJWT } from "jose";
import { normalizeArtistName } from "@/lib/domain/artist-name";
import { requestJson, type RequestOptions } from "./http";
import type { LikedArtist, MusicProviderClient } from "./types";

/**
 * Apple Music API client. Unlike Spotify there is no OAuth redirect: the
 * browser runs MusicKit JS with a developer token we sign, the user authorises
 * there, and MusicKit hands back a Music-User-Token that we store.
 */

const API = "https://api.music.apple.com";
const MAX_DEVELOPER_TOKEN_SECONDS = 15_777_000; // Apple's limit: 6 months.

export interface AppleMusicKeyConfig {
  teamId: string;
  keyId: string;
  /** Contents of the .p8 key file from the Apple Developer portal. */
  privateKey: string;
}

export async function createAppleDeveloperToken(
  config: AppleMusicKeyConfig,
  options: { now?: Date; ttlSeconds?: number; origin?: string } = {},
): Promise<string> {
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const ttl = Math.min(options.ttlSeconds ?? 12 * 3600, MAX_DEVELOPER_TOKEN_SECONDS);
  const key = await importPKCS8(config.privateKey.replace(/\\n/g, "\n"), "ES256");
  const jwt = new SignJWT(options.origin ? { origin: [options.origin] } : {})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl);
  return jwt.sign(key);
}

interface Resource<A> {
  id: string;
  type: string;
  attributes?: A;
}

interface Page<A> {
  data: Resource<A>[];
  next?: string;
}

export function createAppleMusicClient(
  auth: { developerToken: string; userToken: string; storefront: string },
  options: RequestOptions = {},
) {
  const headers = {
    Authorization: `Bearer ${auth.developerToken}`,
    "Music-User-Token": auth.userToken,
  };
  const get = <T>(path: string) => requestJson<T>(`${API}${path}`, { headers }, options);
  const storefront = encodeURIComponent(auth.storefront);

  const client: MusicProviderClient = {
    provider: "apple_music",

    async listLikedArtists() {
      const artists: LikedArtist[] = [];
      let path: string | undefined = "/v1/me/library/artists?limit=100";
      for (let page = 0; path && page < 50; page++) {
        const body: Page<{ name?: string }> = await get(path);
        for (const r of body.data) {
          if (r.attributes?.name) artists.push({ providerArtistId: r.id, name: r.attributes.name });
        }
        path = body.next;
      }
      return artists;
    },

    async findArtist(name) {
      const query = new URLSearchParams({ term: name, types: "artists", limit: "5" });
      const body = await get<{ results: { artists?: Page<{ name: string }> } }>(
        `/v1/catalog/${storefront}/search?${query}`,
      );
      const wanted = normalizeArtistName(name);
      const match = body.results.artists?.data.find((a) => a.attributes && normalizeArtistName(a.attributes.name) === wanted);
      return match?.attributes ? { id: match.id, name: match.attributes.name } : null;
    },

    async topTracks(artist, limit) {
      const body = await get<Page<{ name: string }>>(
        `/v1/catalog/${storefront}/artists/${encodeURIComponent(artist.id)}/view/top-songs?limit=${Math.min(limit, 20)}`,
      );
      return body.data.slice(0, limit).map((s) => ({ id: s.id, name: s.attributes?.name ?? "" }));
    },

    async savePlaylist({ name, description, trackIds }) {
      // Apple's API can add to a library playlist but not remove from one, so
      // every export creates a fresh playlist.
      const body = await requestJson<Page<unknown>>(
        `${API}/v1/me/library/playlists`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            attributes: { name, description },
            relationships: { tracks: { data: trackIds.map((id) => ({ id, type: "songs" })) } },
          }),
        },
        options,
      );
      const id = body.data[0]?.id;
      if (!id) throw new Error("Apple Music did not return the new playlist");
      return { id, url: `https://music.apple.com/library/playlist/${id}` };
    },
  };

  return client;
}

export async function fetchAppleStorefront(
  auth: { developerToken: string; userToken: string },
  options: RequestOptions = {},
): Promise<string> {
  const body = await requestJson<Page<unknown>>(
    `${API}/v1/me/storefront`,
    { headers: { Authorization: `Bearer ${auth.developerToken}`, "Music-User-Token": auth.userToken } },
    options,
  );
  return body.data[0]?.id ?? "us";
}
