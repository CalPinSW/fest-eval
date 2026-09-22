import type { MusicProviderId } from "@/lib/music/types";

export interface LineupArtist {
  id: string;
  name: string;
  normalizedName: string;
}

export interface LikedArtistRecord {
  provider: MusicProviderId;
  normalizedName: string;
}

export interface ArtistSuggestion {
  artist: LineupArtist;
  providers: MusicProviderId[];
}

/**
 * Artists on the lineup that the user follows (or has in their library) on a
 * connected service, excluding ones they have already picked.
 */
export function suggestArtists(
  lineup: LineupArtist[],
  liked: LikedArtistRecord[],
  pickedArtistIds: Iterable<string>,
): ArtistSuggestion[] {
  const picked = new Set(pickedArtistIds);
  const providersByName = new Map<string, Set<MusicProviderId>>();
  for (const l of liked) {
    if (!providersByName.has(l.normalizedName)) providersByName.set(l.normalizedName, new Set());
    providersByName.get(l.normalizedName)!.add(l.provider);
  }

  return lineup
    .filter((a) => !picked.has(a.id) && providersByName.has(a.normalizedName))
    .map((artist) => ({ artist, providers: [...providersByName.get(artist.normalizedName)!].sort() }))
    .sort((a, b) => a.artist.name.localeCompare(b.artist.name));
}
