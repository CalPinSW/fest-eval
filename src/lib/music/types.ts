export const MUSIC_PROVIDERS = ["spotify", "apple_music"] as const;
export type MusicProviderId = (typeof MUSIC_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<MusicProviderId, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
};

export interface LikedArtist {
  providerArtistId: string;
  name: string;
}

export interface ProviderArtist {
  id: string;
  name: string;
}

export interface ProviderTrack {
  id: string;
  name: string;
}

export interface CreatedPlaylist {
  id: string;
  url: string | null;
}

/** What the app needs from a streaming service, whichever one it is. */
export interface MusicProviderClient {
  readonly provider: MusicProviderId;
  /** Artists the user follows or has in their library. */
  listLikedArtists(): Promise<LikedArtist[]>;
  /** The catalogue artist whose name matches, or null. */
  findArtist(name: string): Promise<ProviderArtist | null>;
  /** Popular tracks by the artist, most popular first. */
  topTracks(artist: ProviderArtist, limit: number): Promise<ProviderTrack[]>;
  /**
   * Create a playlist, or replace the tracks of `existingPlaylistId` when the
   * service supports it.
   */
  savePlaylist(input: {
    name: string;
    description: string;
    trackIds: string[];
    existingPlaylistId?: string | null;
  }): Promise<CreatedPlaylist>;
}
