import { normalizeArtistName } from "@/lib/domain/artist-name";
import type { Priority } from "@/lib/domain/priority";
import { createAppleDeveloperToken, createAppleMusicClient, type AppleMusicKeyConfig } from "@/lib/music/apple-music";
import { MusicApiError } from "@/lib/music/http";
import { collectPlaylistTracks } from "@/lib/music/playlist";
import { createSpotifyClient, refreshSpotifyToken, type SpotifyAppConfig, type SpotifyTokens } from "@/lib/music/spotify";
import { decryptToken, encryptToken } from "@/lib/music/token-crypto";
import type { MusicProviderClient, MusicProviderId } from "@/lib/music/types";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { check, UserFacingError } from "./errors";

/**
 * Streaming-service connections. Every function here takes the service-role
 * client because tokens live in a table clients cannot read. Callers must
 * pass a `userId` taken from a verified session.
 */

export interface MusicConfig {
  spotify: SpotifyAppConfig | null;
  apple: AppleMusicKeyConfig | null;
  encryptionKey?: Buffer;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface ConnectionStatus {
  provider: MusicProviderId;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  likedArtistCount: number;
}

export async function listConnections(admin: AppSupabaseClient, userId: string): Promise<ConnectionStatus[]> {
  const [connections, liked] = await Promise.all([
    admin.from("music_connections").select("provider, connected_at, last_synced_at").eq("user_id", userId),
    admin.from("liked_artists").select("provider").eq("user_id", userId),
  ]);
  const likedRows = check(liked, "load liked artists");
  return check(connections, "load connections").map((c) => ({
    provider: c.provider,
    connectedAt: new Date(c.connected_at),
    lastSyncedAt: c.last_synced_at ? new Date(c.last_synced_at) : null,
    likedArtistCount: likedRows.filter((l) => l.provider === c.provider).length,
  }));
}

export async function saveSpotifyConnection(
  admin: AppSupabaseClient,
  userId: string,
  tokens: SpotifyTokens,
  providerUserId: string,
  config: Pick<MusicConfig, "encryptionKey">,
) {
  check(
    await admin.from("music_connections").upsert({
      user_id: userId,
      provider: "spotify",
      provider_user_id: providerUserId,
      access_token: encryptToken(tokens.accessToken, config.encryptionKey),
      refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken, config.encryptionKey) : null,
      expires_at: tokens.expiresAt.toISOString(),
      connected_at: new Date().toISOString(),
    }),
    "save the Spotify connection",
  );
}

export async function saveAppleMusicConnection(
  admin: AppSupabaseClient,
  userId: string,
  userToken: string,
  storefront: string,
  config: Pick<MusicConfig, "encryptionKey">,
) {
  check(
    await admin.from("music_connections").upsert({
      user_id: userId,
      provider: "apple_music",
      access_token: encryptToken(userToken, config.encryptionKey),
      refresh_token: null,
      expires_at: null,
      storefront,
      connected_at: new Date().toISOString(),
    }),
    "save the Apple Music connection",
  );
}

export async function disconnect(admin: AppSupabaseClient, userId: string, provider: MusicProviderId) {
  check(await admin.from("liked_artists").delete().eq("user_id", userId).eq("provider", provider), "forget liked artists");
  check(await admin.from("music_connections").delete().eq("user_id", userId).eq("provider", provider), "disconnect");
}

const REFRESH_MARGIN_MS = 60_000;

