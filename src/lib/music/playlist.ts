import { tracksForPriority, type Priority } from "@/lib/domain/priority";
import { mapWithConcurrency } from "./http";
import type { MusicProviderClient } from "./types";

export interface PlaylistPick {
  artistName: string;
  priority: Priority;
  /** First performance, used to order artists of equal priority. */
  firstStartsAt: Date | null;
}

export interface PlaylistResult {
  trackIds: string[];
  /** Artists the service could not find, in the order they would have played. */
  notFound: string[];
}

/** Highest priority first; then by set time (unscheduled last); then by name. */
export function orderPicks(picks: PlaylistPick[]): PlaylistPick[] {
  return [...picks].sort(
    (a, b) =>
      b.priority - a.priority ||
      (a.firstStartsAt?.getTime() ?? Infinity) - (b.firstStartsAt?.getTime() ?? Infinity) ||
      a.artistName.localeCompare(b.artistName),
  );
}

/**
 * Collect tracks for a festival playlist: more tracks for higher-priority
 * artists, grouped by artist in priority order.
 */
export async function collectPlaylistTracks(
  client: Pick<MusicProviderClient, "findArtist" | "topTracks">,
  picks: PlaylistPick[],
  options: { concurrency?: number } = {},
): Promise<PlaylistResult> {
  const ordered = orderPicks(picks);
  const perArtist = await mapWithConcurrency(ordered, options.concurrency ?? 4, async (pick) => {
    const artist = await client.findArtist(pick.artistName);
    if (!artist) return null;
    return client.topTracks(artist, tracksForPriority(pick.priority));
  });

  const trackIds: string[] = [];
  const seen = new Set<string>();
  const notFound: string[] = [];
  perArtist.forEach((tracks, i) => {
    if (!tracks || tracks.length === 0) {
      notFound.push(ordered[i].artistName);
      return;
    }
    for (const t of tracks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      trackIds.push(t.id);
    }
  });
  return { trackIds, notFound };
}
