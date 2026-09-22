import { normalizeArtistName } from "@/lib/domain/artist-name";
import { chunk, MusicApiError, requestJson, type RequestOptions } from "./http";
import type { LikedArtist, MusicProviderClient, ProviderArtist, ProviderTrack } from "./types";

/**
 * Spotify Web API client, written against the post-February-2026 API:
 * no artist top-tracks endpoint, playlists created via POST /me/playlists,
 * items added via /playlists/{id}/items, and search capped at 10 results.
 */

const API = "https://api.spotify.com/v1";
const ACCOUNTS = "https://accounts.spotify.com";
export const SPOTIFY_SCOPES = [
  "user-follow-read",
  "user-top-read",
  "playlist-modify-private",
  "playlist-modify-public",
];
const SEARCH_PAGE_SIZE = 10;

export interface SpotifyAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

export function spotifyAuthorizeUrl(config: Pick<SpotifyAppConfig, "clientId" | "redirectUri">, state: string): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: config.redirectUri,
    state,
  });
  return `${ACCOUNTS}/authorize?${query}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(
  config: SpotifyAppConfig,
  params: Record<string, string>,
  options: RequestOptions & { now?: Date },
): Promise<SpotifyTokens> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const body = await requestJson<TokenResponse>(
    `${ACCOUNTS}/api/token`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    },
    options,
  );
  const now = options.now ?? new Date();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(now.getTime() + body.expires_in * 1000),
    scope: body.scope ?? "",
  };
}

export function exchangeSpotifyCode(
  config: SpotifyAppConfig,
  code: string,
  options: RequestOptions & { now?: Date } = {},
): Promise<SpotifyTokens> {
  return tokenRequest(config, { grant_type: "authorization_code", code, redirect_uri: config.redirectUri }, options);
}

/** Spotify may or may not rotate the refresh token; keep the old one if not. */
export async function refreshSpotifyToken(
  config: SpotifyAppConfig,
  refreshToken: string,
  options: RequestOptions & { now?: Date } = {},
): Promise<SpotifyTokens> {
  const tokens = await tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken }, options);
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

interface SpotifyArtistObject {
  id: string;
  name: string;
}

interface SpotifyTrackObject {
  id: string;
  name: string;
  uri: string;
  artists: SpotifyArtistObject[];
}

/** Quote a name for Spotify's field-filter search syntax. */
function searchTerm(name: string): string {
  return `artist:"${name.replace(/"/g, "")}"`;
}

export function createSpotifyClient(accessToken: string, options: RequestOptions = {}) {
  const get = <T>(path: string) =>
    requestJson<T>(path.startsWith("http") ? path : `${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } }, options);
  const send = <T>(method: string, path: string, body: unknown) =>
    requestJson<T>(
      `${API}${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      options,
    );

  async function getCurrentUser(): Promise<{ id: string; displayName: string | null }> {
    const me = await get<{ id: string; display_name: string | null }>("/me");
    return { id: me.id, displayName: me.display_name };
  }

  async function listFollowedArtists(): Promise<LikedArtist[]> {
    const artists: LikedArtist[] = [];
    let url: string | null = "/me/following?type=artist&limit=50";
    for (let page = 0; url && page < 40; page++) {
      const body: { artists: { items: SpotifyArtistObject[]; next: string | null } } = await get(url);
      artists.push(...body.artists.items.map((a) => ({ providerArtistId: a.id, name: a.name })));
      url = body.artists.next;
    }
    return artists;
  }

  async function listTopArtists(): Promise<LikedArtist[]> {
    const artists: LikedArtist[] = [];
    for (const range of ["medium_term", "long_term"]) {
      const body = await get<{ items: SpotifyArtistObject[] }>(`/me/top/artists?limit=50&time_range=${range}`);
      artists.push(...body.items.map((a) => ({ providerArtistId: a.id, name: a.name })));
    }
    return artists;
  }

  const client: MusicProviderClient & { getCurrentUser: typeof getCurrentUser } = {
    provider: "spotify",
    getCurrentUser,

    async listLikedArtists() {
      const all = [...(await listFollowedArtists()), ...(await listTopArtists())];
      const byId = new Map(all.map((a) => [a.providerArtistId, a]));
      return [...byId.values()];
    },

    async findArtist(name) {
      const query = new URLSearchParams({ q: searchTerm(name), type: "artist", limit: "5" });
      const body = await get<{ artists: { items: SpotifyArtistObject[] } }>(`/search?${query}`);
      const wanted = normalizeArtistName(name);
      const match = body.artists.items.find((a) => normalizeArtistName(a.name) === wanted);
      return match ? { id: match.id, name: match.name } : null;
    },

    async topTracks(artist: ProviderArtist, limit: number) {
      // No top-tracks endpoint any more: search the artist's tracks (Spotify
      // orders search results by relevance/popularity) and keep only tracks
      // they actually play on.
      const tracks: ProviderTrack[] = [];
      const seenNames = new Set<string>();
      for (let offset = 0; tracks.length < limit && offset < 50; offset += SEARCH_PAGE_SIZE) {
        const query = new URLSearchParams({
          q: searchTerm(artist.name),
          type: "track",
          limit: String(SEARCH_PAGE_SIZE),
          offset: String(offset),
        });
        const body = await get<{ tracks: { items: SpotifyTrackObject[]; next: string | null } }>(`/search?${query}`);
        for (const track of body.tracks.items) {
          if (!track.artists.some((a) => a.id === artist.id)) continue;
          // Skip re-releases and live versions of songs we already have.
          const key = normalizeArtistName(track.name.replace(/\s+-\s+.*$/, ""));
          if (seenNames.has(key)) continue;
          seenNames.add(key);
          tracks.push({ id: track.uri, name: track.name });
          if (tracks.length === limit) break;
        }
        if (!body.tracks.next) break;
      }
      return tracks;
    },

    async savePlaylist({ name, description, trackIds, existingPlaylistId }) {
      const batches = chunk(trackIds, 100);

      if (existingPlaylistId) {
        try {
          await send("PUT", `/playlists/${existingPlaylistId}/items`, { uris: batches[0] ?? [] });
          for (const batch of batches.slice(1)) await send("POST", `/playlists/${existingPlaylistId}/items`, { uris: batch });
          return { id: existingPlaylistId, url: `https://open.spotify.com/playlist/${existingPlaylistId}` };
        } catch (error) {
          // The user deleted the playlist: fall through and make a new one.
          if (!(error instanceof MusicApiError) || (error.status !== 404 && error.status !== 403)) throw error;
        }
      }

      const created = await send<{ id: string; external_urls?: { spotify?: string } }>("POST", "/me/playlists", {
        name,
        description,
        public: false,
      });
      for (const batch of batches) await send("POST", `/playlists/${created.id}/items`, { uris: batch });
      return { id: created.id, url: created.external_urls?.spotify ?? `https://open.spotify.com/playlist/${created.id}` };
    },
  };

  return client;
}
