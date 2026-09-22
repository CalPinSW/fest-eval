import "server-only";
import { siteUrl } from "@/lib/env";
import type { MusicConfig } from "@/lib/data/music";
import type { MusicProviderId } from "./types";

export function musicConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MusicConfig {
  return {
    spotify:
      env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET
        ? {
            clientId: env.SPOTIFY_CLIENT_ID,
            clientSecret: env.SPOTIFY_CLIENT_SECRET,
            redirectUri: `${siteUrl()}/api/connect/spotify/callback`,
          }
        : null,
    apple:
      env.APPLE_MUSIC_TEAM_ID && env.APPLE_MUSIC_KEY_ID && env.APPLE_MUSIC_PRIVATE_KEY
        ? { teamId: env.APPLE_MUSIC_TEAM_ID, keyId: env.APPLE_MUSIC_KEY_ID, privateKey: env.APPLE_MUSIC_PRIVATE_KEY }
        : null,
  };
}

export function configuredProviders(config: MusicConfig = musicConfigFromEnv()): MusicProviderId[] {
  return [...(config.spotify ? (["spotify"] as const) : []), ...(config.apple ? (["apple_music"] as const) : [])];
}