/** A ready-to-use client for the user's connection, refreshing Spotify tokens as needed. */
export async function getProviderClient(
  admin: AppSupabaseClient,
  userId: string,
  provider: MusicProviderId,
  config: MusicConfig,
): Promise<MusicProviderClient> {
  const row = check(
    await admin
      .from("music_connections")
      .select("access_token, refresh_token, expires_at, storefront")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle(),
    "load the connection",
  );
  if (!row) throw new UserFacingError("Connect the service first.");
  const now = config.now?.() ?? new Date();

  if (provider === "spotify") {
    if (!config.spotify) throw new UserFacingError("Spotify isn't configured on this site.");
    let accessToken = decryptToken(row.access_token, config.encryptionKey);
    const expired = !row.expires_at || new Date(row.expires_at).getTime() - REFRESH_MARGIN_MS <= now.getTime();
    if (expired) {
      if (!row.refresh_token) throw new UserFacingError("Your Spotify connection expired. Please reconnect.");
      let tokens: SpotifyTokens;
      try {
        tokens = await refreshSpotifyToken(config.spotify, decryptToken(row.refresh_token, config.encryptionKey), {
          fetch: config.fetch,
          now,
        });
      } catch (error) {
        if (error instanceof MusicApiError && error.status === 400) {
          throw new UserFacingError("Spotify access was revoked. Please reconnect.");
        }
        throw error;
      }
      check(
        await admin
          .from("music_connections")
          .update({
            access_token: encryptToken(tokens.accessToken, config.encryptionKey),
            refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken, config.encryptionKey) : row.refresh_token,
            expires_at: tokens.expiresAt.toISOString(),
          })
          .eq("user_id", userId)
          .eq("provider", "spotify"),
        "refresh the Spotify connection",
      );
      accessToken = tokens.accessToken;
    }
    return createSpotifyClient(accessToken, { fetch: config.fetch });
  }

  if (!config.apple) throw new UserFacingError("Apple Music isn't configured on this site.");
  return createAppleMusicClient(
    {
      developerToken: await createAppleDeveloperToken(config.apple, { now }),
      userToken: decryptToken(row.access_token, config.encryptionKey),
      storefront: row.storefront ?? "us",
    },
    { fetch: config.fetch },
  );
}

/** Replace the stored liked artists for one provider with a fresh copy. */
export async function syncLikedArtists(
  admin: AppSupabaseClient,
  userId: string,
  client: Pick<MusicProviderClient, "provider" | "listLikedArtists">,
  now: Date = new Date(),
): Promise<number> {
  const artists = await client.listLikedArtists();
  const rows = artists.map((a) => ({
    user_id: userId,
    provider: client.provider,
    provider_artist_id: a.providerArtistId,
    name: a.name,
    normalized_name: normalizeArtistName(a.name),
    synced_at: now.toISOString(),
  }));

  check(await admin.from("liked_artists").delete().eq("user_id", userId).eq("provider", client.provider), "clear liked artists");
  for (let i = 0; i < rows.length; i += 500) {
    check(await admin.from("liked_artists").insert(rows.slice(i, i + 500)), "save liked artists");
  }
  check(
    await admin
      .from("music_connections")
      .update({ last_synced_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("provider", client.provider),
    "record the sync",
  );
  return rows.length;
}

/** Liked artists for the signed-in user (RLS: own rows only). */
export async function getLikedArtists(client: AppSupabaseClient) {
  const rows = check(await client.from("liked_artists").select("provider, normalized_name"), "load liked artists");
  return rows.map((r) => ({ provider: r.provider, normalizedName: r.normalized_name }));
}

export interface ExportResult {
  playlistUrl: string | null;
  trackCount: number;
  notFound: string[];
}

/** Build (or refresh) the user's playlist for a festival on one service. */
export async function exportFestivalPlaylist(
  admin: AppSupabaseClient,
  userId: string,
  festival: { id: string; name: string },
  client: MusicProviderClient,
  picks: { artistName: string; priority: Priority; firstStartsAt: Date | null }[],
): Promise<ExportResult> {
  if (picks.length === 0) throw new UserFacingError("Pick some artists first.");

  const { trackIds, notFound } = await collectPlaylistTracks(client, picks);
  if (trackIds.length === 0) throw new UserFacingError("None of your picks could be found on this service.");

  const previous = check(
    await admin
      .from("playlist_exports")
      .select("playlist_id")
      .eq("user_id", userId)
      .eq("festival_id", festival.id)
      .eq("provider", client.provider)
      .maybeSingle(),
    "look up your previous playlist",
  );

  const playlist = await client.savePlaylist({
    name: `${festival.name} picks`,
    description: `Artists I want to see at ${festival.name}, most wanted first.`,
    trackIds,
    existingPlaylistId: previous?.playlist_id ?? null,
  });

  check(
    await admin.from("playlist_exports").upsert({
      user_id: userId,
      festival_id: festival.id,
      provider: client.provider,
      playlist_id: playlist.id,
      playlist_url: playlist.url,
      track_count: trackIds.length,
      exported_at: new Date().toISOString(),
    }),
    "record the playlist",
  );

  return { playlistUrl: playlist.url, trackCount: trackIds.length, notFound };
}

export async function getPlaylistExports(client: AppSupabaseClient, festivalId: string) {
  return check(
    await client.from("playlist_exports").select("provider, playlist_url, track_count, exported_at").eq("festival_id", festivalId),
    "load playlists",
  );
}
